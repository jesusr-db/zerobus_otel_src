// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';

export const Recommendations = styled.section`
  display: flex;
  margin: 48px auto 24px;
  max-width: 1320px;
  align-items: center;
  flex-direction: column;
  padding: 0 20px;

  ${({ theme }) => theme.breakpoints.desktop} {
    padding: 0 40px;
  }
`;

export const ProductList = styled.div`
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  ${({ theme }) => theme.breakpoints.desktop} {
    grid-template-columns: repeat(4, 1fr);
    gap: 28px;
  }
`;

export const TitleContainer = styled.div`
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  padding: 44px 0 32px;
  text-align: center;
  width: 100%;
`;

export const Title = styled.h3`
  font-size: 26px;
  font-weight: 800;
  margin: 0;

  ${({ theme }) => theme.breakpoints.desktop} {
    font-size: 34px;
  }
`;
