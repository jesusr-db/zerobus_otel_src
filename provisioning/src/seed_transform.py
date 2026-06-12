"""Pure transforms: synth_ref rows -> product-catalog Product-shaped dicts.

No Spark here so it is unit-testable. The Spark notebook imports these.
The output dict matches the protojson shape of oteldemo.Product:
  id, name, description, picture, priceUsd{currencyCode,units,nanos}, categories[]
"""
from __future__ import annotations


def usd_money(price: float) -> dict:
    """Split a USD float into protobuf Money (units + nanos)."""
    units = int(price)
    nanos = round((price - units) * 1_000_000_000)
    return {"currencyCode": "USD", "units": units, "nanos": nanos}


def menu_item_to_product(row: dict) -> dict:
    """Map a synth_ref.menu_item row to a Product-shaped dict."""
    item_id = str(row["menu_item_id"])
    name = row["item_name"]  # synth_ref.menu_item column is item_name, not name
    categories = [c for c in (row.get("category"), row.get("subcategory")) if c]
    return {
        "id": item_id,
        "name": name,
        "description": f"{name} — freshly made to order.",
        "picture": f"pizza-{item_id}.jpg",
        "priceUsd": usd_money(float(row["base_price"])),
        "categories": categories,
    }
