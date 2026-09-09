"""アカウント削除（DELETE /account）のテスト。

方針は docs/account-deletion.md。要点:
- 本人だけが実行でき、進行中のマッチがあれば 409 で拒否する。
- 募集中の依頼は取消、未処理の応募は取下げにしてから、プロフィールを匿名化する。
- 二重実行しても安全。削除後の利用者は認証で USER_SUSPENDED として弾かれる。
"""

import asyncio
import os

os.environ["SUPERTOKENS_ENABLED"] = "false"
os.environ["MOCK_RESET_ENABLED"] = "true"
os.environ["APP_ENV"] = "test"
os.environ["REQUEST_REPOSITORY"] = "memory"

import httpx
import pytest
from fastapi import HTTPException

import app.cruds.main as crud_module
from app.auth import CurrentUser, _current_user_from_record, get_current_user
from app.main import app
from app.repositories.accounts import ANONYMIZED_DISPLAY_NAME
from app.repositories.applications import get_application_repository
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

    def delete(self, path: str, **kwargs) -> httpx.Response:
        return self.request("DELETE", path, **kwargs)


client = ASGITestClient()

REQUESTER = CurrentUser(
    user_id="usr_101", role="member", status="active",
    email_verified=True, verification_status="approved",
)
HELPER = CurrentUser(
    user_id="usr_207", role="member", status="active",
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


def teardown_module() -> None:
    app.dependency_overrides.pop(get_current_user, None)


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
    return response.json()


def seed_match(match_id: str, *, helper_id: str, request_id: str, status: str) -> None:
    record = {
        "id": match_id, "requestId": request_id, "requesterId": "usr_101",
        "helperId": helper_id, "status": status,
        "requesterConfirmed": status == "completed",
        "helperConfirmed": status == "completed",
        "matchedAt": "2026-09-01T10:00:00Z",
        "completedAt": "2026-09-02T10:00:00Z" if status == "completed" else None,
        "disputeReason": None, "disputedAt": None, "version": 1,
    }
    asyncio.run(get_match_repository().create(HELPER, record))


def application_status(application_id: str) -> str:
    return get_application_repository()._items[application_id]["status"]


# --- 正常系 -----------------------------------------------------------------


def test_requester_deletion_cancels_open_requests_and_anonymizes_profile() -> None:
    request_item = create_request("del-1")
    application = apply_as(HELPER, request_item["id"])

    act_as(REQUESTER)
    response = client.delete("/account")
    assert response.status_code == 204, response.text

    # 募集中だった依頼は取消され、来ていた応募も閉じる。
    listed = client.get(f"/requests/{request_item['id']}")
    assert listed.status_code == 200, listed.text
    assert listed.json()["status"] == "cancelled"
    assert application_status(application["id"]) == "cancelled"

    # 表示名は匿名化され、個人が特定できる項目は残らない。
    record = crud_module.users_store["usr_101"]
    assert record["status"] == "deleted"
    assert record["displayName"] == ANONYMIZED_DISPLAY_NAME
    assert record["emailVerified"] is False
    assert record["verificationStatus"] == "unverified"
    assert "areaCode" not in record


def test_helper_deletion_withdraws_pending_applications() -> None:
    request_item = create_request("del-2")
    application = apply_as(HELPER, request_item["id"])

    act_as(HELPER)
    assert client.delete("/account").status_code == 204
    assert application_status(application["id"]) == "withdrawn"

    # 依頼者側の依頼はそのまま募集中で残る。
    act_as(REQUESTER)
    assert client.get(f"/requests/{request_item['id']}").json()["status"] == "published"


def test_completed_matches_do_not_block_deletion() -> None:
    request_item = create_request("del-3")
    seed_match("m-done", helper_id="usr_207", request_id=request_item["id"], status="completed")

    act_as(HELPER)
    assert client.delete("/account").status_code == 204
    assert crud_module.users_store["usr_207"]["status"] == "deleted"


# --- 拒否 -------------------------------------------------------------------


@pytest.mark.parametrize("status", ["matched", "in_progress", "completion_pending"])
def test_active_match_blocks_deletion_for_both_parties(status: str) -> None:
    request_item = create_request("del-4")
    seed_match("m-active", helper_id="usr_207", request_id=request_item["id"], status=status)

    for user in (REQUESTER, HELPER):
        act_as(user)
        response = client.delete("/account")
        assert response.status_code == 409, response.text
        assert response.json()["error"]["code"] == "ACCOUNT_HAS_ACTIVE_MATCH"
        assert crud_module.users_store[user.user_id]["status"] == "active"


def test_unauthenticated_request_is_rejected() -> None:
    app.dependency_overrides.pop(get_current_user, None)
    response = client.delete("/account")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


# --- 二重実行と削除後 ---------------------------------------------------------


def test_deleting_twice_is_safe() -> None:
    assert client.delete("/account").status_code == 204
    assert client.delete("/account").status_code == 204
    assert crud_module.users_store["usr_101"]["status"] == "deleted"


def test_deleted_user_is_rejected_by_authentication() -> None:
    assert client.delete("/account").status_code == 204
    with pytest.raises(HTTPException) as exc_info:
        _current_user_from_record("usr_101", crud_module.users_store["usr_101"])
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "USER_SUSPENDED"
