"""自治体ダッシュボードの集計（GET /admin/municipality-overview）のテスト。

- 管理者だけが取得でき、一般利用者は 403。
- 依頼・マッチの件数、完了数、地域別・カテゴリ別の内訳を数える。
- 人数が少ない区分（minCellSize 未満）は件数を伏せる（null）。
- 期間の指定と、from>=to の 422 を確認する。
"""

import asyncio
import os

os.environ["SUPERTOKENS_ENABLED"] = "false"
os.environ["MOCK_RESET_ENABLED"] = "true"
os.environ["APP_ENV"] = "test"
os.environ["REQUEST_REPOSITORY"] = "memory"

import httpx

from app.auth import CurrentUser, get_current_user
from app.main import app
from app.repositories.matches import get_match_repository
from app.repositories.requests import get_request_repository
from app.repositories.stats import MIN_CELL_SIZE


class ASGITestClient:
    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        async def send() -> httpx.Response:
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
                return await c.request(method, path, **kwargs)

        return asyncio.run(send())

    def get(self, path: str, **kwargs) -> httpx.Response:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> httpx.Response:
        return self.request("POST", path, **kwargs)


client = ASGITestClient()

ADMIN = CurrentUser(user_id="usr_admin", role="admin", status="active", email_verified=True, verification_status="approved")
MEMBER = CurrentUser(user_id="usr_101", role="member", status="active", email_verified=True, verification_status="approved")


def act_as(user: CurrentUser) -> None:
    async def current() -> CurrentUser:
        return user

    app.dependency_overrides[get_current_user] = current


def seed_requests(records: list[dict]) -> None:
    repo = get_request_repository()
    repo._items = {r["id"]: r for r in records}


def seed_matches(records: list[dict]) -> None:
    repo = get_match_repository()
    repo._items = {r["id"]: r for r in records}


def make_request(rid: str, *, area: str, category: str, status: str, minutes: int, created: str) -> dict:
    return {
        "id": rid, "requesterId": "usr_101", "title": "t", "description": "d",
        "category": category, "areaCode": area, "status": status,
        "estimatedMinutes": minutes, "requiredHelpers": 1, "version": 1,
        "createdAt": created, "updatedAt": created, "scheduledAt": created,
    }


def make_match(mid: str, *, helper: str, status: str, matched: str) -> dict:
    return {
        "id": mid, "requestId": "r", "requesterId": "usr_101", "helperId": helper,
        "status": status, "requesterConfirmed": status == "completed",
        "helperConfirmed": status == "completed", "matchedAt": matched,
        "completedAt": matched if status == "completed" else None,
        "disputeReason": None, "disputedAt": None, "version": 1,
    }


def teardown_module() -> None:
    app.dependency_overrides.pop(get_current_user, None)


def test_member_cannot_read_the_dashboard() -> None:
    act_as(MEMBER)
    response = client.get("/admin/municipality-overview")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ROLE_FORBIDDEN"


def test_counts_requests_matches_and_completion() -> None:
    act_as(ADMIN)
    # 6 件の掃除依頼（うち完了 5）を AREA-001 に置き、少人数の伏せ字を避ける。
    reqs = [
        make_request(f"c{i}", area="AREA-001", category="cleaning",
                     status="completed" if i < 5 else "published",
                     minutes=30, created="2026-09-01T10:00:00+09:00")
        for i in range(6)
    ]
    # 別カテゴリ・別地域は 2 件だけ → 伏せられるはず。
    reqs += [
        make_request("s1", area="AREA-002", category="snow_removal", status="cancelled", minutes=60, created="2026-09-02T10:00:00+09:00"),
        make_request("s2", area="AREA-002", category="snow_removal", status="completed", minutes=60, created="2026-09-02T11:00:00+09:00"),
    ]
    seed_requests(reqs)
    # 完了マッチ 5、進行中 1、cancelled は成立に数えない。支援者は 5 人。
    matches = [make_match(f"m{i}", helper=f"h{i}", status="completed", matched="2026-09-01T12:00:00+09:00") for i in range(5)]
    matches.append(make_match("m5", helper="h5", status="in_progress", matched="2026-09-01T12:00:00+09:00"))
    matches.append(make_match("m6", helper="h6", status="cancelled", matched="2026-09-01T12:00:00+09:00"))
    seed_matches(matches)

    body = client.get("/admin/municipality-overview", params={
        "from": "2026-08-01T00:00:00+09:00", "to": "2026-10-01T00:00:00+09:00",
    }).json()

    assert body["totals"]["requestsCreated"] == 8
    assert body["totals"]["requestsCompleted"] == 6  # 5 cleaning + 1 snow
    assert body["totals"]["requestsCancelled"] == 1
    assert body["totals"]["matchesFormed"] == 6  # cancelled は除く
    assert body["totals"]["matchesCompleted"] == 5
    assert body["totals"]["activeHelpers"] == 6  # h0..h5
    assert body["totals"]["avgEstimatedMinutes"] == round((30 * 6 + 60 * 2) / 8)

    areas = {row["key"]: row for row in body["byArea"]}
    assert areas["AREA-001"]["requests"] == 6
    assert areas["AREA-001"]["label"] == "大学周辺"
    # AREA-002 は 2 件だけなので伏せられる。
    assert areas["AREA-002"]["requests"] is None
    # 伏せた行は末尾に並ぶ。
    assert body["byArea"][0]["key"] == "AREA-001"
    assert body["minCellSize"] == MIN_CELL_SIZE


def test_only_counts_within_the_period() -> None:
    act_as(ADMIN)
    seed_requests([
        make_request("old", area="AREA-001", category="cleaning", status="completed", minutes=30, created="2026-07-01T10:00:00+09:00"),
        make_request("new", area="AREA-001", category="cleaning", status="published", minutes=30, created="2026-09-15T10:00:00+09:00"),
    ])
    seed_matches([])
    body = client.get("/admin/municipality-overview", params={
        "from": "2026-09-01T00:00:00+09:00", "to": "2026-10-01T00:00:00+09:00",
    }).json()
    assert body["totals"]["requestsCreated"] == 1


def test_rejects_reversed_period() -> None:
    act_as(ADMIN)
    seed_requests([])
    seed_matches([])
    response = client.get("/admin/municipality-overview", params={
        "from": "2026-10-01T00:00:00+09:00", "to": "2026-09-01T00:00:00+09:00",
    })
    assert response.status_code == 422
