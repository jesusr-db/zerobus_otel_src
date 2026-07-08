// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    colors: {
      otelBlue: string;
      otelYellow: string;
      otelGray: string;
      otelRed: string;
      backgroundGray: string;
      lightBorderGray: string;
      borderGray: string;
      textGray: string;
      textLightGray: string;
      white: string;
      brand: string;
      brandDark: string;
      brandSoft: string;
      crust: string;
      herb: string;
      ink: string;
      inkMuted: string;
      inkFaint: string;
      surface: string;
      surfaceRaised: string;
      surfaceSunken: string;
      line: string;
      lineStrong: string;
    };
    sizes: {
      mLarge: string;
      mxLarge: string;
      mMedium: string;
      mSmall: string;
      dLarge: string;
      dxLarge: string;
      dMedium: string;
      dSmall: string;
      nano: string;
    };
    breakpoints: {
      desktop: string;
    };
    fonts: {
      bold: string;
      regular: string;
      semiBold: string;
      light: string;
    };
    radius: {
      sm: string;
      md: string;
      lg: string;
      pill: string;
    };
    shadow: {
      sm: string;
      md: string;
      lg: string;
      brand: string;
    };
    ease: string;
  }
}
