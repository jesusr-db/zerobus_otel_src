# PizzaTel provisioning bundle

Parameterized Databricks Asset Bundle. The `jmrdemo.synth_*` catalog is READ-ONLY and must already exist.

## Deploy
    cd provisioning
    databricks bundle validate -t dev
    databricks bundle deploy   -t dev

## Run the seed export
    databricks bundle run pizzatel_seed_export -t dev

## Destroy
    databricks bundle destroy -t dev
The `pizzatel` schema is declared with `force_destroy: true`, so destroy drops it
*and* the seed notebook's tables (menu/stores) + the managed exports volume — no manual cleanup.

Override the catalog/schema for another workspace:
    databricks bundle deploy -t dev --var="catalog=mycat" --var="demo_schema=pizzatel"

> Portability caveat: the seed export reads `<catalog>.synth_ref.*`, which currently exists
> ONLY in the `jmrdemo` Azure workspace. Running the export against a fresh workspace requires
> that synth reference data (or a copied `pizzatel_seed` snapshot) to be present first — see
> ADR 0003 "Data residency note".
