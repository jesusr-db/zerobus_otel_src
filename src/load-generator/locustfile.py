#!/usr/bin/python

# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0

import json
import os
import random
import uuid
import logging

from locust import HttpUser, task, between
from locust_plugins.users.playwright import PlaywrightUser, pw, PageWithRetry, event

from opentelemetry import context, baggage, trace
from opentelemetry.context import Context
from opentelemetry.metrics import set_meter_provider
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.jinja2 import Jinja2Instrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.system_metrics import SystemMetricsInstrumentor
from opentelemetry.instrumentation.urllib3 import URLLib3Instrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource

from openfeature import api
from openfeature.contrib.provider.ofrep import OFREPProvider
from openfeature.contrib.hook.opentelemetry import TracingHook

from playwright.async_api import Route, Request

# Configure tracer provider first (needed for trace context in logs)
tracer_provider = TracerProvider()
trace.set_tracer_provider(tracer_provider)
tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(insecure=True)))

# Configure logger provider with the same resource
logger_provider = LoggerProvider()
set_logger_provider(logger_provider)

# Set up log exporter and processor
log_exporter = OTLPLogExporter(insecure=True)
logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))

# Create logging handler that will include trace context
handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)

# Configure root logger
root_logger = logging.getLogger()
root_logger.addHandler(handler)
root_logger.setLevel(logging.INFO)

# Configure metrics
metric_exporter = OTLPMetricExporter(insecure=True)
set_meter_provider(MeterProvider([PeriodicExportingMetricReader(metric_exporter)]))

# Instrument logging to automatically inject trace context
LoggingInstrumentor().instrument(set_logging_format=True)

# Instrumenting manually to avoid error with locust gevent monkey
Jinja2Instrumentor().instrument()
RequestsInstrumentor().instrument()
SystemMetricsInstrumentor().instrument()
URLLib3Instrumentor().instrument()

logging.info("Instrumentation complete - logs will now include trace context")

# Initialize Flagd provider
base_url = f"http://{os.environ.get('FLAGD_HOST', 'localhost')}:{os.environ.get('FLAGD_OFREP_PORT', 8016)}"
api.set_provider(OFREPProvider(base_url=base_url))
api.add_hooks([TracingHook()])

def get_flagd_value(FlagName):
    # Initialize OpenFeature
    client = api.get_client()
    return client.get_integer_value(FlagName, 0)

# PizzaTel: ad context categories = the pizza menu categories (match the ad service inventory
# + the storefront product categories). 'salads'/None exercise the non-targeted/random branch.
categories = [
    "pizza",
    "drinks",
    "sides",
    "desserts",
    "wings",
    "salads",
    None,
]

# PizzaTel: the product-catalog now serves pizza (numeric ids == synth menu_item_id).
# The original Astronomy Shop SKUs (OLJCESPC7Z telescope, etc.) no longer exist in the
# catalog, so carts built from them failed checkout with NOT_FOUND (~99% conversion loss).
# These are the live pizza catalog ids (src/product-catalog/products/products.json).
products = [
    "1", "2", "3", "4", "5", "6", "7", "8",
    "9", "10", "11", "12", "13", "14", "15", "16",
    "17", "18", "19", "20", "21", "22", "23", "24",
    "25", "26", "27", "28", "30", "31", "32", "33",
    "34", "35", "36", "37", "38", "39", "40", "41",
    "42", "43", "45", "46", "47", "48", "49", "50",
    "51", "52", "53", "54", "55", "56", "57", "58",
    "60", "61", "62", "63", "64", "65", "70", "71",
    "72", "73", "74", "75",
]

people_file = open('people.json')
people = json.load(people_file)

# PizzaTel: ALL synth customer profiles available (guest_order.profile_id, each with order
# history + a loyalty tier — same ids the "shop as" picker uses). Each rec/checkout task
# randomly picks one (random.choice samples uniformly), so generated traffic is spread
# across the full customer base, not concentrated on a handful.
customer_profiles = [
    {"profile_id": "748", "store_id": "4", "member_id": "748"},  # Curtis Guerrero (gold)
    {"profile_id": "16954", "store_id": "85", "member_id": "16954"},  # Michael Cook (silver)
    {"profile_id": "22227", "store_id": "112", "member_id": "22227"},  # Joseph Espinoza (silver)
    {"profile_id": "22491", "store_id": "113", "member_id": "22491"},  # Shaun Kelley (silver)
    {"profile_id": "45526", "store_id": "228", "member_id": "45526"},  # Cynthia Dunn (platinum)
    {"profile_id": "48532", "store_id": "243", "member_id": "48532"},  # Lindsey Edwards (silver)
    {"profile_id": "731", "store_id": "4", "member_id": "731"},  # Todd Gillespie (gold)
    {"profile_id": "4613", "store_id": "24", "member_id": "4613"},  # Michael Smith (silver)
    {"profile_id": "5761", "store_id": "29", "member_id": "5761"},  # Cassandra Davis (gold)
    {"profile_id": "10425", "store_id": "53", "member_id": "10425"},  # Leah Peterson (gold)
    {"profile_id": "14668", "store_id": "74", "member_id": "14668"},  # Mary Strong (silver)
    {"profile_id": "21696", "store_id": "109", "member_id": "21696"},  # Stephen Carter (platinum)
    {"profile_id": "22568", "store_id": "113", "member_id": "22568"},  # Brad Werner (silver)
    {"profile_id": "26227", "store_id": "132", "member_id": "26227"},  # Joyce Lopez (silver)
    {"profile_id": "45529", "store_id": "228", "member_id": "45529"},  # Sabrina Webster (platinum)
    {"profile_id": "45581", "store_id": "228", "member_id": "45581"},  # Justin Bates (gold)
    {"profile_id": "762", "store_id": "4", "member_id": "762"},  # Michael Bennett (platinum)
    {"profile_id": "2790", "store_id": "14", "member_id": "2790"},  # Michael Bates (gold)
    {"profile_id": "2976", "store_id": "15", "member_id": "2976"},  # Jose Spencer (platinum)
    {"profile_id": "2977", "store_id": "15", "member_id": "2977"},  # Ruben Carter (platinum)
    {"profile_id": "6840", "store_id": "35", "member_id": "6840"},  # Timothy Boone (silver)
    {"profile_id": "7734", "store_id": "39", "member_id": "7734"},  # Susan George (gold)
    {"profile_id": "10879", "store_id": "55", "member_id": "10879"},  # Colton Love (gold)
    {"profile_id": "10981", "store_id": "55", "member_id": "10981"},  # Allison Martinez (bronze)
    {"profile_id": "15010", "store_id": "76", "member_id": "15010"},  # Lisa Clark (silver)
    {"profile_id": "16732", "store_id": "84", "member_id": "16732"},  # Olivia Hawkins (gold)
    {"profile_id": "19543", "store_id": "98", "member_id": "19543"},  # Jason Yang (gold)
    {"profile_id": "22124", "store_id": "111", "member_id": "22124"},  # Ann Howell (platinum)
    {"profile_id": "22460", "store_id": "113", "member_id": "22460"},  # Stephanie Morgan (platinum)
    {"profile_id": "26938", "store_id": "135", "member_id": "26938"},  # Veronica Hughes (gold)
    {"profile_id": "28241", "store_id": "142", "member_id": "28241"},  # Michelle Wells (gold)
    {"profile_id": "28881", "store_id": "145", "member_id": "28881"},  # Rachel Gillespie (silver)
    {"profile_id": "30554", "store_id": "153", "member_id": "30554"},  # Jessica Hansen (bronze)
    {"profile_id": "48867", "store_id": "245", "member_id": "48867"},  # Ann Johnson (silver)
    {"profile_id": "421", "store_id": "3", "member_id": "421"},  # Rebecca George (platinum)
    {"profile_id": "688", "store_id": "4", "member_id": "688"},  # Nicholas Davis (bronze)
    {"profile_id": "4389", "store_id": "22", "member_id": "4389"},  # Joseph Webb (gold)
    {"profile_id": "6433", "store_id": "33", "member_id": "6433"},  # Joshua Dominguez (gold)
    {"profile_id": "6851", "store_id": "35", "member_id": "6851"},  # Jorge Hill (gold)
    {"profile_id": "6855", "store_id": "35", "member_id": "6855"},  # Darren Montoya (gold)
    {"profile_id": "7605", "store_id": "39", "member_id": "7605"},  # Jason Gill (silver)
    {"profile_id": "7672", "store_id": "39", "member_id": "7672"},  # Sarah Russell (silver)
    {"profile_id": "8986", "store_id": "45", "member_id": "8986"},  # Jesse Nelson (gold)
    {"profile_id": "9540", "store_id": "48", "member_id": "9540"},  # Rachel York (bronze)
    {"profile_id": "10143", "store_id": "51", "member_id": "10143"},  # Stephanie Guerrero (silver)
    {"profile_id": "10688", "store_id": "54", "member_id": "10688"},  # Michelle Burton (gold)
    {"profile_id": "10940", "store_id": "55", "member_id": "10940"},  # Jamie Riddle (gold)
    {"profile_id": "12497", "store_id": "63", "member_id": "12497"},  # Tyler Yoder (gold)
    {"profile_id": "19559", "store_id": "98", "member_id": "19559"},  # Seth Ray (gold)
    {"profile_id": "21109", "store_id": "106", "member_id": "21109"},  # Joseph Nguyen (bronze)
]

class WebsiteUser(HttpUser):
    wait_time = between(1, 10)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.tracer = trace.get_tracer(__name__)

    @task(1)
    def index(self):
        with self.tracer.start_as_current_span("user_index", context=Context()):
            logging.info("User accessing index page")
            self.client.get("/")

    @task(10)
    def browse_product(self):
        product = random.choice(products)
        with self.tracer.start_as_current_span("user_browse_product", context=Context(), attributes={"product.id": product}):
            logging.info(f"User browsing product: {product}")
            self.client.get("/api/products/" + product)

    @task(3)
    def get_recommendations(self):
        product = random.choice(products)
        customer = random.choice(customer_profiles)
        with self.tracer.start_as_current_span("user_get_recommendations", context=Context(), attributes={"product.id": product, "profile.id": customer["profile_id"]}):
            logging.info(f"User getting recommendations for product: {product} (profile {customer['profile_id']})")
            params = {
                "productIds": [product],
                "profileId": customer["profile_id"],
                "storeId": customer["store_id"],
                "memberId": customer["member_id"],
            }
            self.client.get("/api/recommendations", params=params)

    @task(3)
    def get_ads(self):
        category = random.choice(categories)
        with self.tracer.start_as_current_span("user_get_ads", context=Context(), attributes={"category": str(category)}):
            logging.info(f"User getting ads for category: {category}")
            params = {
                "contextKeys": [category],
            }
            self.client.get("/api/data/", params=params)

    @task(3)
    def view_cart(self):
        with self.tracer.start_as_current_span("user_view_cart", context=Context()):
            logging.info("User viewing cart")
            self.client.get("/api/cart")

    @task(2)
    def add_to_cart(self, user=""):
        if user == "":
            user = str(uuid.uuid1())
        product = random.choice(products)
        quantity = random.choice([1, 2, 3, 4, 5, 10])
        with self.tracer.start_as_current_span("user_add_to_cart", context=Context(), attributes={"user.id": user, "product.id": product, "quantity": quantity}):
            logging.info(f"User {user} adding {quantity} of product {product} to cart")
            self.client.get("/api/products/" + product)
            cart_item = {
                "item": {
                    "productId": product,
                    "quantity": quantity,
                },
                "userId": user,
            }
            self.client.post("/api/cart", json=cart_item)

    @task(1)
    def checkout(self):
        user = str(uuid.uuid1())
        customer = random.choice(customer_profiles)
        order_type = random.choice(["delivery", "carryout"])
        with self.tracer.start_as_current_span("user_checkout_single", context=Context(), attributes={"user.id": user, "order.store_id": customer["store_id"], "order.type": order_type}):
            self.add_to_cart(user=user)
            checkout_person = random.choice(people)
            checkout_person["userId"] = user
            self.client.post("/api/checkout", params={"storeId": customer["store_id"], "orderType": order_type}, json=checkout_person)
            logging.info(f"Checkout completed for user {user} (store {customer['store_id']}, {order_type})")

    @task(1)
    def checkout_multi(self):
        user = str(uuid.uuid1())
        customer = random.choice(customer_profiles)
        order_type = random.choice(["delivery", "carryout"])
        item_count = random.choice([2, 3, 4])
        with self.tracer.start_as_current_span("user_checkout_multi", context=Context(),
                                            attributes={"user.id": user, "item.count": item_count, "order.store_id": customer["store_id"], "order.type": order_type}):
            for i in range(item_count):
                self.add_to_cart(user=user)
            checkout_person = random.choice(people)
            checkout_person["userId"] = user
            self.client.post("/api/checkout", params={"storeId": customer["store_id"], "orderType": order_type}, json=checkout_person)
            logging.info(f"Multi-item checkout completed for user {user} (store {customer['store_id']}, {order_type})")

    @task(5)
    def flood_home(self):
        flood_count = get_flagd_value("loadGeneratorFloodHomepage")
        if flood_count > 0:
            with self.tracer.start_as_current_span("user_flood_home",  context=Context(), attributes={"flood.count": flood_count}):
                logging.info(f"User flooding homepage {flood_count} times")
                for _ in range(0, flood_count):
                    self.client.get("/")

    def on_start(self):
        with self.tracer.start_as_current_span("user_session_start", context=Context()):
            session_id = str(uuid.uuid4())
            logging.info(f"Starting user session: {session_id}")
            ctx = baggage.set_baggage("session.id", session_id)
            ctx = baggage.set_baggage("synthetic_request", "true", context=ctx)
            context.attach(ctx)
            self.index()


browser_traffic_enabled = os.environ.get("LOCUST_BROWSER_TRAFFIC_ENABLED", "").lower() in ("true", "yes", "on")

if browser_traffic_enabled:
    class WebsiteBrowserUser(PlaywrightUser):
        headless = True  # to use a headless browser, without a GUI

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.tracer = trace.get_tracer(__name__)

        @task
        @pw
        async def open_cart_page_and_change_currency(self, page: PageWithRetry):
            with self.tracer.start_as_current_span("browser_change_currency", context=Context()):
                try:
                    page.on("console", lambda msg: print(msg.text))
                    await page.route('**/*', add_baggage_header)
                    await page.goto("/cart", wait_until="domcontentloaded")
                    await page.select_option('[name="currency_code"]', 'CHF')
                    await page.wait_for_timeout(2000)  # giving the browser time to export the traces
                    logging.info("Currency changed to CHF")
                except Exception as e:
                    logging.error(f"Error in change currency task: {str(e)}")

        @task
        @pw
        async def add_product_to_cart(self, page: PageWithRetry):
            with self.tracer.start_as_current_span("browser_add_to_cart", context=Context()):
                try:
                    page.on("console", lambda msg: print(msg.text))
                    await page.route('**/*', add_baggage_header)
                    await page.goto("/", wait_until="domcontentloaded")
                    await page.click('p:has-text("Roof Binoculars")')
                    await page.wait_for_load_state("domcontentloaded")
                    await page.click('button:has-text("Add To Cart")')
                    await page.wait_for_load_state("domcontentloaded")
                    await page.wait_for_timeout(2000)  # giving the browser time to export the traces
                    logging.info("Product added to cart successfully")
                except Exception as e:
                    logging.error(f"Error in add to cart task: {str(e)}")

async def add_baggage_header(route: Route, request: Request):
    existing_baggage = request.headers.get('baggage', '')
    headers = {
        **request.headers,
        'baggage': ', '.join(filter(None, (existing_baggage, 'synthetic_request=true')))
    }
    await route.continue_(headers=headers)
