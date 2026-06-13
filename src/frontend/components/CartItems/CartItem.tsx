// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link';
import { Product } from '../../protos/demo';
import ProductPrice from '../ProductPrice';
import * as S from './CartItems.styled';
import { productImageFile } from '../../utils/productImage';

interface IProps {
  product: Product;
  quantity: number;
}

const CartItem = ({
  product: { id, name, categories, priceUsd = { units: 0, nanos: 0, currencyCode: 'USD' } },
  quantity,
}: IProps) => {
  const DEFAULT_SRC = '/images/products/default.jpg';
  const imageSrc = '/images/products/' + productImageFile(categories);
  return (
    <S.CartItem>
      <Link href={`/product/${id}`}>
        <S.NameContainer>
          <S.CartItemImage
            alt={name}
            src={imageSrc}
            onError={(e) => {
              if (!(e.currentTarget as HTMLImageElement).src.endsWith('/default.jpg')) {
                (e.currentTarget as HTMLImageElement).src = DEFAULT_SRC;
              }
            }}
          />
          <p>{name}</p>
        </S.NameContainer>
      </Link>
      <S.CartItemDetails>
        <p>{quantity}</p>
      </S.CartItemDetails>
      <S.CartItemDetails>
        <S.PriceContainer>
          <p>
            <ProductPrice price={priceUsd} />
          </p>
        </S.PriceContainer>
      </S.CartItemDetails>
    </S.CartItem>
  );
};

export default CartItem;
