"""依頼者本人の依頼一覧（GET /requests/mine）のテスト。

公開一覧（GET /requests）は published しか返さないため、依頼者が自分の
審査待ち・マッチ済み・完了・取消済みの依頼を追えなかった。本人の依頼を
状態に関係なく新しい順で返す契約を確かめる。
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
from app.repositories.requests import get_request_repository


class ASGITestClient:
    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        async def send() -> httpx.Response:
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://testserver"
            ) as async_client:
                return await async_client.request(method, path, **kwargs)

        return asyncio.run(send())

    def get(self, path: str, **kwargs) -> httpx.Response:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> httpx.Response:
        return self.request("POST", path, **kwargs)

    def delete(self, path: str, **kwargs) -> httpx.Response:
        return self.request("DELETE", path, **kwargs)


client = ASGITestClient()

REQUESTER = CurrentUser(
    user_id="usr_101", role="member", status="active",
    email_verified=True, verification_status="approved",
)
OTHER = CurrentUser(
    user_id="usr_301", role="member", status="active",
    email_verified=True, verification_status="unverified",
)


def act_as(user: CurrentUser) -> None:
    async def current() -> CurrentUser:
        return user

    app.dependency_overrides[get_current_user] = current


def setup_function() -> None:
    act_as(REQUESTER)
    client.post("/_mock/reset")


def create_request(title: str, key: str) -> dict:
    response = client.post(
        "/requests",
        headers={"Idempotency-Key": key},
        json={
            "title": title,
            "description": f"{title}を手伝ってください",
            "category": "cleaning",
            "scheduledAt": "2099-09-10T10:00:00+09:00",
            "estimatedMinutes": 30,
            "requiredHelpers": 1,
            "areaCode": "AREA-001",
            "riskLevel": "low",
            "confirmed": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def mine(**params) -> list[dict]:
    response = client.get("/requests/mine", params=params)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def test_returns_only_the_callers_requests_regardless_of_status() -> None:
    first = create_request("庭の片付け", "mine-1")
    second = create_request("電球の交換", "mine-2")
    assert client.delete(f"/requests/{second['id']}").status_code == 204

    act_as(OTHER)
    create_request("他人の依頼", "mine-3")
    act_as(REQUESTER)

    items = mine()

    # 種データの usr_101 の依頼（犬の散歩）も本人のものとして含まれる。
    ids = [item["id"] for item in items]
    assert first["id"] in ids
    assert second["id"] in ids
    assert all(item["requesterId"] == REQUESTER.user_id for item in items)
    assert "他人の依頼" not in {item["title"] for item in items}
    statuses = {item["id"]: item["status"] for item in items}
    assert statuses[first["id"]] == "published"
    assert statuses[second["id"]] == "cancelled"


def test_newest_first() -> None:
    first = create_request("一件目", "order-1")
    second = create_request("二件目", "order-2")

    ids = [item["id"] for item in mine()]

    assert ids.index(second["id"]) < ids.index(first["id"])


def test_status_filter_narrows_the_list() -> None:
    kept = create_request("残す依頼", "filter-1")
    cancelled = create_request("取り消す依頼", "filter-2")
    assert client.delete(f"/requests/{cancelled['id']}").status_code == 204

    only_cancelled = [item["id"] for item in mine(status="cancelled")]
    only_published = [item["id"] for item in mine(status="published")]

    assert only_cancelled == [cancelled["id"]]
    assert kept["id"] in only_published
    assert cancelled["id"] not in only_published


def test_unknown_status_is_rejected() -> None:
    response = client.get("/requests/mine", params={"status": "sleeping"})

    assert response.status_code == 422


def test_pending_review_requests_are_visible_to_their_owner() -> None:
    created = create_request("審査に回る依頼", "review-1")
    moved = asyncio.run(
        get_request_repository().set_status(
            REQUESTER, created["id"], "pending_review", bump_version=False,
        )
    )
    assert moved

    # 公開一覧には出ないが、自分の一覧には出る。
    act_as(OTHER)
    public = client.get("/requests", params={"areaCode": "AREA-001"}).json()["items"]
    act_as(REQUESTER)
    assert created["id"] not in {item["id"] for item in public}
    assert {item["id"]: item["status"] for item in mine()}[created["id"]] == "pending_review"


def test_limit_caps_the_number_of_items() -> None:
    for index in range(3):
        create_request(f"依頼{index}", f"limit-{index}")

    assert len(mine(limit=2)) == 2
