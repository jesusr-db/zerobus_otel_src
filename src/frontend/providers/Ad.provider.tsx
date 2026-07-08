// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import ApiGateway from '../gateways/Api.gateway';
import { Ad, Money, Product } from '../protos/demo';
import { useCurrency } from './Currency.provider';
import { useSession } from './Session.provider';

interface IContext {
  recommendedProductList: Product[];
  adList: Ad[];
}

export const Context = createContext<IContext>({
  recommendedProductList: [],
  adList: [],
});

interface IProps {
  children: React.ReactNode;
  productIds: string[];
  contextKeys: string[];
}

export const useAd = () => useContext(Context);

const AdProvider = ({ children, productIds, contextKeys }: IProps) => {
  const { selectedCurrency } = useCurrency();
  const { profileId, memberId, storeId } = useSession();
  const { data: adList = [] } = useQuery({
    queryKey: ['ads', contextKeys],
    queryFn: async () => {
      if (contextKeys.length === 0) {
        return [];
      } else {
        return ApiGateway.listAds(contextKeys);
      }
    },
    refetchOnWindowFocus: false,
  });
  const { data: recommendedProductList = [] } = useQuery({
    queryKey: ['recommendations', productIds, 'selectedCurrency', selectedCurrency, profileId, memberId, storeId],
    queryFn: () => ApiGateway.listRecommendations(productIds, selectedCurrency, { profileId, memberId, storeId }),
    refetchOnWindowFocus: false,
  });

  const value = useMemo(
    () => ({
      adList,
      recommendedProductList,
    }),
    [adList, recommendedProductList]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export default AdProvider;
