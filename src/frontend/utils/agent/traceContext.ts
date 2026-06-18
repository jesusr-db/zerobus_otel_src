// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { context, propagation } from '@opentelemetry/api';

// Inject the active W3C context into a carrier and return the `traceparent`
// string. The BFF sends this in the agent request PAYLOAD (not a header) so the
// agent can link its MLflow trace to this app trace. Empty string if no active
// context (degrades safely).
export function getTraceparent(): string {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent ?? '';
}
