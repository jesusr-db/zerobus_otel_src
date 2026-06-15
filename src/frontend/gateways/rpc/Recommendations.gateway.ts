// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ChannelCredentials, Metadata } from '@grpc/grpc-js';
import { ListRecommendationsResponse, RecommendationServiceClient } from '../../protos/demo';

const { RECOMMENDATION_ADDR = '' } = process.env;

const client = new RecommendationServiceClient(RECOMMENDATION_ADDR, ChannelCredentials.createInsecure());

const RecommendationsGateway = () => ({
  listRecommendations(
    userId: string,
    productIds: string[],
    ctx?: { profileId?: string; storeId?: string; memberId?: string; viewedProductId?: string }
  ) {
    const metadata = new Metadata();
    if (ctx?.profileId) metadata.set('rec-profile-id', ctx.profileId);
    if (ctx?.storeId) metadata.set('rec-store-id', ctx.storeId);
    if (ctx?.memberId) metadata.set('rec-member-id', ctx.memberId);
    if (ctx?.viewedProductId) metadata.set('rec-viewed-product-id', ctx.viewedProductId);
    return new Promise<ListRecommendationsResponse>((resolve, reject) =>
      client.listRecommendations({ userId, productIds }, metadata, (error, response) =>
        error ? reject(error) : resolve(response)
      )
    );
  },
});

export default RecommendationsGateway();
