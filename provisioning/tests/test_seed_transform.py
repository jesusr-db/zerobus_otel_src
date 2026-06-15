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


from src.seed_transform import unit_to_store, profile_to_doc


def test_unit_to_store_maps_synth_unit_to_picker_shape():
    row = {
        "unit_id": 42,
        "unit_name": "Mountain View #42",
        "city": "Mountain View",
        "state": "CA",
        "metro_area": "SF Bay Area",
    }
    store = unit_to_store(row)
    assert store == {
        "id": "42",
        "name": "Mountain View #42",
        "city": "Mountain View",
        "state": "CA",
        "metro": "SF Bay Area",
    }


def test_profile_to_doc_maps_profile_and_loyalty():
    row = {
        "guest_profile_id": 1234,
        "first_name": "Larry",
        "last_name": "Page",
        "member_id": 5678,
        "tier": "Gold",
        "unit_id": 42,
        "zip_code": "94043",
    }
    doc = profile_to_doc(row)
    assert doc == {
        "id": "1234",
        "name": "Larry Page",
        "member_id": "5678",
        "tier": "Gold",
        "home_store_id": "42",
        "zip": "94043",
    }


def test_profile_to_doc_handles_missing_loyalty():
    row = {
        "guest_profile_id": 9,
        "first_name": "Anon",
        "last_name": "Guest",
        "member_id": None,
        "tier": None,
        "unit_id": 7,
        "zip_code": "00000",
    }
    doc = profile_to_doc(row)
    assert doc["member_id"] is None
    assert doc["tier"] == "None"
