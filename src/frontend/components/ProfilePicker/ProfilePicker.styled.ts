// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';

export const ProfilePicker = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

export const Select = styled.select`
  appearance: none;
  border: 1px solid ${({ theme }) => theme.colors.borderGray};
  border-radius: 8px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textGray};
  font-size: ${({ theme }) => theme.sizes.dSmall};
  padding: 8px 24px 8px 8px;
  margin-right: 8px;
  cursor: pointer;
`;
