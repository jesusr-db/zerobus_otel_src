# Plan 4a summary — identity & store context live + threading verified (2026-06-14)

Foundation for the website⇄model recommendation integration. Built on `feat/pizzatel-plan4a-identity-store` via subagent-driven development (implementer → spec/quality + adversarial review per task).

## What shipped
- **Seed transforms** `unit_to_store` + `profile_to_doc` (`provisioning/src/seed_transform.py`, pytest 5/5).
- **Reference-data export** from the `pizzatel_seed_export` job: `stores.json` (250) + `profiles.json` (50), baked into `src/frontend/public/`.
- **Session** carries `storeId`/`profileId`/`memberId` (`Session.gateway.ts`, guest cold-start default).
- **`/api/stores` + StorePicker** (metro-grouped) and **`/api/profiles` + ProfilePicker** ("shop as", sets profile + loyalty member), mounted in the header next to the currency switcher.
- **Threading**: `Api.gateway.ts` reads the live session at call time and sends `storeId`/`profileId`/`memberId` on `/api/recommendations`; the BFF records them + `cart_size` as OTel span attributes. No gRPC/proto change.

## CRITICAL correction caught by adversarial review
The original profiles export keyed on `guest_profile.guest_profile_id` (16-digit surrogate) — which is **disjoint from order history** (a named profile had 0 orders). The reviewer proved the real join key is **`guest_order.profile_id` (1–50,000)**, which also equals the loyalty `member_id`. The export was redone to key on it: all sampled profile IDs join to real orders (39 each) and **50/50 carry a real loyalty tier** (gold/silver/platinum/bronze); display names are borrowed cosmetically. The **contract + spec entity-ID sections were corrected** accordingly. This fix is what makes personalization actually work.

## Other review fixes
- Picker **SSR hydration** mismatch → read localStorage in `useEffect` (matches Footer/CartDetail pattern); also fixes the controlled-select flash.
- `Allow: GET` header on the 405 responses.
- **Liveness bug**: `Api.gateway.ts` read the session at module scope (stale) → moved the dynamic IDs to a call-time `getSession()` so picker changes take effect without a reload.
- Confirmed safe: the `fs.readFileSync(process.cwd()/public/...)` pattern works in the Next standalone container (Dockerfile `WORKDIR /app` + `COPY public/`).

## Verification (live, full stack)
- `/api/stores` → 250; `/api/profiles` → 50 (profile 748 = "Curtis Guerrero", tier gold, home store 4).
- Drove `/api/recommendations?...&profileId=748&storeId=4&memberId=748` with a 2-item cart → **span attributes in `jmrdemo.zerobus.otel_spans`**: `app.recommendation.profile_id=748, store_id=4, member_id=748, cart_size=2`. Load-gen traffic shows the guest/empty path too. Threading proven end-to-end.

## Out of scope (next)
- **Plan 4b** — the serving-call wrapper + actual model endpoint call (blocked on the model team filling the contract).
- Order-side `store_id` threading into the order/tracker (replaces the order-tracker placeholder) — separate follow-up.

## Env note
Frontend is a local image build via the npm mirror (temp `src/frontend/Dockerfile.mirror-buildtest`, deleted after use; CI rebuilds normally).
