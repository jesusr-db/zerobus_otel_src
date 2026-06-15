# PizzaTel Plan 4a — Identity & Store Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "shop as profile/loyalty member" picker and a store picker to the storefront, seeded from synth reference data with the canonical entity IDs, and thread `profile_id`/`member_id`/`store_id` (plus the live cart) into the recommendation request path — the foundation the external recommendation model needs.

**Architecture:** Two reference files (`stores.json`, `profiles.json`) are exported from synth data by the existing seed job and baked into the frontend `public/`. Two header pickers (mirroring `CurrencySwitcher`) write the selected IDs into the existing `localStorage` session (`Session.gateway.ts`). The recommendation BFF reads those IDs from the request and records them as OpenTelemetry span attributes, proving end-to-end threading now; Plan 4b will forward them to the model endpoint. No gRPC/proto changes.

**Tech Stack:** Next.js/TypeScript + styled-components (frontend), Python/PySpark (seed job, pytest), Databricks Asset Bundle. Frontend image builds use the npm-mirror recipe (registry.npmjs.org is DNS-blocked here — see Appendix).

## Spec
`docs/superpowers/specs/2026-06-14-plan4-website-model-integration-design.md` (Plan 4a section) + contract `docs/integration/recommendation-endpoint-contract.md`.

## Scope
**In:** pickers, session fields, synth reference-data export, threading IDs + live cart into the recommendation request (observable via span attributes).
**Deferred (NOT in 4a):** order-side `store_id` threading into the order/tracker (replaces the order-tracker placeholder — needs checkout-metadata/proto work; its own follow-up). The serving-call wrapper + actual model call is **Plan 4b** (blocked on the model team's contract values).

## Entity-ID facts (verified)
- Store key = `synth_ref.unit.unit_id` (also in `jmrdemo.pizzatel.stores`); 250 stores.
- Profile key = `synth_silver.guest_profile.guest_profile_id`; loyalty `member_id` + `tier` come from `synth_silver.loyalty_transaction` (latest tier per member), linked to a profile via `synth_silver.guest_order` (which carries both `profile_id` and `member_id`).
- Catalog `product_id == str(menu_item_id)` (already aligned).

## File Structure
- `provisioning/src/seed_transform.py` — **modify**: add `unit_to_store`, `profile_to_doc` pure transforms.
- `provisioning/tests/test_seed_transform.py` — **modify**: tests for the two new transforms.
- `provisioning/src/seed_export_notebook.py` — **modify**: export `stores.json` + `profiles.json` to the volume.
- `src/frontend/public/stores.json`, `src/frontend/public/profiles.json` — **new** (downloaded from the volume).
- `src/frontend/gateways/Session.gateway.ts` — **modify**: add `storeId`/`profileId`/`memberId` to `ISession` + defaults.
- `src/frontend/pages/api/stores.ts`, `src/frontend/pages/api/profiles.ts` — **new** instrumented BFF endpoints.
- `src/frontend/components/StorePicker/` , `src/frontend/components/ProfilePicker/` — **new** (each: `.tsx`, `.styled.ts`, `index.ts`).
- `src/frontend/components/Header/Header.tsx` — **modify**: mount both pickers.
- `src/frontend/utils/enums/CypressFields.ts` — **modify**: add picker field ids.
- `src/frontend/gateways/Api.gateway.ts` + `src/frontend/pages/api/recommendations.ts` — **modify**: thread IDs into the rec request + record span attributes.

---

## Task 1: Synth → store/profile transforms (TDD)

**Files:**
- Modify: `provisioning/src/seed_transform.py`
- Test: `provisioning/tests/test_seed_transform.py`

- [ ] **Step 1: Write failing tests**

Append to `provisioning/tests/test_seed_transform.py`:
```python
from src.seed_transform import unit_to_store, profile_to_doc


def test_unit_to_store_maps_synth_unit_to_picker_shape():
    row = {
        "unit_id": 42,
        "unit_name": "Mountain View #42",
        "city": "Mountain View",
        "state": "CA",
        "metro_area": "SF Bay Area",
    }
    store = unit_to_store(row)
    assert store == {
        "id": "42",
        "name": "Mountain View #42",
        "city": "Mountain View",
        "state": "CA",
        "metro": "SF Bay Area",
    }


def test_profile_to_doc_maps_profile_and_loyalty():
    row = {
        "guest_profile_id": 1234,
        "first_name": "Larry",
        "last_name": "Page",
        "member_id": 5678,
        "tier": "Gold",
        "unit_id": 42,
        "zip_code": "94043",
    }
    doc = profile_to_doc(row)
    assert doc == {
        "id": "1234",
        "name": "Larry Page",
        "member_id": "5678",
        "tier": "Gold",
        "home_store_id": "42",
        "zip": "94043",
    }


def test_profile_to_doc_handles_missing_loyalty():
    row = {
        "guest_profile_id": 9,
        "first_name": "Anon",
        "last_name": "Guest",
        "member_id": None,
        "tier": None,
        "unit_id": 7,
        "zip_code": "00000",
    }
    doc = profile_to_doc(row)
    assert doc["member_id"] is None
    assert doc["tier"] == "None"
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd provisioning && python -m pytest tests/test_seed_transform.py -k "unit_to_store or profile_to_doc" -v`
Expected: FAIL — `cannot import name 'unit_to_store'`.

- [ ] **Step 3: Implement the transforms**

Append to `provisioning/src/seed_transform.py`:
```python
def unit_to_store(row: dict) -> dict:
    """synth_ref.unit row -> compact store doc for the storefront picker."""
    return {
        "id": str(row["unit_id"]),
        "name": row["unit_name"],
        "city": row["city"],
        "state": row["state"],
        "metro": row["metro_area"],
    }


def profile_to_doc(row: dict) -> dict:
    """guest_profile (+ joined loyalty member_id/tier) -> 'shop as' picker doc.

    member_id is None when the profile has no loyalty membership; tier falls back
    to the string "None" so the UI always has a label.
    """
    member_id = row.get("member_id")
    return {
        "id": str(row["guest_profile_id"]),
        "name": f'{row["first_name"]} {row["last_name"]}',
        "member_id": str(member_id) if member_id is not None else None,
        "tier": str(row.get("tier")),
        "home_store_id": str(row["unit_id"]),
        "zip": row["zip_code"],
    }
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `cd provisioning && python -m pytest tests/test_seed_transform.py -v`
Expected: PASS (all, including the pre-existing menu_item tests).

- [ ] **Step 5: Commit**

```bash
git add provisioning/src/seed_transform.py provisioning/tests/test_seed_transform.py
git commit -m "feat(provisioning): unit_to_store + profile_to_doc seed transforms (tested)

Co-authored-by: Isaac"
```

---

## Task 2: Export stores.json + profiles.json from the seed job

**Files:**
- Modify: `provisioning/src/seed_export_notebook.py`
- Create (downloaded): `src/frontend/public/stores.json`, `src/frontend/public/profiles.json`

- [ ] **Step 1: Add the exports to the notebook**

In `provisioning/src/seed_export_notebook.py`, after the existing `pizza_menu.json` export block, add:
```python
# --- store reference (for the storefront store picker) ---
from src.seed_transform import unit_to_store, profile_to_doc

store_rows = spark.table(f"{catalog}.{demo_schema}.stores").select(
    "unit_id", "unit_name", "city", "state", "metro_area"
).collect()
stores_doc = {"stores": [unit_to_store(r.asDict()) for r in store_rows]}
stores_path = f"/Volumes/{catalog}/{demo_schema}/{export_volume}/stores.json"
dbutils.fs.put(stores_path, json.dumps(stores_doc, indent=2), overwrite=True)
print(f"Wrote {len(stores_doc['stores'])} stores to {stores_path}")

# --- profile reference (a demo sample for the 'shop as' picker) ---
# Sample 50 profiles that have placed an order with a loyalty member_id, joined to
# their latest loyalty tier. guest_order links profile_id <-> member_id.
profile_sql = f"""
WITH linked AS (
  SELECT go.profile_id, go.member_id,
         ROW_NUMBER() OVER (PARTITION BY go.profile_id ORDER BY go.placed_at DESC) AS rn
  FROM {catalog}.synth_silver.guest_order go
  WHERE go.member_id IS NOT NULL
),
latest_tier AS (
  SELECT member_id, tier,
         ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY transaction_at DESC) AS rn
  FROM {catalog}.synth_silver.loyalty_transaction
)
SELECT p.guest_profile_id, p.first_name, p.last_name, p.unit_id, p.zip_code,
       l.member_id, t.tier
FROM {catalog}.synth_silver.guest_profile p
JOIN linked l ON l.profile_id = p.guest_profile_id AND l.rn = 1
LEFT JOIN latest_tier t ON t.member_id = l.member_id AND t.rn = 1
LIMIT 50
"""
profile_rows = spark.sql(profile_sql).collect()
profiles_doc = {"profiles": [profile_to_doc(r.asDict()) for r in profile_rows]}
profiles_path = f"/Volumes/{catalog}/{demo_schema}/{export_volume}/profiles.json"
dbutils.fs.put(profiles_path, json.dumps(profiles_doc, indent=2), overwrite=True)
print(f"Wrote {len(profiles_doc['profiles'])} profiles to {profiles_path}")
```

- [ ] **Step 2: Run the seed job**

Run: `cd provisioning && databricks bundle run pizzatel_seed_export -t dev`
Expected: job succeeds; output logs `Wrote 250 stores ...` and `Wrote 50 profiles ...`.

- [ ] **Step 3: Download both files into the frontend**

Run:
```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
databricks fs cp dbfs:/Volumes/jmrdemo/pizzatel/exports/stores.json src/frontend/public/stores.json --profile DEFAULT
databricks fs cp dbfs:/Volumes/jmrdemo/pizzatel/exports/profiles.json src/frontend/public/profiles.json --profile DEFAULT
```
Verify: `python3 -c "import json; print(len(json.load(open('src/frontend/public/stores.json'))['stores']), len(json.load(open('src/frontend/public/profiles.json'))['profiles']))"` → prints `250 50`.

- [ ] **Step 4: Commit**

```bash
git add provisioning/src/seed_export_notebook.py src/frontend/public/stores.json src/frontend/public/profiles.json
git commit -m "feat(provisioning): export stores.json + profiles.json (synth-aligned entity ids)

Co-authored-by: Isaac"
```

---

## Task 3: Extend the session with store/profile/member IDs

**Files:**
- Modify: `src/frontend/gateways/Session.gateway.ts`

- [ ] **Step 1: Add the fields + guest defaults**

In `src/frontend/gateways/Session.gateway.ts`, update the `ISession` interface and `defaultSession`:
```ts
interface ISession {
  userId: string;
  currencyCode: string;
  storeId: string;
  profileId: string;
  memberId: string;
}

const sessionKey = 'session';
const defaultSession = {
  userId: v4(),
  currencyCode: 'USD',
  storeId: '',
  profileId: 'guest',
  memberId: '',
};
```
(`profileId: 'guest'` is the cold-start identity the contract references; empty `storeId`/`memberId` mean "none selected".)

- [ ] **Step 2: Typecheck**

Run: `cd src/frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/gateways/Session.gateway.ts
git commit -m "feat(frontend): session carries storeId/profileId/memberId (guest default)

Co-authored-by: Isaac"
```

---

## Task 4: Stores BFF + StorePicker component

**Files:**
- Create: `src/frontend/pages/api/stores.ts`, `src/frontend/components/StorePicker/{StorePicker.tsx,StorePicker.styled.ts,index.ts}`
- Modify: `src/frontend/utils/enums/CypressFields.ts`

- [ ] **Step 1: Add a Cypress field id**

In `src/frontend/utils/enums/CypressFields.ts`, add to the enum:
```ts
  StorePicker = 'store-picker',
  ProfilePicker = 'profile-picker',
```

- [ ] **Step 2: Stores BFF endpoint** (serves the baked file)

Create `src/frontend/pages/api/stores.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import InstrumentationMiddleware from '../../utils/telemetry/InstrumentationMiddleware';

export type Store = { id: string; name: string; city: string; state: string; metro: string };
type TResponse = { stores: Store[] };

const handler = ({ method }: NextApiRequest, res: NextApiResponse<TResponse | string>) => {
  if (method !== 'GET') return res.status(405).end();
  const file = path.join(process.cwd(), 'public', 'stores.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as TResponse;
  return res.status(200).json(data);
};

export default InstrumentationMiddleware(handler);
```

- [ ] **Step 3: StorePicker styled** — create `src/frontend/components/StorePicker/StorePicker.styled.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';

export const StorePicker = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

export const Select = styled.select`
  appearance: none;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.sizes.dSmall};
  padding: 8px 24px 8px 8px;
  cursor: pointer;
`;
```

- [ ] **Step 4: StorePicker component** — create `src/frontend/components/StorePicker/StorePicker.tsx`:
```tsx
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from 'react';
import SessionGateway from '../../gateways/Session.gateway';
import { CypressFields } from '../../utils/enums/CypressFields';
import * as S from './StorePicker.styled';

interface Store { id: string; name: string; city: string; state: string; metro: string }

const StorePicker = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>(SessionGateway.getSession().storeId);

  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.json())
      .then(d => setStores(d.stores ?? []))
      .catch(() => setStores([]));
  }, []);

  const byMetro = useMemo(() => {
    const groups: Record<string, Store[]> = {};
    for (const s of stores) (groups[s.metro] ??= []).push(s);
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
```

- [ ] **Step 5: Barrel export** — create `src/frontend/components/StorePicker/index.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

export { default } from './StorePicker';
```

- [ ] **Step 6: Typecheck + commit**

Run: `cd src/frontend && npx tsc --noEmit` → exit 0.
```bash
git add src/frontend/pages/api/stores.ts src/frontend/components/StorePicker src/frontend/utils/enums/CypressFields.ts
git commit -m "feat(frontend): /api/stores + StorePicker (metro-grouped, writes session.storeId)

Co-authored-by: Isaac"
```

---

## Task 5: Profiles BFF + ProfilePicker ("shop as")

**Files:**
- Create: `src/frontend/pages/api/profiles.ts`, `src/frontend/components/ProfilePicker/{ProfilePicker.tsx,ProfilePicker.styled.ts,index.ts}`

- [ ] **Step 1: Profiles BFF** — create `src/frontend/pages/api/profiles.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import InstrumentationMiddleware from '../../utils/telemetry/InstrumentationMiddleware';

export type Profile = { id: string; name: string; member_id: string | null; tier: string; home_store_id: string; zip: string };
type TResponse = { profiles: Profile[] };

const handler = ({ method }: NextApiRequest, res: NextApiResponse<TResponse | string>) => {
  if (method !== 'GET') return res.status(405).end();
  const file = path.join(process.cwd(), 'public', 'profiles.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as TResponse;
  return res.status(200).json(data);
};

export default InstrumentationMiddleware(handler);
```

- [ ] **Step 2: ProfilePicker styled** — create `src/frontend/components/ProfilePicker/ProfilePicker.styled.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import styled from 'styled-components';

export const ProfilePicker = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

export const Select = styled.select`
  appearance: none;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.sizes.dSmall};
  padding: 8px 24px 8px 8px;
  cursor: pointer;
`;
```

- [ ] **Step 3: ProfilePicker component** — create `src/frontend/components/ProfilePicker/ProfilePicker.tsx`:
```tsx
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import SessionGateway from '../../gateways/Session.gateway';
import { CypressFields } from '../../utils/enums/CypressFields';
import * as S from './ProfilePicker.styled';

interface Profile { id: string; name: string; member_id: string | null; tier: string; home_store_id: string; zip: string }

const ProfilePicker = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string>(SessionGateway.getSession().profileId);

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
```

- [ ] **Step 4: Barrel export** — create `src/frontend/components/ProfilePicker/index.ts`:
```ts
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

export { default } from './ProfilePicker';
```

- [ ] **Step 5: Typecheck + commit**

Run: `cd src/frontend && npx tsc --noEmit` → exit 0.
```bash
git add src/frontend/pages/api/profiles.ts src/frontend/components/ProfilePicker
git commit -m "feat(frontend): /api/profiles + ProfilePicker ('shop as', writes session.profileId/memberId)

Co-authored-by: Isaac"
```

---

## Task 6: Mount both pickers in the header

**Files:**
- Modify: `src/frontend/components/Header/Header.tsx`

- [ ] **Step 1: Render the pickers next to the currency switcher**

In `src/frontend/components/Header/Header.tsx`, add the imports and render the two pickers next to `<CurrencySwitcher />`:
```tsx
import CurrencySwitcher from '../CurrencySwitcher';
import StorePicker from '../StorePicker';
import ProfilePicker from '../ProfilePicker';
```
And next to the existing `<CurrencySwitcher />` in the JSX:
```tsx
            <ProfilePicker />
            <StorePicker />
            <CurrencySwitcher />
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd src/frontend && npx tsc --noEmit` → exit 0.
```bash
git add src/frontend/components/Header/Header.tsx
git commit -m "feat(frontend): mount StorePicker + ProfilePicker in the header

Co-authored-by: Isaac"
```

---

## Task 7: Thread IDs + live cart into the recommendation request (observable)

**Files:**
- Modify: `src/frontend/gateways/Api.gateway.ts`, `src/frontend/pages/api/recommendations.ts`

- [ ] **Step 1: Send identity + store from the session in the API gateway call**

In `src/frontend/gateways/Api.gateway.ts`, find `listRecommendations(productIds, currencyCode)` and include the session IDs in the query string. Replace the request-build line so it appends `storeId`/`profileId`/`memberId` from `SessionGateway.getSession()`:
```ts
import SessionGateway from './Session.gateway';
// ...
listRecommendations(productIds: string[], currencyCode = '') {
  const { userId, storeId, profileId, memberId } = SessionGateway.getSession();
  const params = new URLSearchParams();
  productIds.forEach(id => params.append('productIds', id));
  params.set('sessionId', userId);
  params.set('currencyCode', currencyCode);
  params.set('storeId', storeId);
  params.set('profileId', profileId);
  params.set('memberId', memberId);
  return request<Product[]>({
    url: `${basePath}/recommendations?${params.toString()}`,
    method: 'GET',
  });
},
```
(Match the file's existing `request`/`basePath` helpers — keep the existing return type `Product[]`. If the current signature is `listRecommendations(productIds, currencyCode)` keep it; callers already pass `(productIds, selectedCurrency)`.)

- [ ] **Step 2: Record the IDs as span attributes in the BFF**

In `src/frontend/pages/api/recommendations.ts`, read the new query params and attach them to the active span (proves end-to-end threading; Plan 4b forwards them to the model). Update the handler:
```ts
import { trace } from '@opentelemetry/api';
// ...
case 'GET': {
  const { productIds = [], sessionId = '', currencyCode = '', storeId = '', profileId = '', memberId = '' } = query;
  trace.getActiveSpan()?.setAttributes({
    'app.recommendation.store_id': String(storeId),
    'app.recommendation.profile_id': String(profileId),
    'app.recommendation.member_id': String(memberId),
    'app.recommendation.cart_size': (productIds as string[]).length,
  });
  const { productIds: productList } = await RecommendationsGateway.listRecommendations(
    sessionId as string,
    productIds as string[]
  );
  // ...unchanged below...
}
```

- [ ] **Step 3: Typecheck**

Run: `cd src/frontend && npx tsc --noEmit` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/gateways/Api.gateway.ts src/frontend/pages/api/recommendations.ts
git commit -m "feat(frontend): thread store/profile/member ids into rec request + span attrs

Co-authored-by: Isaac"
```

---

## Task 8: Integration verification

**Files:** none (verification)

- [ ] **Step 1: Rebuild the frontend image via the npm mirror** (see Appendix) and recreate the container:
```bash
cd /Users/jesus.rodriguez/Documents/ItsAVibe/gitRepos_FY26/opentelemetry-demo
DOCKER_BUILDKIT=1 docker build --network=host -f src/frontend/Dockerfile.mirror-buildtest -t ghcr.io/open-telemetry/demo:latest-frontend .
set -a; source .env; set +a
docker compose -f docker-compose.yml up -d --no-deps --force-recreate frontend
```
- [ ] **Step 2:** Open `http://localhost:8080`. Confirm the **Profile** and **Store** pickers render in the header; pick a profile + store.
- [ ] **Step 3:** Add a pizza to the cart (so the cart has context), then confirm the recommendation call carries the IDs: query Databricks
  `SELECT attributes['app.recommendation.profile_id'], attributes['app.recommendation.store_id'], attributes['app.recommendation.cart_size'] FROM jmrdemo.zerobus.otel_spans WHERE name LIKE '%recommendations%' AND resource.attributes['service.name']='frontend' ORDER BY start_time_unix_nano DESC LIMIT 5`
  Expected: the picked profile/store IDs + a non-zero cart_size appear.
- [ ] **Step 4:** Write `docs/baseline/plan4a-summary.md` (what shipped + the span-attribute evidence); commit.

---

## Appendix — building the frontend with the blocked-proxy mirror
`registry.npmjs.org` is DNS-blocked to 127.0.0.1 here. Build via a temp Dockerfile that sets `ENV npm_config_registry=https://registry.npmmirror.com` before each `npm ci`, built with `docker build --network=host`. (The proven recipe + temp `src/frontend/Dockerfile.mirror-buildtest` are documented in the Plan 2b summary; recreate it if absent. Delete it after building — do not commit it.)

---

## Self-Review notes (author)
- **Spec coverage:** pickers (Tasks 4,5,6), synth reference export with canonical IDs (Tasks 1,2), session fields incl. guest cold-start (Task 3), threading IDs + live-cart size into the rec request with observable span attributes (Task 7), verification (Task 8). Order-side `store_id` threading + the serving wrapper/model call are explicitly deferred (4b / follow-up).
- **Type consistency:** `ISession` adds `storeId/profileId/memberId` (Task 3) used in StorePicker/ProfilePicker (4,5) and Api.gateway (7). Store/Profile JSON shapes from `unit_to_store`/`profile_to_doc` (Task 1) match the TS `Store`/`Profile` types (Tasks 4,5) field-for-field (`id,name,city,state,metro` / `id,name,member_id,tier,home_store_id,zip`).
- **Known assumptions to confirm at execution:** (a) `Api.gateway.ts` exact `request`/`basePath` helper names — Step 7.1 says match existing; (b) the seed job writes to `jmrdemo/pizzatel/exports/` per Plan 1 — the download path mirrors the existing `pizza_menu.json` location; (c) `theme.sizes.dSmall` exists (used by other header components) — swap to an existing size key if tsc complains.
- **No proto/gRPC change:** IDs ride in the BFF request + span attributes only.
