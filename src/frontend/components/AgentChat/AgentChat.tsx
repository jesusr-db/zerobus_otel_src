// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from 'react';
import { useBooleanFlagValue } from '@openfeature/react-sdk';
import ApiGateway from '../../gateways/Api.gateway';
import type { AgentChatMessage } from '../../utils/agent/agentContract';
import type { AgentTurnResult } from '../../services/Agent.service';
import type { PricedProposal } from '../../utils/agent/pricing';
import * as S from './AgentChat.styled';

const AgentChat = () => {
  const enabled = useBooleanFlagValue('agentEnabled', false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [proposal, setProposal] = useState<PricedProposal | undefined>();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const next = [...messages, { role: 'user' as const, content: trimmed }];
      setMessages(next);
      setInput('');
      setBusy(true);
      try {
        const res: AgentTurnResult = await ApiGateway.sendAgentMessage(next);
        setMessages(m => [...m, { role: 'assistant', content: res.reply }]);
        setProposal(res.priced && res.priced.lines.length ? res.priced : undefined);
      } catch {
        setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
      } finally {
        setBusy(false);
      }
    },
    [messages, busy]
  );

  // Approve/disapprove wiring is added in Task 6.
  const onApprove = useCallback(() => undefined, []);
  const onChange = useCallback(() => setProposal(undefined), []);

  if (!enabled) return null;

  if (!open) {
    return (
      <S.Launcher aria-label="Open ordering assistant" onClick={() => setOpen(true)}>
        🍕
      </S.Launcher>
    );
  }

  return (
    <S.Panel role="dialog" aria-label="Ordering assistant">
      <S.Header>
        PizzaTel Assistant
        <S.Button $variant="ghost" onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </S.Button>
      </S.Header>
      <S.Messages>
        {messages.length === 0 && <S.Bubble $role="assistant">Hi! What would you like to order today?</S.Bubble>}
        {messages.map((m, i) => (
          <S.Bubble key={i} $role={m.role}>
            {m.content}
          </S.Bubble>
        ))}
        {proposal && (
          <S.Card>
            {proposal.lines.map(l => (
              <S.CardRow key={l.productId}>
                <span>
                  {l.quantity}× {l.name}
                </span>
                <span>
                  {l.lineTotal.toFixed(2)} {proposal.currencyCode}
                </span>
              </S.CardRow>
            ))}
            <S.CardRow>
              <strong>Subtotal</strong>
              <strong>
                {proposal.subtotal.toFixed(2)} {proposal.currencyCode}
              </strong>
            </S.CardRow>
            <S.Actions>
              <S.Button onClick={onApprove}>Place order</S.Button>
              <S.Button $variant="ghost" onClick={onChange}>
                Change something
              </S.Button>
            </S.Actions>
          </S.Card>
        )}
      </S.Messages>
      <S.InputRow
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
      >
        <S.TextInput
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={busy ? 'Thinking…' : 'Type your order…'}
          disabled={busy}
        />
        <S.Button type="submit" disabled={busy}>
          Send
        </S.Button>
      </S.InputRow>
    </S.Panel>
  );
};

export default AgentChat;
