# Model-team request: emit `custom_outputs.recommendations`

**Status:** 🟨 OPEN — web side shipped and live; blocked on the agent endpoint.
**Raised:** 2026-07-23 (web) · **Owner (web):** jesus.rodriguez · **Endpoint:** `synth_qsr-commerce-agent`
**Contract reference:** [`agent-endpoint-contract.md`](./agent-endpoint-contract.md) §3.3 + the 2026-07-23 ledger row.

## The ask

On **recommend-intent** turns ("what do you recommend?", "suggest something", "what's popular?"), please have the agent return a **structured** `custom_outputs.recommendations` array **in addition to** (or instead of) the prose it returns today.

```json
"custom_outputs": {
  "recommendations": [
    { "menu_item_id": 1, "quantity": 2 },
    { "menu_item_id": 14 }
  ]
}
```

- `menu_item_id`: **integer, required** — same catalog id space as `propose_order`.
- `quantity`: **integer, optional** — web defaults to 1 when absent.
- Indicative prices are ignored — the **web BFF is the pricing authority** and re-prices against the live catalog (identical rule to `propose_order`, §3.1).
- Purely **additive**: no request-shape change, no response-shape change beyond this one `custom_outputs` key.

## Why (what's blocked without it)

The storefront chat now renders **per-product recommendation cards with a "+" add-to-cart button** when this channel is present. The web + BFF + mock parity are shipped, unit-tested, and browser-validated behind the `agentEnabled` flag.

**Live today the cards do not appear**, because the deployed agent answers recommend-intent as **prose** ("🍕 Pepperoni Pizza — a classic favorite…") with **no** `custom_outputs.recommendations` key. Verified 2026-07-23 against the live endpoint:

```
POST /api/agent-chat  "what do you recommend?"
→ reply: "Since you're new here, let me suggest some of our most popular items: 🍕 Pepperoni Pizza…"
→ recommendations field: absent
→ agentTraceId: tr-5206100ffa4c088b2216a1c28d76a501
```

Until the channel is populated, live turns simply show no cards (safe degradation); the frontend needs **no further change** — cards light up automatically once the key is returned.

## Related caveat (same root as an open §0 item)

The existing **`menu_item_id` → storefront `ProductCatalog` mapping divergence** (contract §0, non-pepperoni/cheese ids) applies here too: the BFF **drops** any `menu_item_id` absent from the live catalog (never faked), so a wrong/unmapped id silently yields no card or the wrong item. Fixing the mapping benefits both `propose_order` and this new channel.

## Verify once shipped

Re-run the probe above; expect a non-empty `recommendations` array back, and cards to render in the chat on recommend-intent (no frontend redeploy needed).
