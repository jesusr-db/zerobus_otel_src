// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';

export const Container = styled.div`
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
  padding: 0 20px;

  ${({ theme }) => theme.breakpoints.desktop} {
    padding: 0 40px;
  }
`;

export const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  width: 100%;
`;

export const Content = styled.div`
  width: 100%;
  margin-top: 48px;

  ${({ theme }) => theme.breakpoints.desktop} {
    margin-top: 88px;
  }
`;

export const HotProducts = styled.div`
  margin-bottom: 56px;

  ${({ theme }) => theme.breakpoints.desktop} {
    margin-bottom: 120px;
  }
`;

export const HotProductsTitle = styled.h2`
  font-size: 32px;
  font-weight: 800;
  margin: 0 0 6px;
  scroll-margin-top: 96px;

  ${({ theme }) => theme.breakpoints.desktop} {
    font-size: 46px;
  }
`;

export const HotProductsIntro = styled.p`
  font-family: 'Instrument Sans', sans-serif;
  font-size: 16px;
  font-weight: 400;
  color: ${({ theme }) => theme.colors.inkMuted};
  margin: 0 0 32px;

  ${({ theme }) => theme.breakpoints.desktop} {
    font-size: 18px;
    margin-bottom: 44px;
  }
`;

export const Home = styled.div`
  @media (max-width: 992px) {
    ${Content} {
      width: 100%;
    }
  }
`;
