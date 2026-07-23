// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled, { keyframes } from 'styled-components';

const popIn = keyframes`
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const bubbleIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const blink = keyframes`
  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
`;

export const Launcher = styled.button`
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.pill};
  height: 58px;
  padding: 0 22px 0 18px;
  font-family: 'Instrument Sans', sans-serif;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.brand};
  color: #fff;
  box-shadow: ${({ theme }) => theme.shadow.brand};
  transition: transform 0.2s ${({ theme }) => theme.ease}, box-shadow 0.2s ${({ theme }) => theme.ease},
    background-color 0.2s ${({ theme }) => theme.ease};

  &:hover {
    transform: translateY(-2px);
    background: ${({ theme }) => theme.colors.brandDark};
    box-shadow: ${({ theme }) => theme.shadow.lg};
  }

  &:active {
    transform: translateY(0) scale(0.97);
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.brandSoft};
    outline-offset: 3px;
  }
`;

export const LauncherIcon = styled.span`
  font-size: 22px;
  line-height: 1;
`;

export const Panel = styled.div`
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  width: min(384px, calc(100vw - 32px));
  max-height: min(76vh, 640px);
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.surfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  overflow: hidden;
  animation: ${popIn} 0.32s ${({ theme }) => theme.ease} both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const Header = styled.div`
  padding: 16px 16px 16px 18px;
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800;
  font-size: 16px;
  letter-spacing: -0.01em;
  background: ${({ theme }) => theme.colors.brand};
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const HeaderTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

export const StatusDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7ee2a0;
  box-shadow: 0 0 0 3px rgba(126, 226, 160, 0.3);
`;

export const Messages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: ${({ theme }) => theme.colors.surfaceSunken};
`;

export const Bubble = styled.div<{ $role: 'user' | 'assistant' }>`
  align-self: ${({ $role }) => ($role === 'user' ? 'flex-end' : 'flex-start')};
  background: ${({ $role, theme }) => ($role === 'user' ? theme.colors.brand : theme.colors.surfaceRaised)};
  color: ${({ $role, theme }) => ($role === 'user' ? '#fff' : theme.colors.ink)};
  border: 1px solid ${({ $role, theme }) => ($role === 'user' ? 'transparent' : theme.colors.line)};
  padding: 10px 14px;
  border-radius: 16px;
  border-bottom-right-radius: ${({ $role }) => ($role === 'user' ? '4px' : '16px')};
  border-bottom-left-radius: ${({ $role }) => ($role === 'user' ? '16px' : '4px')};
  max-width: 84%;
  font-family: 'Instrument Sans', sans-serif;
  font-size: 14.5px;
  font-weight: 400;
  line-height: 1.45;
  white-space: pre-wrap;
  box-shadow: ${({ theme }) => theme.shadow.sm};
  animation: ${bubbleIn} 0.28s ${({ theme }) => theme.ease} both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const Typing = styled.div`
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: ${({ theme }) => theme.colors.surfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.line};
  padding: 12px 16px;
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  box-shadow: ${({ theme }) => theme.shadow.sm};

  span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.inkFaint};
    animation: ${blink} 1.3s infinite ease-in-out;
  }
  span:nth-child(2) {
    animation-delay: 0.18s;
  }
  span:nth-child(3) {
    animation-delay: 0.36s;
  }

  @media (prefers-reduced-motion: reduce) {
    span {
      animation: none;
    }
  }
`;

export const Card = styled.div`
  align-self: stretch;
  background: ${({ theme }) => theme.colors.surfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: 14px;
  font-family: 'Instrument Sans', sans-serif;
  font-size: 14px;
  box-shadow: ${({ theme }) => theme.shadow.sm};
`;

export const CardTitle = styled.div`
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.inkMuted};
  margin-bottom: 10px;
`;

export const CardRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  color: ${({ theme }) => theme.colors.ink};

  &:not(:last-of-type) {
    border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  }

  strong {
    font-weight: 700;
  }
`;

export const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 14px;
`;

export const InputRow = styled.form`
  display: flex;
  gap: 8px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.surfaceRaised};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

export const TextInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radius.pill};
  font-family: 'Instrument Sans', sans-serif;
  font-size: 14.5px;
  color: ${({ theme }) => theme.colors.ink};
  background: ${({ theme }) => theme.colors.surface};
  transition: border-color 0.18s ${({ theme }) => theme.ease}, box-shadow 0.18s ${({ theme }) => theme.ease};

  &::placeholder {
    color: ${({ theme }) => theme.colors.inkFaint};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.brand};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.brandSoft};
  }

  &:disabled {
    opacity: 0.6;
  }
`;

export const Button = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  border: 1.5px solid ${({ $variant, theme }) => ($variant === 'ghost' ? theme.colors.line : theme.colors.brand)};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: 0 16px;
  height: 44px;
  cursor: pointer;
  font-family: 'Instrument Sans', sans-serif;
  font-size: 14.5px;
  font-weight: 700;
  flex-shrink: 0;
  background: ${({ $variant, theme }) => ($variant === 'ghost' ? 'transparent' : theme.colors.brand)};
  color: ${({ $variant, theme }) => ($variant === 'ghost' ? theme.colors.ink : '#fff')};
  transition: transform 0.16s ${({ theme }) => theme.ease}, background-color 0.16s ${({ theme }) => theme.ease},
    border-color 0.16s ${({ theme }) => theme.ease};

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    background: ${({ $variant, theme }) => ($variant === 'ghost' ? theme.colors.surfaceSunken : theme.colors.brandDark)};
    border-color: ${({ $variant, theme }) => ($variant === 'ghost' ? theme.colors.lineStrong : theme.colors.brandDark)};
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.brandSoft};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

export const CloseButton = styled.button`
  border: none;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.16s ${({ theme }) => theme.ease};

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  &:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
`;

export const CheckoutBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.surfaceRaised};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

export const CheckoutBarSummary = styled.div`
  display: flex;
  flex-direction: column;
  font-family: 'Instrument Sans', sans-serif;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.inkMuted};

  strong {
    font-size: 15px;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.ink};
  }
`;

export const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(20, 18, 16, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;

  @media (prefers-reduced-motion: no-preference) {
    animation: ${bubbleIn} 0.18s ${({ theme }) => theme.ease} both;
  }
`;

export const ModalPanel = styled.div`
  width: min(520px, calc(100vw - 32px));
  max-height: min(88vh, 760px);
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.surfaceRaised};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  overflow: hidden;
`;

export const ModalHeader = styled.div`
  padding: 16px 16px 16px 18px;
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800;
  font-size: 16px;
  background: ${({ theme }) => theme.colors.brand};
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const ModalBody = styled.div`
  overflow-y: auto;
  padding: 18px;
  background: ${({ theme }) => theme.colors.surfaceSunken};
`;
