// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';
import RouterLink from 'next/link';

export const Link = styled(RouterLink)`
  text-decoration: none;
  display: block;
`;

export const ProductCard = styled.div`
  cursor: pointer;
  background: ${({ theme }) => theme.colors.surfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: 14px 14px 20px;
  transition: transform 0.28s ${({ theme }) => theme.ease}, box-shadow 0.28s ${({ theme }) => theme.ease},
    border-color 0.28s ${({ theme }) => theme.ease};

  &:hover {
    transform: translateY(-6px);
    box-shadow: ${({ theme }) => theme.shadow.md};
    border-color: ${({ theme }) => theme.colors.lineStrong};
  }
`;

export const Image = styled.div<{ $src: string }>`
  width: 100%;
  height: 200px;
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;
  background:
    url(${({ $src }) => $src}) no-repeat center,
    ${({ theme }) => theme.colors.surfaceSunken};
  background-size: cover;
  transition: transform 0.4s ${({ theme }) => theme.ease};

  ${ProductCard}:hover & {
    transform: scale(1.03);
  }

  ${({ theme }) => theme.breakpoints.desktop} {
    height: 260px;
  }
`;

export const Info = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
`;

export const ProductName = styled.p`
  margin: 0;
  font-family: 'Instrument Sans', sans-serif;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  color: ${({ theme }) => theme.colors.ink};
`;

export const ProductPrice = styled.p`
  margin: 0;
  flex-shrink: 0;
  font-family: 'Bricolage Grotesque', sans-serif;
  font-size: 17px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.brand};
`;
