// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import SessionGateway from '../gateways/Session.gateway';

// Identity the storefront sends to the recommendation model (contract §1.2/§1.4):
// profileId is the real synth join key; memberId mirrors profileId in this data;
// storeId is the active unit. Held in context so the header pickers and the
// page-level AdProvider stay in sync and recommendations refetch on change —
// mirrors Currency.provider so selectedCurrency's proven pattern extends to identity.
const { profileId: initialProfileId, memberId: initialMemberId, storeId: initialStoreId } =
  SessionGateway.getSession();

interface IContext {
  profileId: string;
  memberId: string;
  storeId: string;
  setProfile(profileId: string, memberId: string): void;
  setStore(storeId: string): void;
}

export const Context = createContext<IContext>({
  profileId: 'guest',
  memberId: '',
  storeId: '',
  setProfile: () => ({}),
  setStore: () => ({}),
});

interface IProps {
  children: React.ReactNode;
}

export const useSession = () => useContext(Context);

const SessionProvider = ({ children }: IProps) => {
  const [profileId, setProfileId] = useState<string>('guest');
  const [memberId, setMemberId] = useState<string>('');
  const [storeId, setStoreId] = useState<string>('');

  // localStorage is only available client-side, so hydrate after mount (same as
  // Currency.provider). SSR renders the guest defaults, the client corrects them.
  useEffect(() => {
    setProfileId(initialProfileId);
    setMemberId(initialMemberId);
    setStoreId(initialStoreId);
  }, []);

  const setProfile = useCallback((nextProfileId: string, nextMemberId: string) => {
    setProfileId(nextProfileId);
    setMemberId(nextMemberId);
    SessionGateway.setSessionValue('profileId', nextProfileId);
    SessionGateway.setSessionValue('memberId', nextMemberId);
  }, []);

  const setStore = useCallback((nextStoreId: string) => {
    setStoreId(nextStoreId);
    SessionGateway.setSessionValue('storeId', nextStoreId);
  }, []);

  const value = useMemo(
    () => ({ profileId, memberId, storeId, setProfile, setStore }),
    [profileId, memberId, storeId, setProfile, setStore]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export default SessionProvider;
