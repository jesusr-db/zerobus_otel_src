// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled, { css } from 'styled-components';

const Button = styled.button<{ $type?: 'primary' | 'secondary' | 'link' }>`
  background-color: ${({ theme }) => theme.colors.brand};
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: solid 1.5px ${({ theme }) => theme.colors.brand};
  padding: 0 26px;
  outline: none;
  font-family: 'Instrument Sans', sans-serif;
  font-weight: 700;
  font-size: 17px;
  line-height: 1;
  letter-spacing: -0.01em;
  border-radius: ${({ theme }) => theme.radius.pill};
  height: 54px;
  cursor: pointer;
  box-shadow: ${({ theme }) => theme.shadow.brand};
  transition: transform 0.18s ${({ theme }) => theme.ease}, background-color 0.18s ${({ theme }) => theme.ease},
    box-shadow 0.18s ${({ theme }) => theme.ease}, border-color 0.18s ${({ theme }) => theme.ease};

  &:hover {
    background-color: ${({ theme }) => theme.colors.brandDark};
    border-color: ${({ theme }) => theme.colors.brandDark};
    transform: translateY(-2px);
    box-shadow: ${({ theme }) => theme.shadow.lg};
  }

  &:active {
    transform: translateY(0) scale(0.98);
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.brandSoft};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  ${({ $type = 'primary' }) =>
    $type === 'secondary' &&
    css`
      background: transparent;
      color: ${({ theme }) => theme.colors.ink};
      border-color: ${({ theme }) => theme.colors.lineStrong};
      box-shadow: none;

      &:hover {
        background: ${({ theme }) => theme.colors.surfaceSunken};
        border-color: ${({ theme }) => theme.colors.ink};
        color: ${({ theme }) => theme.colors.ink};
        box-shadow: ${({ theme }) => theme.shadow.sm};
      }
    `};

  ${({ $type = 'primary' }) =>
    $type === 'link' &&
    css`
      background: none;
      color: ${({ theme }) => theme.colors.brand};
      border: none;
      box-shadow: none;
      padding: 0 8px;

      &:hover {
        background: none;
        color: ${({ theme }) => theme.colors.brandDark};
        box-shadow: none;
      }
    `};
`;

export default Button;
