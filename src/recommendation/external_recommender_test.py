from external_recommender import build_request, parse_response


def test_build_request_coerces_ints_and_guest_sentinel():
    # Deployed model signature requires non-null int64 for every id field, so absent
    # values become int sentinels: guest profile -> -1, absent member -> profile_id,
    # absent viewed -> -1. (No nulls — verified live: null member/viewed -> HTTP 400.)
    req = build_request(profile_id="guest", member_id="", store_id="42",
                        cart_product_ids=["1", "14"], viewed_product_id=None, num=5)
    rec = req["dataframe_records"][0]
    assert rec["profile_id"] == -1
    assert rec["member_id"] == -1          # absent member mirrors profile_id (here guest -> -1)
    assert rec["store_id"] == 42
    assert rec["cart_product_ids"] == "[1, 14]"   # JSON STRING, not array (model signature is all-scalar)
    assert rec["viewed_product_id"] == -1  # absent viewed -> -1 sentinel, never null
    assert rec["num_recommendations"] == 5


def test_build_request_absent_member_mirrors_real_profile():
    req = build_request(profile_id="748", member_id="", store_id="",
                        cart_product_ids=[], viewed_product_id=None, num=5)
    rec = req["dataframe_records"][0]
    assert rec["member_id"] == 748   # absent member -> profile_id
    assert rec["store_id"] == -1     # absent store -> -1
    assert rec["viewed_product_id"] == -1


def test_build_request_real_profile():
    req = build_request(profile_id="748", member_id="748", store_id="1",
                        cart_product_ids=[], viewed_product_id="8", num=4)
    rec = req["dataframe_records"][0]
    assert rec["profile_id"] == 748
    assert rec["member_id"] == 748
    assert rec["viewed_product_id"] == 8
    assert rec["cart_product_ids"] == "[]"   # empty cart -> "[]" (JSON string)


def test_parse_response_returns_str_ids_and_personalized():
    resp = {"predictions": [{"personalized": True, "recommendations": [
        {"menu_item_id": 53, "score": 0.94}, {"menu_item_id": 61, "score": 0.81}]}]}
    ids, personalized = parse_response(resp)
    assert ids == ["53", "61"]
    assert personalized is True


def test_parse_response_empty_and_missing():
    assert parse_response({"predictions": [{"personalized": False, "recommendations": []}]}) == ([], False)
    assert parse_response({}) == ([], False)
