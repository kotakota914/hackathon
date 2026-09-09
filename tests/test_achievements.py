"""AI 実績プロフィールの保存のテスト。

- completed なマッチの支援者本人だけが作れる。依頼者・未完了・部外者は拒否。
- マッチは Repository から引く（メモリ上の辞書に無くても動く＝本番と同じ経路）。
- public は本人の承認が必須。公開後は公開プロフィールに実績文が出る。
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
    act_as(REQUESTER)
    client.post("/_mock/reset")
    asyncio.run(get_match_repository().reset())


def teardown_module() -> None:
    app.dependency_overrides.pop(get_current_user, None)


def seed_match(match_id: str, status: str) -> None:
    request_id = next(iter(get_request_repository()._items))
    record = {
        "id": match_id, "requestId": request_id, "requesterId": "usr_101", "helperId": "usr_207",
        "status": status, "requesterConfirmed": status == "completed",
        "helperConfirmed": status == "completed", "matchedAt": "2026-09-01T10:00:00Z",
        "completedAt": "2026-09-02T10:00:00Z" if status == "completed" else None,
        "disputeReason": None, "disputedAt": None, "version": 1,
    }
    asyncio.run(get_match_repository().create(HELPER, record))


def test_helper_generates_and_publishes_with_approval() -> None:
    seed_match("m-ach", "completed")
    act_as(HELPER)
    generated = client.post("/achievements/generate", json={"matchId": "m-ach", "visibility": "private"})
    assert generated.status_code == 201, generated.text
    body = generated.json()
    assert body["userId"] == "usr_207" and body["status"] == "generated"
    assert body["facts"]["category"] and body["facts"]["minutes"] > 0

    # 承認なしの public は拒否
    denied = client.patch("/achievements/visibility", json={"achievementId": body["id"], "visibility": "public", "approved": False})
    assert denied.status_code == 409
    assert denied.json()["error"]["code"] == "ACHIEVEMENT_APPROVAL_REQUIRED"

    approved = client.patch("/achievements/visibility", json={"achievementId": body["id"], "visibility": "public", "approved": True})
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved" and approved.json()["approvedAt"]

    act_as(REQUESTER)
    profile = client.get("/users/usr_207/public-profile").json()
    assert profile["achievementText"] == body["generatedText"]


def test_requester_incomplete_and_unknown_are_rejected() -> None:
    seed_match("m-ach-2", "completed")
    seed_match("m-ach-open", "in_progress")
    act_as(REQUESTER)
    assert client.post("/achievements/generate", json={"matchId": "m-ach-2", "visibility": "private"}).status_code == 403
    act_as(HELPER)
    incomplete = client.post("/achievements/generate", json={"matchId": "m-ach-open", "visibility": "private"})
    assert incomplete.status_code == 409
    assert client.post("/achievements/generate", json={"matchId": "nope", "visibility": "private"}).status_code == 404
    missing = client.patch("/achievements/visibility", json={"achievementId": "ach_nobody", "visibility": "members", "approved": False})
    assert missing.status_code == 404
