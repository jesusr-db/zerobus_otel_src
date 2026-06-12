# PizzaTel provisioning bundle

Parameterized Databricks Asset Bundle. The `jmrdemo.synth_*` catalog is READ-ONLY and must already exist.

## Deploy
    cd provisioning
    databricks bundle validate -t dev
    databricks bundle deploy   -t dev

## Run the seed export
    databricks bundle run pizzatel_seed_export -t dev

## Destroy (DAB-managed resources only)
    databricks bundle destroy -t dev

Override the catalog/schema for another workspace:
    databricks bundle deploy -t dev --var="catalog=mycat" --var="demo_schema=pizzatel"
