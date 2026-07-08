// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';
import Button from '../components/Button';

export const ProductDetail = styled.div`
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 20px;

  ${({ theme }) => theme.breakpoints.desktop} {
    padding: 72px 40px;
  }
`;

export const Container = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 28px;
  align-items: start;

  ${({ theme }) => theme.breakpoints.desktop} {
    grid-template-columns: 46% 1fr;
    gap: 64px;
  }
`;

export const Image = styled.div<{ $src: string }>`
  width: 100%;
  height: 300px;
  border-radius: ${({ theme }) => theme.radius.lg};
  background:
    url(${({ $src }) => $src}) no-repeat center,
    ${({ theme }) => theme.colors.surfaceSunken};
  background-size: cover;
  border: 1px solid ${({ theme }) => theme.colors.line};
  box-shadow: ${({ theme }) => theme.shadow.md};

  ${({ theme }) => theme.breakpoints.desktop} {
    height: 480px;
    position: sticky;
    top: 100px;
  }
`;

export const Details = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 0;

  ${({ theme }) => theme.breakpoints.desktop} {
    padding-top: 8px;
  }
`;

export const AddToCart = styled(Button)`
  align-self: stretch;
  font-size: ${({ theme }) => theme.sizes.dSmall};
  margin-top: 8px;

  ${({ theme }) => theme.breakpoints.desktop} {
    align-self: flex-start;
    padding: 0 40px;
  }
`;

export const Name = styled.h1`
  font-size: 30px;
  margin: 0;
  font-weight: 800;

  ${({ theme }) => theme.breakpoints.desktop} {
    font-size: 46px;
  }
`;

export const Text = styled.p`
  margin: 0;
  font-family: 'Instrument Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.inkMuted};
`;

export const Description = styled.p`
  margin: 0;
  font-family: 'Instrument Sans', sans-serif;
  color: ${({ theme }) => theme.colors.inkMuted};
  font-weight: 400;
  font-size: 17px;
  line-height: 1.6;
  max-width: 60ch;
`;

export const ProductPrice = styled.p`
  margin: 0;
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800;
  font-size: 30px;
  color: ${({ theme }) => theme.colors.brand};

  ${({ theme }) => theme.breakpoints.desktop} {
    font-size: 38px;
  }
`;
