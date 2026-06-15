// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import SessionGateway from '../../gateways/Session.gateway';
import { CypressFields } from '../../utils/enums/CypressFields';
import * as S from './ProfilePicker.styled';

interface Profile { id: string; name: string; member_id: string | null; tier: string; home_store_id: string; zip: string | null }

const ProfilePicker = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState('guest');

  useEffect(() => {
    setProfileId(SessionGateway.getSession().profileId);
  }, []);

  useEffect(() => {
    fetch('/api/profiles')
      .then(r => r.json())
      .then(d => setProfiles(d.profiles ?? []))
      .catch(() => setProfiles([]));
  }, []);

  const onChange = (value: string) => {
    setProfileId(value);
    const picked = profiles.find(p => p.id === value);
    SessionGateway.setSessionValue('profileId', value);
    SessionGateway.setSessionValue('memberId', picked?.member_id ?? '');
  };

  return (
    <S.ProfilePicker>
      <S.Select
        name="profile_id"
        value={profileId}
        onChange={e => onChange(e.target.value)}
        data-cy={CypressFields.ProfilePicker}
      >
        <option value="guest">Guest</option>
        {profiles.map(p => (
          <option key={p.id} value={p.id}>{`${p.name} (${p.tier})`}</option>
        ))}
      </S.Select>
    </S.ProfilePicker>
  );
};

export default ProfilePicker;
