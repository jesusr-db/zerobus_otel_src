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
    # The deployed model signature requires NON-NULL int64 for every id field
    # (verified live: member_id/viewed_product_id=null -> HTTP 400). So absent values
    # become int sentinels, not null: profile/store/viewed -> -1; member -> profile_id
    # (member_id == profile_id in this data per the contract §5).
    pid = _to_int(profile_id, default=-1)   # "guest"/empty/non-numeric -> -1 cold-start sentinel
    return {"dataframe_records": [{
        "profile_id": pid,
        "member_id": _to_int(member_id, default=pid),
        "store_id": _to_int(store_id, default=-1),
        # cart is a JSON STRING (not a raw array) so the model signature stays all-scalar
        # (contract §3, verified live). Empty cart -> "[]".
        "cart_product_ids": json.dumps([i for i in (_to_int(x) for x in (cart_product_ids or [])) if i is not None]),
        "viewed_product_id": _to_int(viewed_product_id, default=-1),
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
