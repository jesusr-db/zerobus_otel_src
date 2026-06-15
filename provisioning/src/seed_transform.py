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
