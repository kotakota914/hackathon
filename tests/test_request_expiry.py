"""古い依頼の自動期限切れのテスト。

- 作成時に期限（予定日時 + 24 時間）が付く。予定を変えると期限も変わる。
- 期限を過ぎた依頼は公開一覧に出ないが、依頼者本人の一覧には残る。
- 定期処理（GET /jobs/expire-requests）は合言葉が要り、期限切れを expired に確定して応募を閉じる。
"""

import asyncio
import os

os.environ["SUPERTOKENS_ENABLED"] = "false"
os.environ["MOCK_RESET_ENABLED"] = "true"
os.environ["APP_ENV"] = "test"
os.environ["REQUEST_REPOSITORY"] = "memory"
os.environ["CRON_SECRET"] = "test-cron-secret"

import httpx

from app.auth import CurrentUser, get_current_user
from app.main import app
from app.repositories.applications import get_application_repository
from app.services.request_expiry import EXPIRY_GRACE, expires_at_for, is_expired


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

    def patch(self, path: str, **kwargs) -> httpx.Response:
        return self.request("PATCH", path, **kwargs)


client = ASGITestClient()
REQUESTER = CurrentUser(user_id="usr_101", role="member", status="active", email_verified=True, verification_status="approved")
HELPER = CurrentUser(user_id="usr_207", role="member", status="active", email_verified=True, verification_status="approved")


def act_as(user: CurrentUser) -> None:
    async def current() -> CurrentUser:
        return user

    app.dependency_overrides[get_current_user] = current


def setup_function() -> None:
    os.environ["CRON_SECRET"] = "test-cron-secret"
    act_as(REQUESTER)
    client.post("/_mock/reset")


def teardown_module() -> None:
    app.dependency_overrides.pop(get_current_user, None)


def create_request(key: str, scheduled_at: str) -> dict:
    act_as(REQUESTER)
    response = client.post("/requests", headers={"Idempotency-Key": key}, json={
        "title": "庭の片付け", "description": "庭の落ち葉を一緒に片付けてください",
        "category": "cleaning", "scheduledAt": scheduled_at,
        "estimatedMinutes": 30, "requiredHelpers": 1, "areaCode": "AREA-001",
        "riskLevel": "low", "confirmed": True,
    })
    assert response.status_code == 201, response.text
    return response.json()


def test_expiry_helpers() -> None:
    expires = expires_at_for("2026-09-10T10:00:00+09:00")
    assert expires is not None
    assert expires.isoformat() == "2026-09-11T10:00:00+09:00"
    assert expires_at_for(None) is None
    assert expires_at_for("いつでも") is None
    assert is_expired("2020-01-01T00:00:00Z") is True
    assert is_expired("2999-01-01T00:00:00Z") is False
    assert is_expired(None) is False
    assert EXPIRY_GRACE.total_seconds() == 24 * 3600


def test_created_request_gets_an_expiry_and_updates_with_schedule() -> None:
    item = create_request("exp-1", "2099-09-10T10:00:00+09:00")
    assert item["expiresAt"] is not None
    assert item["expiresAt"].startswith("2099-09-11T")
    updated = client.patch(f"/requests/{item['id']}", json={
        "expectedVersion": item["version"], "scheduledAt": "2099-10-01T09:00:00+09:00",
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["expiresAt"].startswith("2099-10-02T")


def test_expired_requests_hide_from_the_public_list_but_stay_with_the_owner() -> None:
    old = create_request("exp-2", "2020-01-01T10:00:00+09:00")
    fresh = create_request("exp-3", "2099-01-01T10:00:00+09:00")
    act_as(HELPER)
    listed = {row["id"] for row in client.get("/requests?limit=50").json()["items"]}
    assert fresh["id"] in listed
    assert old["id"] not in listed
    act_as(REQUESTER)
    mine = {row["id"]: row["status"] for row in client.get("/requests/mine").json()["items"]}
    assert mine[old["id"]] == "published"  # まだ確定前


def test_job_requires_the_secret_and_settles_expired_requests() -> None:
    old = create_request("exp-4", "2020-01-01T10:00:00+09:00")
    # 期限切れの依頼に来ていた応募は閉じる（応募 API は公開中でないと弾くので直接置く）
    get_application_repository()._items["app-old"] = {
        "id": "app-old", "requestId": old["id"], "helperId": "usr_207", "status": "applied",
        "message": "x", "availableAt": "2020-01-01T10:00:00+09:00", "createdAt": "2020-01-01T00:00:00Z",
    }

    assert client.get("/jobs/expire-requests").status_code == 401
    assert client.get("/jobs/expire-requests", headers={"Authorization": "Bearer wrong"}).status_code == 401
    ok = client.get("/jobs/expire-requests", headers={"Authorization": "Bearer test-cron-secret"})
    assert ok.status_code == 200, ok.text
    assert ok.json() == {"expiredRequests": 1, "closedApplications": 1}

    act_as(REQUESTER)
    mine = {row["id"]: row["status"] for row in client.get("/requests/mine").json()["items"]}
    assert mine[old["id"]] == "expired"
    assert get_application_repository()._items["app-old"]["status"] == "cancelled"

    # 二回目は何もしない
    again = client.get("/jobs/expire-requests", headers={"Authorization": "Bearer test-cron-secret"})
    assert again.json() == {"expiredRequests": 0, "closedApplications": 0}


def test_job_is_disabled_without_a_secret() -> None:
    os.environ.pop("CRON_SECRET", None)
    response = client.get("/jobs/expire-requests", headers={"Authorization": "Bearer anything"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "JOB_DISABLED"
