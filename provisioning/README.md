# PizzaTel provisioning bundle

Parameterized Databricks Asset Bundle. The `jmrdemo.synth_*` catalog is READ-ONLY and must already exist.

## Deploy
    cd provisioning
    databricks bundle validate -t dev
    databricks bundle deploy   -t dev

## Run the seed export
    databricks bundle run pizzatel_seed_export -t dev

## Destroy
The seed notebook creates tables INSIDE `pizzatel` (menu/stores), so the schema is non-empty.
`pizzatel_schema` sets `force_destroy: true` for CLI/provider versions that honor it. NOTE: some
CLI versions emit `Warning: unknown field: force_destroy` and ignore it — on those, drop the
contents first, then destroy:

    # only if `bundle destroy` errors on a non-empty schema:
    databricks sql ... -e "DROP TABLE IF EXISTS jmrdemo.pizzatel.menu; DROP TABLE IF EXISTS jmrdemo.pizzatel.stores;"
    databricks fs rm dbfs:/Volumes/jmrdemo/pizzatel/exports/pizza_menu.json -p DEFAULT
    databricks bundle destroy -t dev

Override the catalog/schema for another workspace:
    databricks bundle deploy -t dev --var="catalog=mycat" --var="demo_schema=pizzatel"

> Portability caveat: the seed export reads `<catalog>.synth_ref.*`, which currently exists
> ONLY in the `jmrdemo` Azure workspace. Running the export against a fresh workspace requires
> that synth reference data (or a copied `pizzatel_seed` snapshot) to be present first — see
> ADR 0003 "Data residency note".
