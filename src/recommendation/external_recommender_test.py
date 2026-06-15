from external_recommender import build_request, parse_response


def test_build_request_coerces_ints_and_guest_sentinel():
    req = build_request(profile_id="guest", member_id="", store_id="42",
                        cart_product_ids=["1", "14"], viewed_product_id=None, num=5)
    rec = req["dataframe_records"][0]
    assert rec["profile_id"] == -1
    assert rec["member_id"] is None
    assert rec["store_id"] == 42
    assert rec["cart_product_ids"] == [1, 14]
    assert rec["viewed_product_id"] is None
    assert rec["num_recommendations"] == 5


def test_build_request_real_profile():
    req = build_request(profile_id="748", member_id="748", store_id="1",
                        cart_product_ids=[], viewed_product_id="8", num=4)
    rec = req["dataframe_records"][0]
    assert rec["profile_id"] == 748
    assert rec["member_id"] == 748
    assert rec["viewed_product_id"] == 8
    assert rec["cart_product_ids"] == []


def test_parse_response_returns_str_ids_and_personalized():
    resp = {"predictions": [{"personalized": True, "recommendations": [
        {"menu_item_id": 53, "score": 0.94}, {"menu_item_id": 61, "score": 0.81}]}]}
    ids, personalized = parse_response(resp)
    assert ids == ["53", "61"]
    assert personalized is True


def test_parse_response_empty_and_missing():
    assert parse_response({"predictions": [{"personalized": False, "recommendations": []}]}) == ([], False)
    assert parse_response({}) == ([], False)
