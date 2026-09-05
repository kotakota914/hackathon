"""バッジ集計（GET /me/badges）のテスト。

「応募が来た」「支援者が決まった」「メッセージが届いた」を、画面を開き直さずに
気づけるようにするための集計。状態を持たず、そのときの事実だけを数える。
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
            async with httpx.AsyncClient(
                transport=transport, base_url="http://testserver"
            ) as async_client:
                return await async_client.request(method, path, **kwargs)

        return asyncio.run(send())

    def get(self, path: str, **kwargs) -> httpx.Response:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> httpx.Response:
        return self.request("POST", path, **kwargs)


client = ASGITestClient()

REQUESTER = CurrentUser(
    user_id="usr_101", role="member", status="active",
    email_verified=True, verification_status="approved",
)
HELPER = CurrentUser(
    user_id="usr_207", role="member", status="active",
    email_verified=True, verification_status="approved",
)
OTHER_HELPER = CurrentUser(
    user_id="usr_208", role="member", status="active",
    email_verified=True, verification_status="approved",
)


def act_as(user: CurrentUser) -> None:
    async def current() -> CurrentUser:
        return user

    app.dependency_overrides[get_current_user] = current


def setup_function() -> None:
    act_as(REQUESTER)
    client.post("/_mock/reset")
    asyncio.run(get_match_repository().reset())


def badges() -> dict:
    response = client.get("/me/badges")
    assert response.status_code == 200, response.text
    return response.json()


def create_request(key: str) -> dict:
    response = client.post(
        "/requests",
        headers={"Idempotency-Key": key},
        json={
            "title": "庭の片付け", "description": "庭の落ち葉を一緒に片付けてください",
            "category": "cleaning", "scheduledAt": "2099-09-10T10:00:00+09:00",
            "estimatedMinutes": 30, "requiredHelpers": 1, "areaCode": "AREA-001",
            "riskLevel": "low", "confirmed": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def apply_as(user: CurrentUser, request_id: str) -> dict:
    act_as(user)
    response = client.post(
        f"/requests/{request_id}/applications",
        json={"message": "対応できます", "availableAt": "2099-09-10T10:00:00+09:00"},
    )
    assert response.status_code == 201, response.text
    act_as(REQUESTER)
    return response.json()


def test_everything_is_zero_for_a_quiet_user() -> None:
    # 種データには応募が2件（app_55, app_56）あるので、依頼者 usr_101 には応募待ちが見える。
    act_as(OTHER_HELPER)
    assert badges() == {"pendingApplicants": 0, "activeMatches": 0, "unreadMessages": 0}


def test_requester_sees_pending_applicants_on_own_requests() -> None:
    created = create_request("badge-1")
    before = badges()["pendingApplicants"]

    apply_as(HELPER, created["id"])

    assert badges()["pendingApplicants"] == before + 1


def test_selecting_an_applicant_moves_the_count_to_active_matches() -> None:
    created = create_request("badge-2")
    application = apply_as(HELPER, created["id"])
    before = badges()

    selected = client.post(
        f"/applications/{application['id']}/select",
        json={"expectedVersion": created["version"]},
    )
    assert selected.status_code == 201, selected.text

    after = badges()
    assert after["pendingApplicants"] == before["pendingApplicants"] - 1
    assert after["activeMatches"] == before["activeMatches"] + 1

    # 支援者側にも進行中のマッチとして見える
    act_as(HELPER)
    assert badges()["activeMatches"] == 1


def test_unread_messages_count_only_the_counterparts_messages() -> None:
    created = create_request("badge-3")
    application = apply_as(HELPER, created["id"])
    selected = client.post(
        f"/applications/{application['id']}/select",
        json={"expectedVersion": created["version"]},
    )
    match_id = selected.json()["id"]

    act_as(HELPER)
    sent = client.post(f"/matches/{match_id}/messages", json={"body": "明日の10時に伺います"})
    assert sent.status_code == 201, sent.text
    # 自分が送ったメッセージは自分の未読にならない
    assert badges()["unreadMessages"] == 0

    act_as(REQUESTER)
    assert badges()["unreadMessages"] == 1

    # トークを開く（一覧取得）と既読になり、バッジが消える
    opened = client.get(f"/matches/{match_id}/messages")
    assert opened.status_code == 200
    assert badges()["unreadMessages"] == 0


def test_blocked_counterparts_are_excluded() -> None:
    created = create_request("badge-4")
    application = apply_as(HELPER, created["id"])
    client.post(
        f"/applications/{application['id']}/select",
        json={"expectedVersion": created["version"]},
    )
    act_as(HELPER)
    match_id = client.get("/matches").json()["items"][0]["matchId"]
    client.post(f"/matches/{match_id}/messages", json={"body": "こんにちは"})
    act_as(REQUESTER)
    assert badges()["unreadMessages"] == 1

    blocked = client.post(f"/users/{HELPER.user_id}/block", json={"reason": "テスト"})
    assert blocked.status_code in (200, 201), blocked.text

    after = badges()
    assert after["unreadMessages"] == 0
    assert after["activeMatches"] == 0
