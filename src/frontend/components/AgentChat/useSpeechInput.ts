// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal Web Speech API wrapper. Browser-only; degrades to unsupported where
// the API is absent (no server-side ASR — see the contract).
export function useSpeechInput(onText: (t: string) => void): {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
} {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? '';
      if (transcript) onText(transcript);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setSupported(true);
    return () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
  }, [onText]);

  const toggle = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      rec.start();
      setListening(true);
    }
  }, [listening]);

  return { supported, listening, toggle };
}
