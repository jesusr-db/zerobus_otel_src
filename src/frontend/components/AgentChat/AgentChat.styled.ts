// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';

export const Launcher = styled.button`
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  border: none;
  border-radius: 50%;
  width: 56px;
  height: 56px;
  font-size: 24px;
  cursor: pointer;
  background: ${({ theme }) => (theme.colors as Record<string, string>)['otelBlue'] ?? '#1f7aec'};
  color: #fff;
`;

export const Panel = styled.div`
  position: fixed;
  right: 24px;
  bottom: 92px;
  z-index: 1000;
  width: 360px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  overflow: hidden;
`;

export const Header = styled.div`
  padding: 12px 16px;
  font-weight: 700;
  background: ${({ theme }) => (theme.colors as Record<string, string>)['otelBlue'] ?? '#1f7aec'};
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const Messages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const Bubble = styled.div<{ $role: 'user' | 'assistant' }>`
  align-self: ${({ $role }) => ($role === 'user' ? 'flex-end' : 'flex-start')};
  background: ${({ $role }) => ($role === 'user' ? '#1f7aec' : '#f1f1f1')};
  color: ${({ $role }) => ($role === 'user' ? '#fff' : '#222')};
  padding: 8px 12px;
  border-radius: 12px;
  max-width: 80%;
  font-size: 14px;
  white-space: pre-wrap;
`;

export const Card = styled.div`
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 12px;
  font-size: 14px;
`;

export const CardRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
`;

export const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

export const InputRow = styled.form`
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #eee;
`;

export const TextInput = styled.input`
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 14px;
`;

export const Button = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  background: ${({ $variant }) => ($variant === 'ghost' ? '#eee' : '#1f7aec')};
  color: ${({ $variant }) => ($variant === 'ghost' ? '#222' : '#fff')};
`;
