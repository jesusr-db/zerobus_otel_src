// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { DefaultTheme } from 'styled-components';

const Theme: DefaultTheme = {
  colors: {
    otelBlue: '#C8102E', // PizzaTel primary red (CTAs, brand)
    otelYellow: '#F2A900', // warm accent (deals/promo)
    otelGray: '#1C1917', // near-black warm text/footers
    otelRed: '#1E7B3E', // herb green (secondary accent / success)
    backgroundGray: 'rgba(28, 25, 23, 0.04)',
    lightBorderGray: 'rgba(28, 25, 23, 0.08)',
    borderGray: '#EFE7DC', // warm cream border
    textGray: '#1C1917',
    textLightGray: '#7C7268',
    white: '#FFFFFF',

    // Refined palette (redesign)
    brand: '#C8102E', // brand red
    brandDark: '#A00D24', // hover/pressed red
    brandSoft: 'rgba(200, 16, 46, 0.08)', // red tint wash
    crust: '#F2A900', // warm amber accent
    herb: '#2E7D46', // fresh green (success / veg)
    ink: '#1C1917', // primary text
    inkMuted: '#6B625A', // secondary text
    inkFaint: '#9A9089', // tertiary text
    surface: '#FFFDFB', // page background (warm off-white)
    surfaceRaised: '#FFFFFF', // cards
    surfaceSunken: '#FBF6EF', // subtle sections
    line: '#EDE4D8', // hairlines / borders
    lineStrong: '#E0D4C4',
  },
  breakpoints: {
    desktop: '@media (min-width: 768px)',
  },
  sizes: {
    mxLarge: '30px',
    mLarge: '22px',
    mMedium: '14px',
    mSmall: '12px',
    dxLarge: '64px',
    dLarge: '40px',
    dMedium: '18px',
    dSmall: '16px',
    nano: '8px',
  },
  fonts: {
    bold: '800',
    regular: '400',
    semiBold: '600',
    light: '400',
  },
  radius: {
    sm: '10px',
    md: '16px',
    lg: '24px',
    pill: '999px',
  },
  shadow: {
    sm: '0 1px 2px rgba(28, 25, 23, 0.06), 0 1px 3px rgba(28, 25, 23, 0.05)',
    md: '0 6px 20px rgba(28, 25, 23, 0.08), 0 2px 6px rgba(28, 25, 23, 0.05)',
    lg: '0 18px 48px rgba(28, 25, 23, 0.14), 0 6px 16px rgba(28, 25, 23, 0.08)',
    brand: '0 10px 30px rgba(200, 16, 46, 0.28)',
  },
  ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

export default Theme;
