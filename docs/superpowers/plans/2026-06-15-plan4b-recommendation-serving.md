# PizzaTel Plan 4b — Recommendation Model Serving integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Per the project owner: include **end-to-end UI journey testing** + **adversarial review** for expected functionality.

**Goal:** Replace the recommendation service's random picker with a call to the live Databricks Model Serving endpoint `synth_qsr-recommender`, personalized by `profile_id` + `store_id` + live cart — with a flagd gate and graceful fallback to the existing random/popular recs.

**Architecture:** The frontend already sends `profileId`/`storeId`/`memberId` to the `/api/recommendations` BFF (Plan 4a). This plan threads them into the recommendation **gRPC call as metadata** (the proven checkout pattern), so the Python `recommendation_server.py` can build the model request. A new `external_recommender.py` wrapper builds the `dataframe_records` payload, POSTs to the endpoint (stdlib `urllib`, Bearer token), parses `predictions[0].recommendations[].menu_item_id`, all inside an OTel client span. On flag-off / timeout / error / empty → fall back to today's `get_product_list`. No proto change.

**Tech Stack:** Python 3 (recommendation; stdlib urllib + grpc metadata + OTel), Next.js/TS (BFF + grpc-js metadata), flagd, Docker Compose.

## Contract (authoritative)
`docs/integration/MODEL_TEAM_HANDOFF.md` — endpoint `synth_qsr-recommender`; request `dataframe_records` (ints): `profile_id` (1–50k or `-1` guest sentinel), `member_id` (=profile_id or null), `store_id` (unit_id), `cart_product_ids` (int[]), `viewed_product_id` (int/null), `num_recommendations`. Response: `predictions[0].recommendations[].menu_item_id` (+ score, bonus fields), `personalized` flag; already excludes cart/viewed + sorted. Auth: Bearer PAT with `CAN_QUERY`.

## Config decisions
- HTTP via **stdlib `urllib.request`** (no new dep; npm/pip registries are blocked here anyway).
- Token: reuse the existing `DATABRICKS_API_TOKEN` (same workspace) as `RECOMMENDATION_API_TOKEN`.
- flag: new flagd boolean `recommendationModelEnabled` (default **off** → fallback; demo flips it on).
- Guest sentinel: `profile_id = -1` when the session value is `"guest"`/empty/non-numeric.

## File Structure
- `src/recommendation/external_recommender.py` — **new**: `build_request`, `parse_response` (pure, tested) + `fetch_recommendations` (urllib POST).
- `src/recommendation/external_recommender_test.py` — **new**: unit tests.
- `src/recommendation/recommendation_server.py` — **modify**: read gRPC metadata, flag-gate, call wrapper, client span, fallback.
- `src/frontend/gateways/rpc/Recommendations.gateway.ts` — **modify**: attach gRPC metadata.
- `src/frontend/pages/api/recommendations.ts` — **modify**: pass the query IDs to the gateway.
- `docker-compose.yml` + `.env` — **modify**: `EXTERNAL_RECOMMENDATION_URL`, `RECOMMENDATION_API_TOKEN`, `RECOMMENDATION_DEFAULT_STORE_ID`.
- `src/flagd/demo.flagd.json` — **modify**: add `recommendationModelEnabled`.

---

## Task 1: external_recommender wrapper (TDD, pure parts)

**Files:** create `src/recommendation/external_recommender.py`, `src/recommendation/external_recommender_test.py`

- [ ] **Step 1: Write failing tests** — `external_recommender_test.py`:
```python
from external_recommender import build_request, parse_response


def test_build_request_coerces_ints_and_guest_sentinel():
    req = build_request(profile_id="guest", member_id="", store_id="42",
                        cart_product_ids=["1", "14"], viewed_product_id=None, num=5)
    rec = req["dataframe_records"][0]
    assert rec["profile_id"] == -1          # guest -> sentinel
    assert rec["member_id"] is None
    assert rec["store_id"] == 42
    assert rec["cart_product_ids"] == [1, 14]
    assert rec["viewed_product_id"] is None
    assert rec["num_recommendations"] == 5


def test_build_request_real_profile():
    req = build_request(profile_id="748", member_id="748", store_id="1",
                        cart_product_ids=[], viewed_product_id="8", num=4)
    rec = req["dataframe_records"][0]
    assert rec["profile_id"] == 748
    assert rec["member_id"] == 748
    assert rec["viewed_product_id"] == 8
    assert rec["cart_product_ids"] == []


def test_parse_response_returns_str_ids_and_personalized():
    resp = {"predictions": [{"personalized": True, "recommendations": [
        {"menu_item_id": 53, "score": 0.94}, {"menu_item_id": 61, "score": 0.81}]}]}
    ids, personalized = parse_response(resp)
    assert ids == ["53", "61"]              # ints -> str for the catalog
    assert personalized is True


def test_parse_response_empty_and_missing():
    assert parse_response({"predictions": [{"personalized": False, "recommendations": []}]}) == ([], False)
    assert parse_response({}) == ([], False)
```

- [ ] **Step 2: Run, verify FAIL** — `cd src/recommendation && python -m pytest external_recommender_test.py -v` → FAIL (import error). (If pytest unavailable locally, run in Docker `python:3.12-slim`.)

- [ ] **Step 3: Implement `external_recommender.py`:**
```python
# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0
"""Client wrapper for the Databricks `synth_qsr-recommender` Model Serving endpoint."""
import json
import urllib.request


def _to_int(value, default=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def build_request(profile_id, member_id, store_id, cart_product_ids, viewed_product_id, num):
    pid = _to_int(profile_id, default=-1)   # "guest"/empty/non-numeric -> -1 cold-start sentinel
    return {"dataframe_records": [{
        "profile_id": pid,
        "member_id": _to_int(member_id),     # None when absent
        "store_id": _to_int(store_id),
        "cart_product_ids": [i for i in (_to_int(x) for x in (cart_product_ids or [])) if i is not None],
        "viewed_product_id": _to_int(viewed_product_id),
        "num_recommendations": _to_int(num, default=5),
    }]}


def parse_response(payload):
    """-> (list[str menu_item_id], personalized: bool). Tolerant of missing fields."""
    preds = (payload or {}).get("predictions") or []
    if not preds:
        return [], False
    row = preds[0] or {}
    recs = row.get("recommendations") or []
    ids = [str(r["menu_item_id"]) for r in recs if r.get("menu_item_id") is not None]
    return ids, bool(row.get("personalized", False))


def fetch_recommendations(url, token, payload, timeout=5.0):
    """POST the payload; return parsed (ids, personalized). Raises on HTTP/network error/timeout."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return parse_response(body)
```

- [ ] **Step 4: Run, verify PASS** — `python -m pytest external_recommender_test.py -v` → 4 pass.

- [ ] **Step 5: Commit**
```bash
git add src/recommendation/external_recommender.py src/recommendation/external_recommender_test.py
git commit -m "feat(recommendation): external_recommender wrapper (build/parse/fetch) for synth_qsr-recommender, tested

Co-authored-by: Isaac"
```

---

## Task 2: wire the wrapper into recommendation_server.py (metadata + flag + fallback + span)

**Files:** modify `src/recommendation/recommendation_server.py`

- [ ] **Step 1: Read gRPC metadata in `ListRecommendations`.** `context.invocation_metadata()` returns key/value tuples (keys lowercased). Add a helper + read it:
```python
def _md(context, key):
    for k, v in (context.invocation_metadata() or []):
        if k == key:
            return v
    return ""
```
At the top of `ListRecommendations`, before `get_product_list`:
```python
profile_id = _md(context, "rec-profile-id")
store_id = _md(context, "rec-store-id") or os.environ.get("RECOMMENDATION_DEFAULT_STORE_ID", "")
member_id = _md(context, "rec-member-id")
viewed_product_id = _md(context, "rec-viewed-product-id") or None
```

- [ ] **Step 2: Add the model-backed path with fallback.** Add a module-level helper `model_recommendations(...)` and call it from `ListRecommendations`:
```python
import external_recommender

EXTERNAL_URL = os.environ.get("EXTERNAL_RECOMMENDATION_URL", "")
API_TOKEN = os.environ.get("RECOMMENDATION_API_TOKEN", "")

def model_enabled():
    return api.get_client().get_boolean_value("recommendationModelEnabled", False)

def model_recommendations(product_ids, profile_id, member_id, store_id, viewed_product_id):
    """Returns (ids, ok). ok=False -> caller falls back. Wrapped in a client span."""
    with tracer.start_as_current_span("recommendation.model_call") as span:
        span.set_attribute("app.recommendation.endpoint", "synth_qsr-recommender")
        span.set_attribute("app.recommendation.store_id", str(store_id))
        span.set_attribute("app.recommendation.profile_id", str(profile_id))
        try:
            payload = external_recommender.build_request(
                profile_id, member_id, store_id, list(product_ids), viewed_product_id, 5)
            ids, personalized = external_recommender.fetch_recommendations(EXTERNAL_URL, API_TOKEN, payload)
            span.set_attribute("app.recommendation.personalized", personalized)
            span.set_attribute("app.recommendation.model.count", len(ids))
            span.set_attribute("app.recommendation.cold_start", not personalized)
            return ids, len(ids) > 0
        except Exception as e:
            span.set_attribute("app.recommendation.fallback", True)
            span.record_exception(e)
            return [], False
```
In `ListRecommendations`, choose model vs fallback:
```python
prod_list = []
used_model = False
if EXTERNAL_URL and model_enabled():
    prod_list, used_model = model_recommendations(
        request.product_ids, profile_id, member_id, store_id, viewed_product_id)
if not used_model:
    prod_list = get_product_list(request.product_ids)   # existing random/popular fallback
span = trace.get_current_span()
span.set_attribute("app.products_recommended.count", len(prod_list))
span.set_attribute("app.recommendation.source", "model" if used_model else "catalog")
# ... unchanged response build + metric (tag recommendation.type model/catalog) ...
```
Keep the existing metric line but set `'recommendation.type'` to `'model' if used_model else 'catalog'`.

- [ ] **Step 3: Verify the service imports + builds.** Run in Docker (deps already in the image): `docker run --rm -v "$PWD/src/recommendation":/app -w /app python:3.12-slim python -c "import ast; ast.parse(open('recommendation_server.py').read()); ast.parse(open('external_recommender.py').read()); print('parse OK')"`. (Full runtime import needs the service deps — the rebuild in Task 5 is the real check.)

- [ ] **Step 4: Commit**
```bash
git add src/recommendation/recommendation_server.py
git commit -m "feat(recommendation): model-backed recs via synth_qsr-recommender (flag-gated, metadata-driven, span + fallback)

Co-authored-by: Isaac"
```

---

## Task 3: frontend threads identity into the recommendation gRPC call (metadata)

**Files:** modify `src/frontend/gateways/rpc/Recommendations.gateway.ts`, `src/frontend/pages/api/recommendations.ts`

- [ ] **Step 1: Gateway attaches metadata.** Read `Recommendations.gateway.ts` first. Update `listRecommendations` to accept the IDs + attach gRPC `Metadata` (keys `rec-profile-id`/`rec-store-id`/`rec-member-id`/`rec-viewed-product-id`):
```ts
import { ChannelCredentials, Metadata } from '@grpc/grpc-js';
// ...
listRecommendations(userId: string, productIds: string[], ctx?: { profileId?: string; storeId?: string; memberId?: string; viewedProductId?: string }) {
  const metadata = new Metadata();
  if (ctx?.profileId) metadata.set('rec-profile-id', ctx.profileId);
  if (ctx?.storeId) metadata.set('rec-store-id', ctx.storeId);
  if (ctx?.memberId) metadata.set('rec-member-id', ctx.memberId);
  if (ctx?.viewedProductId) metadata.set('rec-viewed-product-id', ctx.viewedProductId);
  return new Promise<ListRecommendationsResponse>((resolve, reject) =>
    client.listRecommendations({ userId, productIds }, metadata, (error, response) => (error ? reject(error) : resolve(response)))
  );
}
```

- [ ] **Step 2: BFF passes the query IDs.** In `pages/api/recommendations.ts`, the GET case already destructures `storeId`/`profileId`/`memberId` from `query` (Plan 4a). Pass them to the gateway:
```ts
const { productIds = [], sessionId = '', currencyCode = '', storeId = '', profileId = '', memberId = '' } = query;
const { productIds: productList } = await RecommendationsGateway.listRecommendations(
  sessionId as string, productIds as string[],
  { profileId: String(profileId), storeId: String(storeId), memberId: String(memberId) }
);
```
(Keep the existing span-attribute block from Plan 4a.)

- [ ] **Step 3: tsc** — `cd src/frontend && npx tsc --noEmit` → 0.

- [ ] **Step 4: Commit**
```bash
git add src/frontend/gateways/rpc/Recommendations.gateway.ts src/frontend/pages/api/recommendations.ts
git commit -m "feat(frontend): thread profile/store/member into recommendation gRPC metadata

Co-authored-by: Isaac"
```

---

## Task 4: config — env + flagd flag

**Files:** modify `docker-compose.yml`, `.env`, `src/flagd/demo.flagd.json`

- [ ] **Step 1: Env in compose.** Add to the `recommendation` service `environment:` block in `docker-compose.yml`:
```yaml
      - EXTERNAL_RECOMMENDATION_URL
      - RECOMMENDATION_API_TOKEN
      - RECOMMENDATION_DEFAULT_STORE_ID
```

- [ ] **Step 2: `.env`** (uncommitted; add locally) — set:
```
EXTERNAL_RECOMMENDATION_URL=https://adb-7405605519549535.15.azuredatabricks.net/serving-endpoints/synth_qsr-recommender/invocations
RECOMMENDATION_API_TOKEN=${DATABRICKS_API_TOKEN}
RECOMMENDATION_DEFAULT_STORE_ID=1
```
(Reuses the existing `DATABRICKS_API_TOKEN`. Note: `.env` is gitignored/secret-scanned — do not commit it.)

- [ ] **Step 3: flagd flag.** Read `src/flagd/demo.flagd.json`, add a boolean flag matching the existing structure:
```json
"recommendationModelEnabled": {
  "description": "Use the Databricks synth_qsr-recommender model instead of random recs",
  "state": "ENABLED",
  "variants": { "on": true, "off": false },
  "defaultVariant": "off"
}
```

- [ ] **Step 4: Validate compose** — `docker compose -f docker-compose.yml config --quiet && echo OK`. Commit (NOT .env):
```bash
git add docker-compose.yml src/flagd/demo.flagd.json
git commit -m "feat(config): recommendation model endpoint env + recommendationModelEnabled flagd flag

Co-authored-by: Isaac"
```

---

## Task 5: integration verification (fallback + model) + UI journeys + adversarial review + summary

**Files:** none (verification) + `docs/baseline/plan4b-summary.md`

- [ ] **Step 1: Rebuild recommendation + frontend** via the mirror recipe (Appendix); recreate `recommendation frontend flagd`.
- [ ] **Step 2: Fallback path (flag OFF, no token needed).** Drive the UI (Playwright, localhost:8080): pick profile + store, browse, add to cart, open cart. Confirm recommendations still render (random/popular) and `recommendation` logs show **0 errors** + `app.recommendation.source=catalog`. This proves the model path degrades cleanly.
- [ ] **Step 3: Model path (flag ON).** Requires (a) a **valid `DATABRICKS_API_TOKEN`** (refresh if expired — collector/endpoint share it) and (b) the `synth_qsr-recommender` endpoint **live** (model team's setup job run). Flip `recommendationModelEnabled` on (edit demo.flagd.json + recreate flagd, or the flagd UI). Smoke-test the endpoint first (handoff §8 curl). Then drive a UI journey: pizza-only cart for a known profile → confirm a drink/side appears in "You May Also Like"; confirm `recommendation.source=model`, `personalized=true` span attrs. If the endpoint isn't live yet, document that the model path is built + flag-ready and the fallback is verified.
- [ ] **Step 4: Telemetry** — query `jmrdemo.zerobus.otel_spans` for the `recommendation.model_call` span (`app.recommendation.source/personalized/cold_start/model.count`). (Token-dependent.)
- [ ] **Step 5: Adversarial review** — dispatch an adversarial reviewer over the whole change (Python wrapper + server wiring + frontend metadata): verify fallback truly fires on every failure mode (flag off, empty url, timeout, HTTP error, empty recs, malformed json), that `cart_product_ids` ints are correct, the guest sentinel, no secret logged, span/trace continuity, and the metadata keys match end-to-end (`rec-*`).
- [ ] **Step 6:** Write `docs/baseline/plan4b-summary.md`; commit.

---

## Appendix — mirror builds
- recommendation (Python): the prod Dockerfile `pip install`s — pip (pypi) may be reachable; if blocked, use `--index-url`/mirror. Pre-pull `python:3.12-slim`.
- frontend: temp `src/frontend/Dockerfile.mirror-buildtest` (`ENV npm_config_registry=https://registry.npmmirror.com`), `--network=host`; delete after.

## Self-Review notes (author)
- **Spec/contract coverage:** wrapper build/parse/fetch matching handoff §3/§4 (T1); server metadata+flag+span+fallback per §6 (T2); frontend metadata threading (T3); env+flag config (T4); fallback+model+UI+adversarial verification (T5).
- **Metadata key consistency:** frontend sets `rec-profile-id`/`rec-store-id`/`rec-member-id`/`rec-viewed-product-id` (T3); server reads the same (T2). gRPC keys lowercase + dashes.
- **Fallback safety:** model path only taken when `EXTERNAL_URL` set AND flag on AND it returns ≥1 id; every exception → fallback. Default flag off → today's behavior unchanged.
- **Action item to relay:** the website calls with the `DATABRICKS_API_TOKEN` principal (jesus.rodriguez@databricks.com) — give that to the model team for the `CAN_QUERY` grant (handoff §9).
- **Known unknowns at execution:** (a) `Recommendations.gateway.ts` exact client-call arg order for the 3-arg metadata overload; (b) whether the endpoint is live (else verify fallback only); (c) token validity for the live model test.
