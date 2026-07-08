// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';

export const Footer = styled.footer`
  position: relative;
  margin-top: 40px;
  padding: 56px 24px 40px;
  background-color: ${({ theme }) => theme.colors.ink};

  ${({ theme }) => theme.breakpoints.desktop} {
    padding: 64px 40px 48px;
  }

  > div,
  > p {
    max-width: 1320px;
    margin-left: auto;
    margin-right: auto;
  }

  * {
    color: rgba(255, 255, 255, 0.72);
    font-family: 'Instrument Sans', sans-serif;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.6;
  }

  > p {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
  }
`;
