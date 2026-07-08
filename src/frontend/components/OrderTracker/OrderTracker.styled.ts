// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled, { css, keyframes } from 'styled-components';

// NOTE: PizzaTel re-aliases the theme: brand = red (#C8102E), herb = green (#1E7B3E).
// Completed stages fill green, the current stage pulses red, the vehicle rides the fill.

const drive = keyframes`
  0%, 100% { transform: translateX(-50%) scaleX(-1) translateY(0); }
  50% { transform: translateX(-50%) scaleX(-1) translateY(-2px); }
`;

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(200, 16, 46, 0.45); }
  70% { box-shadow: 0 0 0 10px rgba(200, 16, 46, 0); }
  100% { box-shadow: 0 0 0 0 rgba(200, 16, 46, 0); }
`;

export const Tracker = styled.div`
  margin: 20px 0 28px;
  padding: 28px 20px 20px;
  background: ${({ theme }) => theme.colors.surfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.sm};
  font-family: 'Instrument Sans', sans-serif;
  font-size: ${({ theme }) => theme.sizes.mMedium};
  color: ${({ theme }) => theme.colors.inkMuted};
`;

export const Rail = styled.div`
  position: relative;
  padding-top: 34px;
`;

// The full-width background line, vertically centered on the node row.
export const RailTrack = styled.div`
  position: absolute;
  top: 46px;
  left: 14px;
  right: 14px;
  height: 4px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.colors.line};
`;

// The colored progress fill, width driven by $progress (0..100).
export const RailFill = styled.div<{ $progress: number }>`
  position: absolute;
  top: 46px;
  left: 14px;
  height: 4px;
  border-radius: ${({ theme }) => theme.radius.pill};
  width: calc((100% - 28px) * ${({ $progress }) => $progress / 100});
  background: linear-gradient(90deg, ${({ theme }) => theme.colors.herb}, ${({ theme }) => theme.colors.brand});
  transition: width 0.7s ${({ theme }) => theme.ease};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// Delivery vehicle sitting on the leading edge of the fill.
export const Vehicle = styled.div<{ $progress: number }>`
  position: absolute;
  top: 0;
  left: calc(14px + (100% - 28px) * ${({ $progress }) => $progress / 100});
  transform: translateX(-50%) scaleX(-1);
  font-size: 26px;
  line-height: 1;
  transition: left 0.7s ${({ theme }) => theme.ease};
  animation: ${drive} 1.6s ease-in-out infinite;
  filter: drop-shadow(0 3px 4px rgba(28, 25, 23, 0.18));
  z-index: 2;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    animation: none;
  }
`;

export const Stages = styled.div`
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 4px;
`;

export const Stage = styled.div<{ $done?: boolean; $active?: boolean }>`
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

export const StageDot = styled.div<{ $done?: boolean; $active?: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.surfaceRaised};
  border: 2px solid ${({ theme }) => theme.colors.lineStrong};
  color: ${({ theme }) => theme.colors.inkFaint};
  transition: background-color 0.4s ${({ theme }) => theme.ease}, border-color 0.4s ${({ theme }) => theme.ease},
    color 0.4s ${({ theme }) => theme.ease};

  ${({ $done, theme }) =>
    $done &&
    css`
      background: ${theme.colors.herb};
      border-color: ${theme.colors.herb};
      color: #fff;
    `}

  ${({ $active, theme }) =>
    $active &&
    css`
      background: ${theme.colors.brand};
      border-color: ${theme.colors.brand};
      color: #fff;
      animation: ${pulse} 1.8s ease-out infinite;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const StageLabel = styled.span<{ $done?: boolean; $active?: boolean }>`
  font-size: 11.5px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  line-height: 1.25;
  text-align: center;
  color: ${({ $done, $active, theme }) =>
    $active ? theme.colors.brand : $done ? theme.colors.ink : theme.colors.inkFaint};

  ${({ theme }) => theme.breakpoints.desktop} {
    font-size: 13px;
  }
`;

export const Breach = styled.div`
  margin-top: 18px;
  padding: 10px 14px;
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.ink};
  background: rgba(242, 169, 0, 0.16);
  border: 1px solid rgba(242, 169, 0, 0.4);
`;
