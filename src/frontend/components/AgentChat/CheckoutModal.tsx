// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from 'react';
import CheckoutForm, { IFormData } from '../CheckoutForm/CheckoutForm';
import * as S from './AgentChat.styled';

interface IProps {
  onClose(): void;
  onSubmit(formData: IFormData): void;
}

// Hand-rolled modal (the codebase has no modal library). Backdrop click and
// Escape close it; focus lands on the close button on open; aria-modal traps
// intent for assistive tech. Matches the existing styled-components pattern.
const CheckoutModal = ({ onClose, onSubmit }: IProps) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <S.ModalBackdrop role="presentation" onClick={onClose}>
      <S.ModalPanel role="dialog" aria-modal="true" aria-label="Checkout" onClick={e => e.stopPropagation()}>
        <S.ModalHeader>
          Checkout
          <S.CloseButton ref={closeRef} onClick={onClose} aria-label="Close checkout">
            ✕
          </S.CloseButton>
        </S.ModalHeader>
        <S.ModalBody>
          <CheckoutForm onSubmit={onSubmit} />
        </S.ModalBody>
      </S.ModalPanel>
    </S.ModalBackdrop>
  );
};

export default CheckoutModal;
