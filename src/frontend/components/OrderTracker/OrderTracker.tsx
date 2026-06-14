// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import * as S from './OrderTracker.styled';

interface OrderStatus {
  currentStage: string;
  stages: string[];
  sosTargetSeconds: number;
  elapsedSeconds: number;
  channel: string;
}

const LABELS: Record<string, string> = {
  Prep: 'Prep',
  Bake: 'Bake',
  QualityCheck: 'Quality Check',
  OutForDelivery: 'Out for Delivery',
  Delivered: 'Delivered',
  ReadyForPickup: 'Ready for Pickup',
};

const OrderTracker = ({ orderId }: { orderId: string }) => {
  const [status, setStatus] = useState<OrderStatus | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const TERMINAL = new Set(['Delivered', 'ReadyForPickup']);
    const poll = async () => {
      try {
        const r = await fetch(`/api/order-status?orderId=${orderId}`);
        const d = await r.json();
        if (!active) return;
        if (d.stages?.length) {
          setStatus(d);
          if (TERMINAL.has(d.currentStage) && intervalId) clearInterval(intervalId);
        }
      } catch {
        // demo: ignore transient poll errors; the next tick retries
      }
    };
    poll();
    intervalId = setInterval(poll, 3000);
    return () => { active = false; if (intervalId) clearInterval(intervalId); };
  }, [orderId]);

  if (!status) return <S.Tracker role="status" data-cy="order-tracker">Starting your order…</S.Tracker>;

  const curIdx = status.stages.indexOf(status.currentStage);
  const breached =
    status.elapsedSeconds > status.sosTargetSeconds && status.currentStage !== 'Delivered';

  return (
    <S.Tracker role="status" data-cy="order-tracker">
      <S.Stages>
        {status.stages.map((st, i) => (
          <S.Stage key={st} $done={i < curIdx} $active={i === curIdx} aria-current={i === curIdx ? 'step' : undefined} data-cy="tracker-stage">
            {LABELS[st] ?? st}
          </S.Stage>
        ))}
      </S.Stages>
      {breached && (
        <S.Breach>Running a little behind — thanks for your patience!</S.Breach>
      )}
    </S.Tracker>
  );
};

export default OrderTracker;
