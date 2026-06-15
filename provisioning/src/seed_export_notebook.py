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
# IMPORTANT: guest_profile.guest_profile_id (16-digit bigint) is DISJOINT from
# guest_order.profile_id (1-50000). The real join key for order history and loyalty
# is guest_order.profile_id == loyalty_transaction.member_id (1-50000 space).
# We key on profile_id (the real join key) and borrow cosmetic names from
# guest_profile (deterministic zip by rank). profile_to_doc maps guest_profile_id
# -> id, so we alias profile_id AS guest_profile_id to keep that transform intact.
profile_sql = f"""
WITH po AS (
  SELECT profile_id, COUNT(*) AS order_count
  FROM {catalog}.synth_silver.guest_order
  WHERE profile_id IS NOT NULL
  GROUP BY profile_id
),
ranked_po AS (
  SELECT profile_id, order_count, ROW_NUMBER() OVER (ORDER BY order_count DESC, profile_id) AS rn
  FROM po
),
home AS (
  SELECT profile_id, unit_id FROM (
    SELECT profile_id, unit_id,
           ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY placed_at DESC) AS rn
    FROM {catalog}.synth_silver.guest_order WHERE profile_id IS NOT NULL
  ) WHERE rn = 1
),
tier AS (
  SELECT member_id, tier FROM (
    SELECT member_id, tier,
           ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY transaction_at DESC) AS rn
    FROM {catalog}.synth_silver.loyalty_transaction
  ) WHERE rn = 1
),
names AS (
  SELECT first_name, last_name,
         ROW_NUMBER() OVER (ORDER BY guest_profile_id) AS rn
  FROM {catalog}.synth_silver.guest_profile
  WHERE first_name IS NOT NULL
  LIMIT 50
)
SELECT
  rp.profile_id      AS guest_profile_id,
  n.first_name, n.last_name,
  t.member_id,
  t.tier,
  h.unit_id,
  CAST(NULL AS STRING) AS zip_code
FROM ranked_po rp
JOIN names n ON n.rn = rp.rn
LEFT JOIN home h ON h.profile_id = rp.profile_id
LEFT JOIN tier t ON t.member_id = rp.profile_id
WHERE rp.rn <= 50
ORDER BY rp.order_count DESC
"""
profile_rows = spark.sql(profile_sql).collect()
profiles_doc = {"profiles": [profile_to_doc(r.asDict()) for r in profile_rows]}
profiles_path = f"/Volumes/{catalog}/{demo_schema}/{export_volume}/profiles.json"
dbutils.fs.put(profiles_path, json.dumps(profiles_doc, indent=2), overwrite=True)
print(f"Wrote {len(profiles_doc['profiles'])} profiles to {profiles_path}")
