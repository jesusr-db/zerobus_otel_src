// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link';
import * as S from './Banner.styled';

const Banner = () => {
  return (
    <S.Banner>
      <S.ImageContainer>
        <S.BannerImg />
      </S.ImageContainer>
      <S.TextContainer>
        <S.Title>Fresh, fast, made-to-order pizza — built your way.</S.Title>
        <Link href="#hot-products"><S.GoShoppingButton>Go Shopping</S.GoShoppingButton></Link>
      </S.TextContainer>
    </S.Banner>
  );
};

export default Banner;
