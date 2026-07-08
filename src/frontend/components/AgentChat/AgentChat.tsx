// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBooleanFlagValue } from '@openfeature/react-sdk';
import { useSpeechInput } from './useSpeechInput';
import { useRouter } from 'next/router';
import ApiGateway from '../../gateways/Api.gateway';
import { useCart } from '../../providers/Cart.provider';
import { useCurrency } from '../../providers/Currency.provider';
import SessionGateway from '../../gateways/Session.gateway';
import type { PlaceOrderArg } from '../../providers/Cart.provider';
import type { AgentChatMessage } from '../../utils/agent/agentContract';
import type { AgentTurnResult } from '../../services/Agent.service';
import type { PricedProposal } from '../../utils/agent/pricing';
import * as S from './AgentChat.styled';

const DEMO_CHECKOUT = {
  email: 'someone@example.com',
  address: { streetAddress: '1600 Amphitheatre Parkway', city: 'Mountain View', state: 'CA', country: 'United States', zipCode: '94043' },
  creditCard: { creditCardNumber: '4432801561520454', creditCardCvv: 672, creditCardExpirationYear: 2030, creditCardExpirationMonth: 1 },
};

const AgentChat = () => {
  const enabled = useBooleanFlagValue('agentEnabled', false);
  const speechEnabled = useBooleanFlagValue('agentSpeechEnabled', false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [proposal, setProposal] = useState<PricedProposal | undefined>();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const { supported: speechSupported, listening, toggle: toggleSpeech } = useSpeechInput(setInput);
  const { emptyCart, addItem, placeOrder } = useCart();
  const { selectedCurrency } = useCurrency();
  const { push } = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Allow other parts of the app (e.g. the hero CTA) to open the assistant.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('pizzatel:open-assistant', onOpen);
    return () => window.removeEventListener('pizzatel:open-assistant', onOpen);
  }, []);

  // Keep the latest message in view as the conversation grows.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, proposal, busy]);

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

  const onApprove = useCallback(async () => {
    if (!proposal || busy) return;
    setBusy(true);
    try {
      const { userId } = SessionGateway.getSession();
      // Clear the cart so the order is exactly the approved lines. The DELETE
      // empties the cart server-side (204); the client promise can still reject
      // because the OTel fetch instrumentation chokes on the empty 204 body
      // ("body stream already read") — that's post-response and harmless, so we
      // swallow it rather than abort the order (matches CartDetail's fire-and-
      // forget use of emptyCart).
      try {
        await emptyCart();
      } catch {
        /* cart already emptied server-side; ignore client-side 204 read error */
      }
      for (const line of proposal.lines) {
        await addItem({ productId: line.productId, quantity: line.quantity });
      }
      const order = await placeOrder({
        userId,
        email: DEMO_CHECKOUT.email,
        address: DEMO_CHECKOUT.address,
        userCurrency: selectedCurrency,
        creditCard: DEMO_CHECKOUT.creditCard,
        orderType: proposal.orderType,
      } as PlaceOrderArg);
      setProposal(undefined);
      setMessages(m => [...m, { role: 'assistant', content: `Order placed! Confirmation #${order.orderId}. Opening your tracker…` }]);
      push({ pathname: `/cart/checkout/${order.orderId}`, query: { order: JSON.stringify(order) } });
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'I could not place the order. Please try from the cart.' }]);
    } finally {
      setBusy(false);
    }
  }, [proposal, busy, emptyCart, addItem, placeOrder, selectedCurrency, push]);
  const onChange = useCallback(() => setProposal(undefined), []);

  if (!enabled) return null;

  if (!open) {
    return (
      <S.Launcher aria-label="Open ordering assistant" onClick={() => setOpen(true)}>
        <S.LauncherIcon aria-hidden>🍕</S.LauncherIcon>
        Order with AI
      </S.Launcher>
    );
  }

  return (
    <S.Panel role="dialog" aria-label="Ordering assistant">
      <S.Header>
        <S.HeaderTitle>
          <S.StatusDot aria-hidden />
          PizzaTel Assistant
        </S.HeaderTitle>
        <S.CloseButton onClick={() => setOpen(false)} aria-label="Close assistant">
          ✕
        </S.CloseButton>
      </S.Header>
      <S.Messages>
        {messages.length === 0 && (
          <S.Bubble $role="assistant">Hi there! Craving something? Tell me what you would like and I will build your order.</S.Bubble>
        )}
        {messages.map((m, i) => (
          <S.Bubble key={i} $role={m.role}>
            {m.content}
          </S.Bubble>
        ))}
        {busy && (
          <S.Typing aria-label="Assistant is typing">
            <span />
            <span />
            <span />
          </S.Typing>
        )}
        {proposal && (
          <S.Card>
            <S.CardTitle>Your order</S.CardTitle>
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
              <S.Button onClick={onApprove} disabled={busy}>
                Place order
              </S.Button>
              <S.Button $variant="ghost" onClick={onChange} disabled={busy}>
                Change something
              </S.Button>
            </S.Actions>
          </S.Card>
        )}
        <div ref={messagesEndRef} />
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
        {speechEnabled && speechSupported && (
          <S.Button type="button" $variant="ghost" onClick={toggleSpeech} aria-label="Speak your order">
            {listening ? '⏺' : '🎤'}
          </S.Button>
        )}
        <S.Button type="submit" disabled={busy}>
          Send
        </S.Button>
      </S.InputRow>
    </S.Panel>
  );
};

export default AgentChat;
