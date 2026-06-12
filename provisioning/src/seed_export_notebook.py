# Databricks notebook source
# Reads synth_ref.* (read-only) -> writes pizzatel curated tables + offline pizza_menu.json.
import json

# The bundle syncs provisioning/ so seed_transform.py lands next to this notebook at runtime
# (.../files/src/). Import as a sibling; fall back to the package path for local/package use.
try:
    from seed_transform import menu_item_to_product
except ModuleNotFoundError:
    from src.seed_transform import menu_item_to_product

dbutils.widgets.text("catalog", "jmrdemo")
dbutils.widgets.text("demo_schema", "pizzatel")
dbutils.widgets.text("export_volume", "exports")
catalog = dbutils.widgets.get("catalog")
demo_schema = dbutils.widgets.get("demo_schema")
export_volume = dbutils.widgets.get("export_volume")

# --- curated menu table (snapshot of synth_ref.menu_item) ---
# Keep active + lto (limited-time-offer) items; column is item_name (not name).
menu = spark.table(f"{catalog}.synth_ref.menu_item").select(
    "menu_item_id", "item_name", "category", "subcategory", "base_price", "item_status"
)
menu.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(
    f"{catalog}.{demo_schema}.menu"
)

# --- curated stores snapshot (explicit projection of demo-relevant columns) ---
stores = spark.table(f"{catalog}.synth_ref.unit").select(
    "unit_id", "unit_name", "city", "state", "lat", "lon",
    "metro_area", "region_id", "franchisee_id", "format", "status",
)
stores.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(
    f"{catalog}.{demo_schema}.stores"
)

# --- offline export: products.json-shaped pizza menu ---
rows = [r.asDict() for r in menu.collect()]
products = {"products": [menu_item_to_product(r) for r in rows]}
out_path = f"/Volumes/{catalog}/{demo_schema}/{export_volume}/pizza_menu.json"
dbutils.fs.put(out_path, json.dumps(products, indent=2), overwrite=True)
print(f"Wrote {len(products['products'])} products to {out_path}")
