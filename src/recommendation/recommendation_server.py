#!/usr/bin/python

# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0


# Python
import os
import random
from concurrent import futures

# Pip
import grpc
from opentelemetry import trace, metrics
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import (
    OTLPLogExporter,
)
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource

from openfeature import api
from openfeature.contrib.provider.flagd import FlagdProvider

from openfeature.contrib.hook.opentelemetry import TracingHook

# Local
import logging
import demo_pb2
import demo_pb2_grpc
from grpc_health.v1 import health_pb2
from grpc_health.v1 import health_pb2_grpc

from metrics import (
    init_metrics
)

cached_ids = []
first_run = True

import external_recommender

EXTERNAL_URL = os.environ.get("EXTERNAL_RECOMMENDATION_URL", "")
API_TOKEN = os.environ.get("RECOMMENDATION_API_TOKEN", "")


def _md(context, key):
    for k, v in (context.invocation_metadata() or []):
        if k == key:
            return v
    return ""


def model_enabled():
    # Kill-switch, defaults ON: calling the model endpoint is the DEFAULT action whenever
    # it's configured. Absent/unreachable flagd -> still try the endpoint. Set the flagd
    # flag recommendationModelEnabled=off to force the random fallback.
    return api.get_client().get_boolean_value("recommendationModelEnabled", True)


# Allow for endpoint cold-start (scale-to-zero wake can take several seconds) before
# giving up — only fall back to random on a genuine error or non-response after this window.
MODEL_TIMEOUT_SECONDS = 20.0


def model_recommendations(product_ids, profile_id, member_id, store_id, viewed_product_id):
    """Returns (ids, ok). ok=False -> caller falls back. Wrapped in a client span."""
    with tracer.start_as_current_span("recommendation.model_call") as span:
        span.set_attribute("app.recommendation.endpoint", "synth_qsr-recommender")
        span.set_attribute("app.recommendation.store_id", str(store_id))
        span.set_attribute("app.recommendation.profile_id", str(profile_id))
        try:
            payload = external_recommender.build_request(
                profile_id, member_id, store_id, list(product_ids), viewed_product_id, 5)
            ids, personalized = external_recommender.fetch_recommendations(
                EXTERNAL_URL, API_TOKEN, payload, timeout=MODEL_TIMEOUT_SECONDS)
            span.set_attribute("app.recommendation.personalized", personalized)
            span.set_attribute("app.recommendation.model.count", len(ids))
            span.set_attribute("app.recommendation.cold_start", not personalized)
            return ids, len(ids) > 0
        except Exception as e:
            span.set_attribute("app.recommendation.fallback", True)
            span.record_exception(e)
            return [], False


class RecommendationService(demo_pb2_grpc.RecommendationServiceServicer):
    def ListRecommendations(self, request, context):
        profile_id = _md(context, "rec-profile-id")
        store_id = _md(context, "rec-store-id") or os.environ.get("RECOMMENDATION_DEFAULT_STORE_ID", "")
        member_id = _md(context, "rec-member-id")
        viewed_product_id = _md(context, "rec-viewed-product-id") or None

        prod_list = []
        used_model = False
        if EXTERNAL_URL and model_enabled():
            prod_list, used_model = model_recommendations(
                request.product_ids, profile_id, member_id, store_id, viewed_product_id)
        if not used_model:
            prod_list = get_product_list(request.product_ids)

        span = trace.get_current_span()
        span.set_attribute("app.products_recommended.count", len(prod_list))
        span.set_attribute("app.recommendation.source", "model" if used_model else "catalog")
        logger.info(f"Receive ListRecommendations for product ids:{prod_list}")

        # build and return response
        response = demo_pb2.ListRecommendationsResponse()
        response.product_ids.extend(prod_list)

        # Collect metrics for this service
        rec_svc_metrics["app_recommendations_counter"].add(len(prod_list), {'recommendation.type': 'model' if used_model else 'catalog'})

        return response

    def Check(self, request, context):
        return health_pb2.HealthCheckResponse(
            status=health_pb2.HealthCheckResponse.SERVING)

    def Watch(self, request, context):
        return health_pb2.HealthCheckResponse(
            status=health_pb2.HealthCheckResponse.UNIMPLEMENTED)


def get_product_list(request_product_ids):
    global first_run
    global cached_ids
    with tracer.start_as_current_span("get_product_list") as span:
        max_responses = 5

        # Formulate the list of characters to list of strings
        request_product_ids_str = ''.join(request_product_ids)
        request_product_ids = request_product_ids_str.split(',')

        # Feature flag scenario - Cache Leak
        if check_feature_flag("recommendationCacheFailure"):
            span.set_attribute("app.recommendation.cache_enabled", True)
            if random.random() < 0.5 or first_run:
                first_run = False
                span.set_attribute("app.cache_hit", False)
                logger.info("get_product_list: cache miss")
                cat_response = product_catalog_stub.ListProducts(demo_pb2.Empty())
                response_ids = [x.id for x in cat_response.products]
                cached_ids = cached_ids + response_ids
                cached_ids = cached_ids + cached_ids[:len(cached_ids) // 4]
                product_ids = cached_ids
            else:
                span.set_attribute("app.cache_hit", True)
                logger.info("get_product_list: cache hit")
                product_ids = cached_ids
        else:
            span.set_attribute("app.recommendation.cache_enabled", False)
            cat_response = product_catalog_stub.ListProducts(demo_pb2.Empty())
            product_ids = [x.id for x in cat_response.products]

        span.set_attribute("app.products.count", len(product_ids))

        # Create a filtered list of products excluding the products received as input
        filtered_products = list(set(product_ids) - set(request_product_ids))
        num_products = len(filtered_products)
        span.set_attribute("app.filtered_products.count", num_products)
        num_return = min(max_responses, num_products)

        # Sample list of indicies to return
        indices = random.sample(range(num_products), num_return)
        # Fetch product ids from indices
        prod_list = [filtered_products[i] for i in indices]

        span.set_attribute("app.filtered_products.list", prod_list)

        return prod_list


def must_map_env(key: str):
    value = os.environ.get(key)
    if value is None:
        raise Exception(f'{key} environment variable must be set')
    return value


def check_feature_flag(flag_name: str):
    # Initialize OpenFeature
    client = api.get_client()
    return client.get_boolean_value("recommendationCacheFailure", False)


if __name__ == "__main__":
    service_name = must_map_env('OTEL_SERVICE_NAME')
    api.set_provider(FlagdProvider(host=os.environ.get('FLAGD_HOST', 'flagd'), port=os.environ.get('FLAGD_PORT', 8013)))
    api.add_hooks([TracingHook()])

    # Initialize Traces and Metrics
    tracer = trace.get_tracer_provider().get_tracer(service_name)
    meter = metrics.get_meter_provider().get_meter(service_name)
    rec_svc_metrics = init_metrics(meter)

    # Initialize Logs
    logger_provider = LoggerProvider(
        resource=Resource.create(
            {
                'service.name': service_name,
            }
        ),
    )
    set_logger_provider(logger_provider)
    log_exporter = OTLPLogExporter(insecure=True)
    logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))
    handler = LoggingHandler(level=logging.NOTSET, logger_provider=logger_provider)

    # Attach OTLP handler to logger
    logger = logging.getLogger('main')
    logger.addHandler(handler)

    catalog_addr = must_map_env('PRODUCT_CATALOG_ADDR')
    pc_channel = grpc.insecure_channel(catalog_addr)
    product_catalog_stub = demo_pb2_grpc.ProductCatalogServiceStub(pc_channel)

    # Create gRPC server
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))

    # Add class to gRPC server
    service = RecommendationService()
    demo_pb2_grpc.add_RecommendationServiceServicer_to_server(service, server)
    health_pb2_grpc.add_HealthServicer_to_server(service, server)

    # Start server
    port = must_map_env('RECOMMENDATION_PORT')
    server.add_insecure_port(f'[::]:{port}')
    server.start()
    logger.info(f'Recommendation service started, listening on port {port}')
    server.wait_for_termination()
