// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled, { keyframes } from 'styled-components';
import Button from '../Button';

const riseIn = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

export const Banner = styled.section`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
  background: radial-gradient(120% 120% at 15% 0%, ${({ theme }) => theme.colors.surfaceSunken} 0%, ${({ theme }) =>
    theme.colors.surface} 55%);
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  ${({ theme }) => theme.breakpoints.desktop} {
    flex-direction: row;
    align-items: center;
    min-height: min(78vh, 720px);
    gap: 40px;
    padding: 40px 40px 40px 0;
    max-width: 1320px;
    margin: 0 auto;
    width: 100%;
  }
`;

export const TextContainer = styled.div`
  padding: 44px 24px 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 22px;
  animation: ${riseIn} 0.7s ${({ theme }) => theme.ease} both;

  ${({ theme }) => theme.breakpoints.desktop} {
    width: 52%;
    padding: 0 0 0 40px;
    gap: 26px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const Eyebrow = styled.span`
  display: inline-flex;
  align-items: center;
  font-family: 'Instrument Sans', sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.colors.brand};
  background: ${({ theme }) => theme.colors.brandSoft};
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.radius.pill};
`;

export const Title = styled.h1`
  font-size: 44px;
  margin: 0;
  font-weight: 800;

  ${({ theme }) => theme.breakpoints.desktop} {
    font-size: 72px;
  }
`;

export const Accent = styled.span`
  color: ${({ theme }) => theme.colors.brand};
`;

export const Subtitle = styled.p`
  margin: 0;
  font-family: 'Instrument Sans', sans-serif;
  font-size: 17px;
  font-weight: 400;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.inkMuted};
  max-width: 46ch;

  ${({ theme }) => theme.breakpoints.desktop} {
    font-size: 19px;
  }
`;

export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  width: 100%;

  ${({ theme }) => theme.breakpoints.desktop} {
    width: auto;
  }
`;

export const PrimaryButton = styled(Button)`
  width: 100%;

  ${({ theme }) => theme.breakpoints.desktop} {
    width: auto;
  }
`;

export const GhostButton = styled(Button).attrs({ $type: 'secondary' })`
  width: 100%;

  ${({ theme }) => theme.breakpoints.desktop} {
    width: auto;
  }
`;

export const ImageContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 24px 48px;

  ${({ theme }) => theme.breakpoints.desktop} {
    width: 48%;
    padding: 0;
  }
`;

export const Glow = styled.div`
  position: absolute;
  inset: 0;
  margin: auto;
  width: 74%;
  aspect-ratio: 1;
  background: radial-gradient(circle, rgba(242, 169, 0, 0.28) 0%, rgba(242, 169, 0, 0) 68%);
  filter: blur(8px);
  pointer-events: none;
`;

export const BannerImg = styled.img.attrs({
  src: '/images/hero-pizza.jpg',
  alt: 'A freshly made supreme pizza',
})`
  position: relative;
  width: 100%;
  max-width: 340px;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 50%;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  animation: ${spin} 60s linear infinite;

  ${({ theme }) => theme.breakpoints.desktop} {
    max-width: 460px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
