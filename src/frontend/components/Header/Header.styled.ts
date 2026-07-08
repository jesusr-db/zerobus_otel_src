// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link';
import styled from 'styled-components';

export const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: 50;
  color: ${({ theme }) => theme.colors.ink};
`;

export const NavBar = styled.nav`
  height: 68px;
  background: rgba(255, 253, 251, 0.82);
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
  font-size: 15px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  padding: 0;

  ${({ theme }) => theme.breakpoints.desktop} {
    height: 76px;
  }
`;

export const Container = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 100%;
  max-width: 1320px;
  margin: 0 auto;
  padding: 0 20px;

  ${({ theme }) => theme.breakpoints.desktop} {
    padding: 0 40px;
  }
`;

export const NavBarBrand = styled(Link)`
  display: flex;
  align-items: center;
  padding: 0;
  transition: opacity 0.18s ${({ theme }) => theme.ease};

  &:hover {
    opacity: 0.82;
  }
`;

export const BrandImg = styled.img.attrs({
  src: '/images/pizzatel-logo.svg',
  alt: 'PizzaTel',
})`
  width: 150px;
  height: auto;

  ${({ theme }) => theme.breakpoints.desktop} {
    width: 172px;
  }
`;

export const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  height: 48px;

  ${({ theme }) => theme.breakpoints.desktop} {
    gap: 14px;
  }
`;
