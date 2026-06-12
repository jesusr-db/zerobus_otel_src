from src.seed_transform import menu_item_to_product, usd_money


def test_usd_money_splits_units_and_nanos():
    assert usd_money(16.99) == {"currencyCode": "USD", "units": 16, "nanos": 990000000}
    assert usd_money(9.0) == {"currencyCode": "USD", "units": 9, "nanos": 0}


def test_menu_item_to_product_maps_synth_row_to_proto_shape():
    row = {
        "menu_item_id": 7,
        "item_name": "Large Hand-Tossed Pepperoni",
        "category": "pizza",
        "subcategory": "specialty",
        "base_price": 17.49,
    }
    product = menu_item_to_product(row)
    assert product["id"] == "7"
    assert product["name"] == "Large Hand-Tossed Pepperoni"
    assert product["categories"] == ["pizza", "specialty"]
    assert product["priceUsd"] == {"currencyCode": "USD", "units": 17, "nanos": 490000000}
    assert product["picture"] == "pizza-7.jpg"
    assert "Large Hand-Tossed Pepperoni" in product["description"]
