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

const TERMINAL_STAGES = new Set(['Delivered', 'ReadyForPickup']);

const OrderTracker = ({ orderId }: { orderId: string }) => {
  const [status, setStatus] = useState<OrderStatus | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      try {
        const r = await fetch(`/api/order-status?orderId=${encodeURIComponent(orderId)}`);
        const d = await r.json();
        if (!active) return;
        if (d.stages?.length) {
          setStatus(d);
          if (TERMINAL_STAGES.has(d.currentStage) && intervalId) clearInterval(intervalId);
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
  const lastIdx = status.stages.length - 1;
  const isTerminal = TERMINAL_STAGES.has(status.currentStage);
  const breached = status.elapsedSeconds > status.sosTargetSeconds && !isTerminal;

  // Progress across the rail (0..100). The vehicle and fill ride to the current
  // node, reaching the end once the order hits a terminal stage.
  const safeIdx = curIdx < 0 ? 0 : curIdx;
  const progress = lastIdx <= 0 ? 100 : Math.round((safeIdx / lastIdx) * 100);

  // Pickup orders end at a store, delivery orders arrive by vehicle.
  const isPickup = status.stages.includes('ReadyForPickup');
  const vehicle = isTerminal ? (isPickup ? '🏪' : '🎉') : isPickup ? '🍕' : '🚗';

  return (
    <S.Tracker role="status" data-cy="order-tracker">
      <S.Rail>
        <S.RailTrack aria-hidden />
        <S.RailFill $progress={progress} aria-hidden />
        <S.Vehicle $progress={progress} aria-hidden>
          {vehicle}
        </S.Vehicle>
        <S.Stages>
          {status.stages.map((st, i) => {
            const done = i < curIdx || (isTerminal && i <= curIdx);
            const active = i === curIdx && !isTerminal;
            return (
              <S.Stage key={st} data-cy="tracker-stage" aria-current={i === curIdx ? 'step' : undefined}>
                <S.StageDot $done={done} $active={active}>
                  {done ? '✓' : i + 1}
                </S.StageDot>
                <S.StageLabel $done={done} $active={active}>
                  {LABELS[st] ?? st}
                </S.StageLabel>
              </S.Stage>
            );
          })}
        </S.Stages>
      </S.Rail>
      {breached && <S.Breach>Running a little behind. Thanks for your patience!</S.Breach>}
    </S.Tracker>
  );
};

export default OrderTracker;
