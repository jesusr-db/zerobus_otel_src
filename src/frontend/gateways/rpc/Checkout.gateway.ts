// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ChannelCredentials, Metadata } from '@grpc/grpc-js';
import { CheckoutServiceClient, PlaceOrderRequest, PlaceOrderResponse } from '../../protos/demo';

const { CHECKOUT_ADDR = '' } = process.env;

const client = new CheckoutServiceClient(CHECKOUT_ADDR, ChannelCredentials.createInsecure());

const CheckoutGateway = () => ({
  placeOrder(order: PlaceOrderRequest, ctx?: { storeId?: string; orderType?: string }) {
    const metadata = new Metadata();
    if (ctx?.storeId) metadata.set('pizzatel-store-id', ctx.storeId);
    if (ctx?.orderType) metadata.set('pizzatel-order-type', ctx.orderType);
    return new Promise<PlaceOrderResponse>((resolve, reject) =>
      client.placeOrder(order, metadata, (error, response) => (error ? reject(error) : resolve(response)))
    );
  },
});

export default CheckoutGateway();
