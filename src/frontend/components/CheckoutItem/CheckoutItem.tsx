// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import Image from 'next/image';
import { useState } from 'react';
import { CypressFields } from '../../utils/enums/CypressFields';
import { Address } from '../../protos/demo';
import { IProductCheckoutItem } from '../../types/Cart';
import ProductPrice from '../ProductPrice';
import * as S from './CheckoutItem.styled';
import { productImageFile } from '../../utils/productImage';

interface IProps {
  checkoutItem: IProductCheckoutItem;
  address: Address;
}

const DEFAULT_SRC = '/images/products/default.jpg';

const CheckoutItem = ({
  checkoutItem: {
    item: {
      quantity,
      product: { categories, name },
    },
    cost = { currencyCode: 'USD', units: 0, nanos: 0 },
  },
  address: { streetAddress = '', city = '', state = '', zipCode = '', country = '' },
}: IProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const imageSrc = '/images/products/' + productImageFile(categories);

  return (
    <S.CheckoutItem data-cy={CypressFields.CheckoutItem}>
      <S.ItemDetails>
        <S.ItemImage
          src={imageSrc}
          alt={name}
          onError={(e) => {
            if ((e.currentTarget as HTMLImageElement).src !== DEFAULT_SRC) {
              (e.currentTarget as HTMLImageElement).src = DEFAULT_SRC;
            }
          }}
        />
        <S.Details>
          <S.ItemName>{name}</S.ItemName>
          <p>Quantity: {quantity}</p>
          <p>
            Total: <ProductPrice price={cost} />
          </p>
        </S.Details>
      </S.ItemDetails>
      <S.ShippingData>
        <S.ItemName>Shipping Data</S.ItemName>
        <p>Street: {streetAddress}</p>
        {!isCollapsed && <S.SeeMore onClick={() => setIsCollapsed(true)}>See More</S.SeeMore>}
        {isCollapsed && (
          <>
            <p>City: {city}</p>
            <p>State: {state}</p>
            <p>Zip Code: {zipCode}</p>
            <p>Country: {country}</p>
          </>
        )}
      </S.ShippingData>
      <S.Status>
        <Image src="/icons/Check.svg" alt="check" height="14" width="16" /> <span>Done</span>
      </S.Status>
    </S.CheckoutItem>
  );
};

export default CheckoutItem;
