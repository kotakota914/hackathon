"""実績プロフィールの公開ページ（GET /users/{user_id}/public-profile）のテスト。

- 表示名・本人確認・支援回数・合計時間・キャラクター段階・承認済み実績文だけを返す。
- 地域・年齢・大学など個人情報は返さない。
- ブロック関係や退会済み・存在しない相手は 404。
"""

import asyncio
import os

os.environ["SUPERTOKENS_ENABLED"] = "false"
os.environ["MOCK_RESET_ENABLED"] = "true"
os.environ["APP_ENV"] = "test"
os.environ["REQUEST_REPOSITORY"] = "memory"

import httpx

import app.cruds.main as crud_module
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


def seed_completed_match(match_id: str, request_id: str) -> None:
    record = {
        "id": match_id, "requestId": request_id, "requesterId": "usr_101", "helperId": "usr_207",
        "status": "completed", "requesterConfirmed": True, "helperConfirmed": True,
        "matchedAt": "2026-09-01T10:00:00Z", "completedAt": "2026-09-02T10:00:00Z",
        "disputeReason": None, "disputedAt": None, "version": 1,
    }
    asyncio.run(get_match_repository().create(HELPER, record))


def test_public_profile_shows_only_safe_fields() -> None:
    request_id = next(iter(crud_module.get_request_repository()._items))
    seed_completed_match("m-1", request_id)
    body = client.get("/users/usr_207/public-profile").json()
    assert body["userId"] == "usr_207"
    assert body["displayName"] == "田中 悠"
    assert body["verificationStatus"] == "approved"
    assert body["completedCount"] == 1
    assert body["totalMinutes"] == 30
    assert body["character"]["stage"] == 1
    assert body["character"]["characterId"] == "c1"
    assert body["achievementText"] is None
    # 個人情報の項目は存在しない
    for key in ("areaCode", "age", "university", "workplace", "email", "region"):
        assert key not in body


def test_approved_public_achievement_is_shown_but_private_is_not() -> None:
    request_id = next(iter(crud_module.get_request_repository()._items))
    seed_completed_match("m-2", request_id)
    crud_module.matches["m-2"] = dict(get_match_repository()._items["m-2"])
    act_as(HELPER)
    generated = client.post("/achievements/generate", json={"matchId": "m-2", "visibility": "private"})
    assert generated.status_code == 201, generated.text
    achievement_id = generated.json()["id"]

    act_as(REQUESTER)
    assert client.get("/users/usr_207/public-profile").json()["achievementText"] is None

    act_as(HELPER)
    published = client.patch("/achievements/visibility", json={
        "achievementId": achievement_id, "visibility": "public", "approved": True,
    })
    assert published.status_code == 200, published.text

    act_as(REQUESTER)
    body = client.get("/users/usr_207/public-profile").json()
    assert body["achievementText"]
    assert body["achievementApprovedAt"]


def test_unknown_or_blocked_user_is_not_found() -> None:
    assert client.get("/users/nobody/public-profile").status_code == 404
    blocked = client.post("/users/usr_207/block", json={"blocked": True})
    assert blocked.status_code == 201, blocked.text
    assert client.get("/users/usr_207/public-profile").status_code == 404
