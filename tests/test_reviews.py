"""レビュー（完了後の評価）のテスト。

- completed なマッチの当事者だけが相手へ 1 件送れる。未完了・重複・部外者は拒否。
- マッチは Repository から引く（メモリ上の辞書に無くても動く＝本番と同じ経路）。
- 公開プロフィールに件数と「良かった点」の件数が出る。本文は出ない。
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
OTHER = CurrentUser(user_id="usr_208", role="member", status="active", email_verified=True, verification_status="approved")

REVIEW = {"onTime": True, "polite": True, "safetyAware": False, "communicative": True, "comment": "助かりました。ありがとう"}


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
    # メモリ上の matches 辞書には入れない。Repository だけに置く（本番と同じ）。
    record = {
        "id": match_id, "requestId": "req-x", "requesterId": "usr_101", "helperId": "usr_207",
        "status": status, "requesterConfirmed": status == "completed",
        "helperConfirmed": status == "completed", "matchedAt": "2026-09-01T10:00:00Z",
        "completedAt": "2026-09-02T10:00:00Z" if status == "completed" else None,
        "disputeReason": None, "disputedAt": None, "version": 1,
    }
    asyncio.run(get_match_repository().create(HELPER, record))


def test_requester_reviews_helper_and_summary_appears_on_public_profile() -> None:
    seed_match("m-review", "completed")
    created = client.post("/matches/m-review/reviews", json=REVIEW)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["reviewerId"] == "usr_101"
    assert body["revieweeId"] == "usr_207"
    assert body["onTime"] is True and body["safetyAware"] is False

    profile = client.get("/users/usr_207/public-profile").json()
    assert profile["reviewSummary"] == {"count": 1, "onTime": 1, "polite": 1, "safetyAware": 0, "communicative": 1}
    assert "助かりました" not in str(profile)


def test_helper_reviews_requester_in_the_other_direction() -> None:
    seed_match("m-review-2", "completed")
    act_as(HELPER)
    created = client.post("/matches/m-review-2/reviews", json=REVIEW)
    assert created.status_code == 201, created.text
    assert created.json()["revieweeId"] == "usr_101"


def test_rejects_duplicates_incomplete_matches_and_outsiders() -> None:
    seed_match("m-dup", "completed")
    assert client.post("/matches/m-dup/reviews", json=REVIEW).status_code == 201
    duplicate = client.post("/matches/m-dup/reviews", json=REVIEW)
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "DUPLICATE_REVIEW"

    seed_match("m-open", "in_progress")
    incomplete = client.post("/matches/m-open/reviews", json=REVIEW)
    assert incomplete.status_code == 409
    assert incomplete.json()["error"]["code"] == "MATCH_NOT_COMPLETED"

    act_as(OTHER)
    assert client.post("/matches/m-dup/reviews", json=REVIEW).status_code in {403, 404}
    assert client.post("/matches/nope/reviews", json=REVIEW).status_code == 404
