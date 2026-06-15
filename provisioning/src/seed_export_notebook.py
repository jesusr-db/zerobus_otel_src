# Databricks notebook source
# Reads synth_ref.* (read-only) -> writes pizzatel curated tables + offline pizza_menu.json.
import json

# The bundle syncs provisioning/ so seed_transform.py lands next to this notebook at runtime
# (.../files/src/). Import as a sibling; fall back to the package path for local/package use.
try:
    from seed_transform import menu_item_to_product, unit_to_store, profile_to_doc
except ModuleNotFoundError:
    from src.seed_transform import menu_item_to_product, unit_to_store, profile_to_doc

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

# --- store reference (for the storefront store picker) ---
store_rows = spark.table(f"{catalog}.{demo_schema}.stores").select(
    "unit_id", "unit_name", "city", "state", "metro_area"
).collect()
stores_doc = {"stores": [unit_to_store(r.asDict()) for r in store_rows]}
stores_path = f"/Volumes/{catalog}/{demo_schema}/{export_volume}/stores.json"
dbutils.fs.put(stores_path, json.dumps(stores_doc, indent=2), overwrite=True)
print(f"Wrote {len(stores_doc['stores'])} stores to {stores_path}")

# --- profile reference (a demo sample for the 'shop as' picker) ---
# Note: guest_profile.guest_profile_id uses a large-bigint key space that does
# not overlap with guest_order.profile_id (1-50000), so there is no FK bridge
# from guest_profile -> loyalty_transaction via guest_order in the synth data.
# We sample profiles with real names directly; member_id/tier are NULL for all
# (profile_to_doc handles None member_id gracefully).
profile_sql = f"""
WITH latest_tier AS (
  SELECT member_id, tier,
         ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY transaction_at DESC) AS rn
  FROM {catalog}.synth_silver.loyalty_transaction
)
SELECT p.guest_profile_id, p.first_name, p.last_name, p.unit_id, p.zip_code,
       CAST(NULL AS BIGINT) AS member_id,
       CAST(NULL AS STRING) AS tier
FROM {catalog}.synth_silver.guest_profile p
WHERE p.first_name IS NOT NULL
LIMIT 50
"""
profile_rows = spark.sql(profile_sql).collect()
profiles_doc = {"profiles": [profile_to_doc(r.asDict()) for r in profile_rows]}
profiles_path = f"/Volumes/{catalog}/{demo_schema}/{export_volume}/profiles.json"
dbutils.fs.put(profiles_path, json.dumps(profiles_doc, indent=2), overwrite=True)
print(f"Wrote {len(profiles_doc['profiles'])} profiles to {profiles_path}")
