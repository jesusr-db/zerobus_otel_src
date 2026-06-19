// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['utils/**/__tests__/**/*.test.ts'],
  },
});
