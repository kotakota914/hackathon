"""Web Push（購読の登録・解除と、出来事ごとの通知）のテスト。

実際の送信はせず、差し替え可能な送信口（transport）に何が渡ったかを見る。
- 応募 → 依頼者へ「応募が届きました」
- 応募者の選択 → 支援者へ「選ばれました」
- メッセージ → 相手へ「新しいメッセージ」（本文は含めない）
- 通知オフの利用者には送らない。失効した購読は消す。
- 鍵未設定の環境では購読 API が 404 PUSH_DISABLED。
"""

import asyncio
import os

os.environ["SUPERTOKENS_ENABLED"] = "false"
os.environ["MOCK_RESET_ENABLED"] = "true"
os.environ["APP_ENV"] = "test"
os.environ["REQUEST_REPOSITORY"] = "memory"
os.environ.pop("VAPID_PUBLIC_KEY", None)
os.environ.pop("VAPID_PRIVATE_KEY", None)

import httpx

from app.auth import CurrentUser, get_current_user
from app.main import app
from app.repositories.matches import get_match_repository
from app.repositories.push import get_push_subscription_repository
from app.services import push as push_service


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

    def put(self, path: str, **kwargs) -> httpx.Response:
        return self.request("PUT", path, **kwargs)

    def patch(self, path: str, **kwargs) -> httpx.Response:
        return self.request("PATCH", path, **kwargs)

    def delete(self, path: str, **kwargs) -> httpx.Response:
        return self.request("DELETE", path, **kwargs)


client = ASGITestClient()

REQUESTER = CurrentUser(user_id="usr_101", role="member", status="active", email_verified=True, verification_status="approved")
HELPER = CurrentUser(user_id="usr_207", role="member", status="active", email_verified=True, verification_status="approved")

SENT: list[tuple[str, str]] = []  # (endpoint, payload)
EXPIRED_ENDPOINTS: set[str] = set()


async def fake_transport(subscription, payload: str) -> str:
    if subscription["endpoint"] in EXPIRED_ENDPOINTS:
        return "expired"
    SENT.append((subscription["endpoint"], payload))
    return "ok"


def act_as(user: CurrentUser) -> None:
    async def current() -> CurrentUser:
        return user

    app.dependency_overrides[get_current_user] = current


def setup_function() -> None:
    SENT.clear()
    EXPIRED_ENDPOINTS.clear()
    push_service.configure_transport(fake_transport)
    act_as(REQUESTER)
    client.post("/_mock/reset")
    asyncio.run(get_match_repository().reset())
    asyncio.run(get_push_subscription_repository().reset())


def teardown_module() -> None:
    push_service.configure_transport(None)
    app.dependency_overrides.pop(get_current_user, None)


def subscribe(user: CurrentUser, endpoint: str) -> None:
    act_as(user)
    response = client.put("/push/subscriptions", json={
        "endpoint": endpoint, "keys": {"p256dh": "p" * 40, "auth": "a" * 16},
    })
    assert response.status_code == 204, response.text


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
        "message": "対応できます", "availableAt": "2099-09-10T10:00:00+09:00",
    })
    assert response.status_code == 201, response.text
    return response.json()


def payload_titles() -> list[str]:
    import json
    return [json.loads(p)["title"] for _e, p in SENT]


# --- 購読 API --------------------------------------------------------------


def test_subscription_api_is_disabled_without_vapid_keys() -> None:
    push_service.configure_transport(None)  # 実送信も鍵も無い状態
    act_as(REQUESTER)
    assert client.get("/push/vapid-public-key").status_code == 404
    response = client.put("/push/subscriptions", json={
        "endpoint": "https://push.example/abc", "keys": {"p256dh": "p" * 40, "auth": "a" * 16},
    })
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PUSH_DISABLED"


def test_subscription_validation_rejects_non_https_endpoint() -> None:
    act_as(REQUESTER)
    response = client.put("/push/subscriptions", json={
        "endpoint": "http://push.example/abc", "keys": {"p256dh": "p" * 40, "auth": "a" * 16},
    })
    assert response.status_code == 422


# --- 出来事ごとの通知 --------------------------------------------------------


def test_application_notifies_the_requester_only() -> None:
    subscribe(REQUESTER, "https://push.example/requester")
    subscribe(HELPER, "https://push.example/helper")
    request_item = create_request("push-1")
    apply_as(HELPER, request_item["id"])
    assert SENT == [("https://push.example/requester", SENT[0][1])]
    assert payload_titles() == ["応募が届きました"]
    assert '"url": "/help/requests"' in SENT[0][1]


def test_selection_notifies_the_helper_and_message_notifies_the_counterpart() -> None:
    subscribe(REQUESTER, "https://push.example/requester")
    subscribe(HELPER, "https://push.example/helper")
    request_item = create_request("push-2")
    application = apply_as(HELPER, request_item["id"])
    SENT.clear()

    act_as(REQUESTER)
    version = client.get(f"/requests/{request_item['id']}").json()["version"]
    selected = client.post(f"/applications/{application['id']}/select", json={"expectedVersion": version})
    assert selected.status_code == 201, selected.text
    match_id = selected.json()["id"]
    assert [e for e, _ in SENT] == ["https://push.example/helper"]
    assert payload_titles() == ["選ばれました"]
    SENT.clear()

    # 依頼者がメッセージ → 支援者へ。本文は含めない。
    sent = client.post(f"/matches/{match_id}/messages", json={"body": "10時に来てください 秘密の話"})
    assert sent.status_code == 201, sent.text
    assert [e for e, _ in SENT] == ["https://push.example/helper"]
    assert payload_titles() == ["新しいメッセージ"]
    assert "秘密" not in SENT[0][1]
    assert f"/helper/chat?matchId={match_id}" in SENT[0][1]
    SENT.clear()

    # 支援者が返信 → 依頼者へ（依頼者側の画面パス）
    act_as(HELPER)
    reply = client.post(f"/matches/{match_id}/messages", json={"body": "わかりました"})
    assert reply.status_code == 201, reply.text
    assert [e for e, _ in SENT] == ["https://push.example/requester"]
    assert f"/help/chat?matchId={match_id}" in SENT[0][1]


def test_disabled_notifications_and_expired_subscriptions() -> None:
    subscribe(REQUESTER, "https://push.example/requester-a")
    subscribe(REQUESTER, "https://push.example/requester-b")
    EXPIRED_ENDPOINTS.add("https://push.example/requester-b")
    request_item = create_request("push-3")
    apply_as(HELPER, request_item["id"])
    # 生きている購読にだけ届き、失効した購読は消える。
    assert [e for e, _ in SENT] == ["https://push.example/requester-a"]
    remaining = asyncio.run(get_push_subscription_repository().list_for_user("usr_101"))
    assert [s["endpoint"] for s in remaining] == ["https://push.example/requester-a"]

    # 通知をオフにすると送らない。
    SENT.clear()
    act_as(REQUESTER)
    assert client.patch("/settings", json={"notificationsEnabled": False}).status_code == 200
    apply_as(CurrentUser(user_id="usr_208", role="member", status="active", email_verified=True, verification_status="approved"), request_item["id"])
    assert SENT == []


def test_unsubscribe_removes_only_own_subscription() -> None:
    subscribe(REQUESTER, "https://push.example/requester")
    act_as(HELPER)
    assert client.delete("/push/subscriptions", json={"endpoint": "https://push.example/requester"}).status_code == 204
    assert asyncio.run(get_push_subscription_repository().list_for_user("usr_101")) != []
    act_as(REQUESTER)
    assert client.delete("/push/subscriptions", json={"endpoint": "https://push.example/requester"}).status_code == 204
    assert asyncio.run(get_push_subscription_repository().list_for_user("usr_101")) == []
