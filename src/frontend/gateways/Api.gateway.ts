// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { Ad, Address, Cart, CartItem, Money, PlaceOrderRequest, Product } from '../protos/demo';
import { IProductCart, IProductCartItem, IProductCheckout } from '../types/Cart';
import request from '../utils/Request';
import { AttributeNames } from '../utils/enums/AttributeNames';
import SessionGateway from './Session.gateway';
import { context, propagation } from "@opentelemetry/api";

const { userId } = SessionGateway.getSession();

const basePath = '/api';

const Apis = () => ({
  getCart(currencyCode: string) {
    return request<IProductCart>({
      url: `${basePath}/cart`,
      queryParams: { sessionId: userId, currencyCode },
    });
  },
  addCartItem({ currencyCode, ...item }: CartItem & { currencyCode: string }) {
    return request<Cart>({
      url: `${basePath}/cart`,
      body: { item, userId },
      queryParams: { currencyCode },
      method: 'POST',
    });
  },
  emptyCart() {
    return request<undefined>({
      url: `${basePath}/cart`,
      method: 'DELETE',
      body: { userId },
    });
  },

  getSupportedCurrencyList() {
    return request<string[]>({
      url: `${basePath}/currency`,
    });
  },

  getShippingCost(itemList: IProductCartItem[], currencyCode: string, address: Address) {
    return request<Money>({
      url: `${basePath}/shipping`,
      queryParams: {
        itemList: JSON.stringify(itemList.map(({ productId, quantity }) => ({ productId, quantity }))),
        currencyCode,
        address: JSON.stringify(address),
      },
    });
  },

  placeOrder({ currencyCode, orderType, ...order }: PlaceOrderRequest & { currencyCode: string; orderType?: string }) {
    // default to '' so a stale session missing storeId/memberId never sends the string "undefined"
    const { storeId = '', memberId = '' } = SessionGateway.getSession();
    return request<IProductCheckout>({
      url: `${basePath}/checkout`,
      method: 'POST',
      queryParams: { currencyCode, storeId, memberId, orderType: orderType ?? 'delivery' },
      body: order,
    });
  },

  listProducts(currencyCode: string) {
    return request<Product[]>({
      url: `${basePath}/products`,
      queryParams: { currencyCode },
    });
  },
  getProduct(productId: string, currencyCode: string) {
    return request<Product>({
      url: `${basePath}/products/${productId}`,
      queryParams: { currencyCode },
    });
  },
  listRecommendations(
    productIds: string[],
    currencyCode: string,
    ctx?: { profileId?: string; memberId?: string; storeId?: string }
  ) {
    // Prefer explicitly-passed identity (from SessionProvider, always current); fall
    // back to the session read so callers without ctx still work. Defaults so a stale
    // session never emits the string "undefined" for these ids.
    const session = SessionGateway.getSession();
    const profileId = ctx?.profileId ?? session.profileId ?? 'guest';
    const memberId = ctx?.memberId ?? session.memberId ?? '';
    const storeId = ctx?.storeId ?? session.storeId ?? '';
    return request<Product[]>({
      url: `${basePath}/recommendations`,
      queryParams: {
        productIds,
        sessionId: userId,
        currencyCode,
        storeId,
        profileId,
        memberId,
      },
    });
  },
  sendAgentMessage(messages: import('../utils/agent/agentContract').AgentChatMessage[]) {
    // defaults so a stale session never emits the string "undefined"
    const { storeId = '', profileId = 'guest', memberId = '', currencyCode = 'USD' } = SessionGateway.getSession();
    return request<import('../services/Agent.service').AgentTurnResult>({
      url: `${basePath}/agent-chat`,
      method: 'POST',
      queryParams: { currencyCode },
      body: { messages, context: { profileId, storeId, memberId } },
    });
  },
  listAds(contextKeys: string[]) {
    return request<Ad[]>({
      url: `${basePath}/data`,
      queryParams: {
        contextKeys,
      },
    });
  },
});

/**
 * Extends all the API calls to set baggage automatically.
 */
const ApiGateway = new Proxy(Apis(), {
  get(target, prop, receiver) {
    const originalFunction = Reflect.get(target, prop, receiver);

    if (typeof originalFunction !== 'function') {
      return originalFunction;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (...args: any[]) {
      const baggage = propagation.getActiveBaggage() || propagation.createBaggage();
      const newBaggage = baggage.setEntry(AttributeNames.SESSION_ID, { value: userId });
      const newContext = propagation.setBaggage(context.active(), newBaggage);
      return context.with(newContext, () => {
        return Reflect.apply(originalFunction, undefined, args);
      });
    };
  },
});

export default ApiGateway;
