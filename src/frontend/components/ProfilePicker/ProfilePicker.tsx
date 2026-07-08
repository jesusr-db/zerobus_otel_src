// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { useSession } from '../../providers/Session.provider';
import { CypressFields } from '../../utils/enums/CypressFields';
import * as S from './ProfilePicker.styled';

interface Profile { id: string; name: string; member_id: string | null; tier: string; home_store_id: string; zip: string | null }

const ProfilePicker = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const { profileId, setProfile } = useSession();

  useEffect(() => {
    fetch('/api/profiles')
      .then(r => r.json())
      .then(d => setProfiles(d.profiles ?? []))
      .catch(() => setProfiles([]));
  }, []);

  const onChange = (value: string) => {
    const picked = profiles.find(p => p.id === value);
    // memberId == profileId in this data (contract §1.4); use the picked profile's
    // member_id, else the profile id itself for a real pick, else empty for guest.
    const memberId = picked?.member_id ?? (value === 'guest' ? '' : value);
    setProfile(value, memberId);
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
