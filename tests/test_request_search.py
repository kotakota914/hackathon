"""公開依頼一覧のキーワード検索と並び替え（GET /requests?q=&sort=）。"""

from __future__ import annotations

from app.auth import get_current_user
from app.main import app
from tests.main import add_search_request, client, requester_user


def setup_function() -> None:
    app.dependency_overrides[get_current_user] = requester_user
    client.post("/_mock/reset")


def _ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


def test_keyword_matches_title_or_description_case_insensitively() -> None:
    add_search_request("req_01", title="電球の交換", description="脚立はあります")
    add_search_request("req_02", title="買い物の付き添い", description="スーパーまで")
    add_search_request("req_03", title="PC setup", description="Wi-Fi の設定")

    assert _ids(client.get("/requests", params={"q": "電球"})) == ["req_01"]
    assert _ids(client.get("/requests", params={"q": "スーパー"})) == ["req_02"]
    assert _ids(client.get("/requests", params={"q": "pc"})) == ["req_03"]
    assert _ids(client.get("/requests", params={"q": "存在しない語"})) == []


def test_blank_keyword_is_ignored_and_too_long_keyword_is_rejected() -> None:
    add_search_request("req_01", title="電球の交換")

    assert "req_01" in _ids(client.get("/requests", params={"q": "   "}))
    assert client.get("/requests", params={"q": "あ" * 51}).status_code == 422


def test_sort_scheduled_orders_by_upcoming_date_first() -> None:
    # createdAt は id の秒で決まる（req_03 が最も新しい）。予定日時は逆に req_01 が最も近い。
    add_search_request("req_01", scheduledAt="2027-01-01T10:00:00+09:00")
    add_search_request("req_02", scheduledAt="2027-01-02T10:00:00+09:00")
    add_search_request("req_03", scheduledAt="2027-01-03T10:00:00+09:00")

    window = {"scheduledFrom": "2027-01-01T00:00:00+09:00"}
    newest = _ids(client.get("/requests", params={"sort": "newest", **window}))
    scheduled = _ids(client.get("/requests", params={"sort": "scheduled", **window}))

    assert newest == ["req_03", "req_02", "req_01"]
    assert scheduled == ["req_01", "req_02", "req_03"]
    assert client.get("/requests", params={"sort": "random"}).status_code == 422


def test_sort_scheduled_pages_without_skips_or_duplicates() -> None:
    for index in range(1, 8):
        add_search_request(f"req_{index:02d}", scheduledAt=f"2027-02-{index:02d}T10:00:00+09:00")
    params = {"sort": "scheduled", "scheduledFrom": "2027-02-01T00:00:00+09:00", "limit": 3}

    first = client.get("/requests", params=params)
    assert _ids(first) == ["req_01", "req_02", "req_03"]
    second = client.get("/requests", params={**params, "cursor": first.json()["nextCursor"]})
    assert _ids(second) == ["req_04", "req_05", "req_06"]
    third = client.get("/requests", params={**params, "cursor": second.json()["nextCursor"]})
    assert _ids(third) == ["req_07"]
    assert third.json()["nextCursor"] is None


def test_keyword_and_sort_combine_with_other_filters() -> None:
    add_search_request("req_01", title="庭の草むしり", category="gardening", scheduledAt="2027-03-02T10:00:00+09:00")
    add_search_request("req_02", title="庭の水やり", category="gardening", scheduledAt="2027-03-01T10:00:00+09:00")
    add_search_request("req_03", title="庭の掃除", category="cleaning", scheduledAt="2027-03-01T09:00:00+09:00")

    result = _ids(client.get("/requests", params={"q": "庭", "category": "gardening", "sort": "scheduled"}))
    assert result == ["req_02", "req_01"]
