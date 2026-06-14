// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from 'redis';
import InstrumentationMiddleware from '../../utils/telemetry/InstrumentationMiddleware';

type Stage = { name: string; offset_seconds: number };
type OrderState = {
  order_id: string;
  store_id: string;
  channel: string;
  placed_at_unix: number;
  schedule: { channel: string; sos_target_seconds: number; stages: Stage[] };
};

type TResponse =
  | { orderId: string; status: 'pending'; stages: [] }
  | {
      orderId: string;
      channel: string;
      currentStage: string;
      stages: string[];
      sosTargetSeconds: number;
      elapsedSeconds: number;
    }
  | { error: string };

function currentStage(st: OrderState, nowUnix: number): string {
  const elapsed = nowUnix - st.placed_at_unix;
  let cur = st.schedule.stages[0]?.name ?? 'Prep';
  for (const s of st.schedule.stages) if (elapsed >= s.offset_seconds) cur = s.name;
  return cur;
}

const handler = async ({ method, query }: NextApiRequest, res: NextApiResponse<TResponse>) => {
  if (method !== 'GET') return res.status(405).end();

  const orderId = String(query.orderId || '');
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  const client = createClient({ url: `redis://${process.env.VALKEY_ADDR}` });
  try {
    await client.connect();
    const raw = await client.get(`tracker:${orderId}`);
    if (!raw) return res.status(200).json({ orderId, status: 'pending', stages: [] });
    let st: OrderState;
    try {
      st = JSON.parse(raw) as OrderState;
    } catch {
      return res.status(500).json({ error: 'invalid tracker state' });
    }
    const now = Math.floor(Date.now() / 1000);
    return res.status(200).json({
      orderId,
      channel: st.channel,
      currentStage: currentStage(st, now),
      stages: st.schedule.stages.map(s => s.name),
      sosTargetSeconds: st.schedule.sos_target_seconds,
      elapsedSeconds: now - st.placed_at_unix,
    });
  } finally {
    await client.quit().catch(() => {});
  }
};

export default InstrumentationMiddleware(handler);
