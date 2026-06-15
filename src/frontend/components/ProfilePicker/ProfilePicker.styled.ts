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
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.sizes.dSmall};
  padding: 8px 24px 8px 8px;
  cursor: pointer;
`;
