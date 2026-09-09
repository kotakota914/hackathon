"""実績プロフィールの公開ページ（他の利用者から見える最小限の情報）。

返すもの: 表示名、本人確認の状態、参加時期（月）、完了した支援の回数と合計時間、
本人が公開を承認した AI 実績文。地域・年齢・大学・勤務先などの個人情報は返さない。
ブロック関係にある相手のページは「見つからない」として扱う。
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Protocol, TypedDict

from app.auth import CurrentUser
from app.settings import settings


class PublicProfileRecord(TypedDict):
    displayName: str
    verificationStatus: str
    memberSince: str | None  # "YYYY-MM"
    completedCount: int
    totalMinutes: int
    achievementText: str | None
    achievementApprovedAt: str | None


class PublicProfileRepository(Protocol):
    async def get(self, viewer: CurrentUser, user_id: str) -> PublicProfileRecord | None: ...


def _month(value: Any) -> str | None:
    if isinstance(value, (date, datetime)):
        return f"{value.year:04d}-{value.month:02d}"
    if isinstance(value, str) and len(value) >= 7:
        return value[:7]
    return None


class MemoryPublicProfileRepository:
    async def get(self, viewer: CurrentUser, user_id: str) -> PublicProfileRecord | None:
        from app.cruds import main as runtime
        from app.repositories.matches import get_match_repository
        from app.repositories.requests import get_request_repository

        record = runtime.users_store.get(user_id)
        if record is None or record.get("status") != "active":
            return None
        if runtime.is_blocked_pair(viewer.user_id, user_id):
            return None

        completed = [
            m for m in getattr(get_match_repository(), "_items", {}).values()
            if m.get("helperId") == user_id and m.get("status") == "completed"
        ]
        requests = getattr(get_request_repository(), "_items", {})
        total_minutes = 0
        for match in completed:
            request_item = requests.get(match.get("requestId"))
            total_minutes += int((request_item or {}).get("estimatedMinutes") or 0)

        # 承認済みで private でない実績のうち、最新のもの。
        achievement_text: str | None = None
        approved_at: str | None = None
        for item in sorted(
            (a for a in runtime.achievements.values()
             if a.get("userId") == user_id and a.get("approvedAt") and a.get("visibility") != "private"),
            key=lambda a: a.get("approvedAt") or "",
        ):
            achievement_text = item.get("generatedText")
            approved_at = item.get("approvedAt")

        return {
            "displayName": record.get("displayName") or "利用者",
            "verificationStatus": record.get("verificationStatus", "unverified"),
            "memberSince": _month(record.get("createdAt")),
            "completedCount": len(completed),
            "totalMinutes": total_minutes,
            "achievementText": achievement_text,
            "achievementApprovedAt": approved_at,
        }


class PostgresPublicProfileRepository:
    async def get(self, viewer: CurrentUser, user_id: str) -> PublicProfileRecord | None:
        from app.db import actor_connection

        async with actor_connection(viewer) as conn:
            row = await conn.fetchrow("select * from app.public_helper_profile($1)", user_id)
        if row is None:
            return None
        approved = row["achievement_approved_at"]
        return {
            "displayName": row["display_name"],
            "verificationStatus": row["verification_status"],
            "memberSince": _month(row["member_since"]),
            "completedCount": int(row["completed_count"]),
            "totalMinutes": int(row["total_minutes"]),
            "achievementText": row["achievement_text"],
            "achievementApprovedAt": approved.isoformat().replace("+00:00", "Z") if approved else None,
        }


_memory = MemoryPublicProfileRepository()
_postgres = PostgresPublicProfileRepository()


def get_public_profile_repository() -> PublicProfileRepository:
    if settings.request_repository == "postgres":
        return _postgres
    return _memory
