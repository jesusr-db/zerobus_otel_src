// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { DefaultTheme } from 'styled-components';

const Theme: DefaultTheme = {
  colors: {
    otelBlue: '#C8102E',      // PizzaTel primary red (CTAs, brand)
    otelYellow: '#F2A900',    // warm accent (deals/promo)
    otelGray: '#2B2B2B',      // near-black text/footers
    otelRed: '#1E7B3E',       // herb green (secondary accent / success)
    backgroundGray: 'rgba(43, 43, 43, 0.06)',
    lightBorderGray: 'rgba(200, 16, 46, 0.25)',
    borderGray: '#E8DCC8',    // cream border
    textGray: '#2B2B2B',
    textLightGray: '#7A7268',
    white: '#FFFFFF',
  },
  breakpoints: {
    desktop: '@media (min-width: 768px)',
  },
  sizes: {
    mxLarge: '22px',
    mLarge: '20px',
    mMedium: '14px',
    mSmall: '12px',
    dxLarge: '58px',
    dLarge: '40px',
    dMedium: '18px',
    dSmall: '16px',
    nano: '8px',
  },
  fonts: {
    bold: '800',
    regular: '500',
    semiBold: '700',
    light: '400',
  },
};

export default Theme;
