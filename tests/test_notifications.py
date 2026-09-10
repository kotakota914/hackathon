"""お知らせ（アプリ内の通知履歴）のテスト。

- 応募が届く → 依頼者に、選ばれる → 支援者に、メッセージ → 相手に、それぞれ 1 件残る。
- 本人だけが自分の分を読める。未読数はバッジにも出る。既読にできる。
- 本文に相手の名前やメッセージ内容は入れない。
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
REQUESTER = CurrentUser(user_id="usr_101", role="member", status="active", email_verified=True, verification_status="approved")
HELPER = CurrentUser(user_id="usr_207", role="member", status="active", email_verified=True, verification_status="approved")


def act_as(user: CurrentUser) -> None:
    async def current() -> CurrentUser:
        return user

    app.dependency_overrides[get_current_user] = current


def setup_function() -> None:
    act_as(REQUESTER)
    client.post("/_mock/reset")
    asyncio.run(get_match_repository().reset())


def teardown_module() -> None:
    app.dependency_overrides.pop(get_current_user, None)


def create_request(key: str) -> dict:
    act_as(REQUESTER)
    response = client.post("/requests", headers={"Idempotency-Key": key}, json={
        "title": "庭の片付け", "description": "庭の落ち葉を一緒に片付けてください",
        "category": "cleaning", "scheduledAt": "2099-09-10T10:00:00+09:00",
        "estimatedMinutes": 30, "requiredHelpers": 1, "areaCode": "AREA-001",
        "riskLevel": "low", "confirmed": True,
    })
    assert response.status_code == 201, response.text
    return response.json()


def apply_as(user: CurrentUser, request_id: str) -> dict:
    act_as(user)
    response = client.post(f"/requests/{request_id}/applications", json={
        "message": "対応できます。田中です。", "availableAt": "2099-09-10T10:00:00+09:00",
    })
    assert response.status_code == 201, response.text
    return response.json()


def notifications_for(user: CurrentUser) -> dict:
    act_as(user)
    response = client.get("/me/notifications")
    assert response.status_code == 200, response.text
    return response.json()


def test_application_selection_and_message_each_notify_the_other_party() -> None:
    request_item = create_request("n-1")
    application = apply_as(HELPER, request_item["id"])

    # 応募 → 依頼者へ。応募者の名前やメッセージは本文に入らない。
    body = notifications_for(REQUESTER)
    assert body["unreadCount"] == 1
    assert body["items"][0]["kind"] == "application"
    assert body["items"][0]["url"] == "/help/requests"
    assert "田中" not in body["items"][0]["body"]
    assert notifications_for(HELPER)["unreadCount"] == 0

    # 選出 → 支援者へ
    act_as(REQUESTER)
    selected = client.post(f"/applications/{application['id']}/select", json={"expectedVersion": request_item["version"]})
    assert selected.status_code in {200, 201}, selected.text
    match_id = selected.json()["id"]
    helper_box = notifications_for(HELPER)
    assert helper_box["unreadCount"] == 1
    assert helper_box["items"][0]["kind"] == "selected"

    # メッセージ → 相手へ（送った本人には残らない）
    act_as(HELPER)
    sent = client.post(f"/matches/{match_id}/messages", json={"body": "10時に伺います"})
    assert sent.status_code == 201, sent.text
    requester_box = notifications_for(REQUESTER)
    assert requester_box["unreadCount"] == 2
    assert requester_box["items"][0]["kind"] == "message"
    assert "10時" not in requester_box["items"][0]["body"]
    assert notifications_for(HELPER)["unreadCount"] == 1


def test_badge_counts_unread_and_mark_read_clears_it() -> None:
    request_item = create_request("n-2")
    apply_as(HELPER, request_item["id"])
    act_as(REQUESTER)
    assert client.get("/me/badges").json()["unreadNotifications"] == 1

    marked = client.post("/me/notifications/read", json={})
    assert marked.status_code == 200, marked.text
    assert marked.json()["marked"] == 1
    assert client.get("/me/badges").json()["unreadNotifications"] == 0
    assert client.get("/me/notifications").json()["items"][0]["readAt"] is not None

    # 二回目は何もしない
    assert client.post("/me/notifications/read", json={}).json()["marked"] == 0


def test_mark_read_accepts_specific_ids() -> None:
    request_item = create_request("n-3")
    apply_as(HELPER, request_item["id"])
    apply_as(CurrentUser(user_id="usr_208", role="member", status="active", email_verified=True, verification_status="approved"), request_item["id"])
    box = notifications_for(REQUESTER)
    assert box["unreadCount"] == 2
    first_id = box["items"][0]["id"]
    assert client.post("/me/notifications/read", json={"ids": [first_id]}).json()["marked"] == 1
    assert client.get("/me/notifications").json()["unreadCount"] == 1
