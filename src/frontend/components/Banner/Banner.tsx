// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link';
import { useBooleanFlagValue } from '@openfeature/react-sdk';
import * as S from './Banner.styled';

const Banner = () => {
  const agentEnabled = useBooleanFlagValue('agentEnabled', false);

  const openAssistant = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pizzatel:open-assistant'));
    }
  };

  return (
    <S.Banner>
      <S.TextContainer>
        <S.Eyebrow>Hand-stretched · Fired in 90 seconds</S.Eyebrow>
        <S.Title>
          Great pizza,
          <br />
          <S.Accent>built your way.</S.Accent>
        </S.Title>
        <S.Subtitle>
          Fresh dough, real ingredients, made to order. Browse the menu or just tell our assistant what you are craving.
        </S.Subtitle>
        <S.Actions>
          <Link href="#hot-products">
            <S.PrimaryButton>Browse the menu</S.PrimaryButton>
          </Link>
          {agentEnabled && (
            <S.GhostButton type="button" onClick={openAssistant}>
              Order with the assistant
            </S.GhostButton>
          )}
        </S.Actions>
      </S.TextContainer>
      <S.ImageContainer>
        <S.Glow aria-hidden />
        <S.BannerImg />
      </S.ImageContainer>
    </S.Banner>
  );
};

export default Banner;
