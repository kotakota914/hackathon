"""通報の確認（管理者）のテスト。

- 管理者だけが通報を一覧・対応済みにでき、利用者を停止・解除できる。一般利用者は 403。
- 停止された利用者は認証で USER_SUSPENDED になる。退会済み・管理者・自分自身は停止できない。
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
ADMIN = CurrentUser(user_id="usr_901", role="admin", status="active", email_verified=True, verification_status="approved")
MEMBER = CurrentUser(user_id="usr_101", role="member", status="active", email_verified=True, verification_status="approved")


def act_as(user: CurrentUser) -> None:
    async def current() -> CurrentUser:
        return user

    app.dependency_overrides[get_current_user] = current


def setup_function() -> None:
    act_as(MEMBER)
    client.post("/_mock/reset")


def teardown_module() -> None:
    app.dependency_overrides.pop(get_current_user, None)


def file_report() -> dict:
    act_as(MEMBER)
    response = client.post("/reports", json={
        "targetType": "user", "targetId": "usr_207", "reason": "harassment",
        "description": "メッセージで何度も個人的な連絡先を聞かれました。",
    })
    assert response.status_code == 201, response.text
    return response.json()


def test_member_cannot_use_admin_endpoints() -> None:
    report = file_report()
    assert client.get("/admin/reports").status_code == 403
    assert client.post(f"/admin/reports/{report['id']}/resolve", json={"status": "resolved"}).status_code == 403
    assert client.post("/admin/users/usr_207/suspend", json={"suspended": True}).status_code == 403


def test_admin_lists_and_resolves_reports() -> None:
    report = file_report()
    act_as(ADMIN)
    listed = client.get("/admin/reports", params={"status": "open"}).json()["items"]
    assert [r["id"] for r in listed] == [report["id"]]
    assert listed[0]["resolvedAt"] is None

    resolved = client.post(f"/admin/reports/{report['id']}/resolve", json={"status": "resolved"})
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolvedAt"]
    assert client.get("/admin/reports", params={"status": "open"}).json()["items"] == []
    assert client.get("/admin/reports").json()["items"][0]["status"] == "resolved"
    assert client.post("/admin/reports/nope/resolve", json={"status": "resolved"}).status_code == 404


def test_admin_suspends_and_reinstates_a_user() -> None:
    act_as(ADMIN)
    suspended = client.post("/admin/users/usr_207/suspend", json={"suspended": True})
    assert suspended.status_code == 200, suspended.text
    assert suspended.json() == {"userId": "usr_207", "status": "suspended"}
    with pytest.raises(HTTPException) as exc_info:
        _current_user_from_record("usr_207", crud_module.users_store["usr_207"])
    assert exc_info.value.detail["code"] == "USER_SUSPENDED"

    reinstated = client.post("/admin/users/usr_207/suspend", json={"suspended": False})
    assert reinstated.json()["status"] == "active"
    assert _current_user_from_record("usr_207", crud_module.users_store["usr_207"]).status == "active"


def test_cannot_suspend_self_admins_or_unknown_users() -> None:
    act_as(ADMIN)
    crud_module.users_store["usr_901"] = {"id": "usr_901", "displayName": "運営", "role": "admin", "status": "active"}
    assert client.post("/admin/users/usr_901/suspend", json={"suspended": True}).status_code == 422
    crud_module.users_store["usr_902"] = {"id": "usr_902", "displayName": "別の管理者", "role": "admin", "status": "active"}
    assert client.post("/admin/users/usr_902/suspend", json={"suspended": True}).status_code == 404
    assert client.post("/admin/users/nobody/suspend", json={"suspended": True}).status_code == 404
