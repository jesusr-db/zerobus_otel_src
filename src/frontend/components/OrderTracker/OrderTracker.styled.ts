// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';

export const Tracker = styled.div`
  margin: 16px 0;
  padding: 16px;
  background-color: ${({ theme }) => theme.colors.backgroundGray};
  border-radius: 8px;
  font-size: ${({ theme }) => theme.sizes.mMedium};
  color: ${({ theme }) => theme.colors.textGray};
`;

export const Stages = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

// NOTE: PizzaTel re-aliases the theme: otelBlue = brand red (#C8102E), otelRed = herb green (#1E7B3E).
// Active stage = brand red, completed stages = green.
export const Stage = styled.div<{ $done?: boolean; $active?: boolean }>`
  padding: 8px 16px;
  border-radius: 20px;
  font-size: ${({ theme }) => theme.sizes.mSmall};
  font-weight: ${({ theme }) => theme.fonts.regular};
  color: ${({ theme }) => theme.colors.textGray};
  background-color: ${({ theme }) => theme.colors.backgroundGray};
  border: 1px solid ${({ theme }) => theme.colors.borderGray};

  ${({ $active, theme }) =>
    $active &&
    `
    background-color: ${theme.colors.otelBlue};
    color: ${theme.colors.white};
    font-weight: ${theme.fonts.bold};
    border-color: ${theme.colors.otelBlue};
  `}

  ${({ $done, $active, theme }) =>
    $done &&
    !$active &&
    `
    background-color: ${theme.colors.otelRed};
    color: ${theme.colors.white};
    border-color: ${theme.colors.otelRed};
  `}
`;

export const Breach = styled.div`
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: ${({ theme }) => theme.sizes.mSmall};
  color: ${({ theme }) => theme.colors.otelGray};
  background-color: ${({ theme }) => theme.colors.otelYellow};
`;
