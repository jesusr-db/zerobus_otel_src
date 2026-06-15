// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from 'react';
import SessionGateway from '../../gateways/Session.gateway';
import { CypressFields } from '../../utils/enums/CypressFields';
import * as S from './StorePicker.styled';

interface Store { id: string; name: string; city: string; state: string; metro: string }

const StorePicker = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');

  useEffect(() => {
    setStoreId(SessionGateway.getSession().storeId);
  }, []);

  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.json())
      .then(d => setStores(d.stores ?? []))
      .catch(() => setStores([]));
  }, []);

  const byMetro = useMemo(() => {
    const groups: Record<string, Store[]> = {};
    for (const s of stores) {
      if (!groups[s.metro]) groups[s.metro] = [];
      groups[s.metro].push(s);
    }
    return groups;
  }, [stores]);

  const onChange = (value: string) => {
    setStoreId(value);
    SessionGateway.setSessionValue('storeId', value);
  };

  return (
    <S.StorePicker>
      <S.Select
        name="store_id"
        value={storeId}
        onChange={e => onChange(e.target.value)}
        data-cy={CypressFields.StorePicker}
      >
        <option value="">Select a store</option>
        {Object.entries(byMetro).map(([metro, list]) => (
          <optgroup key={metro} label={metro}>
            {list.map(s => (
              <option key={s.id} value={s.id}>{`${s.name} — ${s.city}, ${s.state}`}</option>
            ))}
          </optgroup>
        ))}
      </S.Select>
    </S.StorePicker>
  );
};

export default StorePicker;
