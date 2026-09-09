"""AI 実績プロフィールの保存（Memory / Postgres）。

- 1 利用者 1 件。生成し直すと上書きされ、承認と公開範囲はやり直しになる。
- 公開範囲: private / members（DB では unlisted）/ public。public は本人の承認が必須。
- 応答の形（AchievementResponse）は従来どおり。Postgres では id を "ach_<利用者ID>" にする。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Protocol

from app.auth import CurrentUser
from app.settings import settings

AchievementRecord = dict[str, Any]

VISIBILITY_TO_DB = {"private": "private", "members": "unlisted", "public": "public"}
VISIBILITY_FROM_DB = {"private": "private", "unlisted": "members", "public": "public"}


class AchievementNotFoundError(Exception):
    pass


class AchievementApprovalRequiredError(Exception):
    pass


class AchievementRepository(Protocol):
    async def upsert(
        self, actor: CurrentUser, *, match_id: str, text: str, facts: dict[str, Any],
        model_name: str, prompt_version: str, visibility: str,
    ) -> AchievementRecord: ...

    async def set_visibility(
        self, actor: CurrentUser, *, achievement_id: str, visibility: str, approved: bool,
    ) -> AchievementRecord: ...


def _iso(value: Any) -> str | None:
    if value is None or isinstance(value, str):
        return value
    return value.isoformat().replace("+00:00", "Z")


class MemoryAchievementRepository:
    async def upsert(
        self, actor: CurrentUser, *, match_id: str, text: str, facts: dict[str, Any],
        model_name: str, prompt_version: str, visibility: str,
    ) -> AchievementRecord:
        from app.cruds import main as runtime

        item = {
            "id": f"ach_{actor.user_id}",
            "userId": actor.user_id,
            "matchId": match_id,
            "generatedText": text,
            "facts": dict(facts),
            "visibility": visibility,
            "status": "generated",
            "modelName": model_name,
            "promptVersion": prompt_version,
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "approvedAt": None,
        }
        runtime.achievements[item["id"]] = item
        return dict(item)

    async def set_visibility(
        self, actor: CurrentUser, *, achievement_id: str, visibility: str, approved: bool,
    ) -> AchievementRecord:
        from app.cruds import main as runtime

        item = runtime.achievements.get(achievement_id)
        if item is None or item["userId"] != actor.user_id:
            raise AchievementNotFoundError(achievement_id)
        if visibility == "public" and not approved and not item.get("approvedAt"):
            raise AchievementApprovalRequiredError(achievement_id)
        item["visibility"] = visibility
        if approved:
            item["approvedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            item["status"] = "approved"
        return dict(item)


def _row_to_record(row: Any, actor: CurrentUser, *, match_id: str, facts: dict[str, Any]) -> AchievementRecord:
    return {
        "id": f"ach_{actor.user_id}",
        "userId": actor.user_id,
        "matchId": match_id,
        "generatedText": row["generated_text"],
        "facts": facts,
        "visibility": VISIBILITY_FROM_DB.get(row["visibility"], "private"),
        "status": "approved" if row["approved_at"] else "generated",
        "modelName": row["model_name"],
        "promptVersion": row["prompt_version"],
        "generatedAt": _iso(row["generated_at"]),
        "approvedAt": _iso(row["approved_at"]),
    }


class PostgresAchievementRepository:
    async def upsert(
        self, actor: CurrentUser, *, match_id: str, text: str, facts: dict[str, Any],
        model_name: str, prompt_version: str, visibility: str,
    ) -> AchievementRecord:
        from app.db import actor_connection

        async with actor_connection(actor) as conn:
            row = await conn.fetchrow(
                "select * from app.upsert_own_achievement($1, $2, $3)", text, model_name, prompt_version,
            )
            if visibility != "private":
                row = await conn.fetchrow(
                    "select * from app.set_own_achievement_visibility($1::achievement_visibility, false)",
                    VISIBILITY_TO_DB[visibility],
                )
        return _row_to_record(row, actor, match_id=match_id, facts=facts)

    async def set_visibility(
        self, actor: CurrentUser, *, achievement_id: str, visibility: str, approved: bool,
    ) -> AchievementRecord:
        import asyncpg

        from app.db import actor_connection

        if achievement_id != f"ach_{actor.user_id}":
            raise AchievementNotFoundError(achievement_id)
        try:
            async with actor_connection(actor) as conn:
                row = await conn.fetchrow(
                    "select * from app.set_own_achievement_visibility($1::achievement_visibility, $2)",
                    VISIBILITY_TO_DB[visibility], approved,
                )
        except asyncpg.RaiseError as exc:
            message = str(exc)
            if "ACHIEVEMENT_NOT_FOUND" in message:
                raise AchievementNotFoundError(achievement_id) from exc
            if "ACHIEVEMENT_APPROVAL_REQUIRED" in message:
                raise AchievementApprovalRequiredError(achievement_id) from exc
            raise
        except asyncpg.NoDataFoundError as exc:
            raise AchievementNotFoundError(achievement_id) from exc
        if row is None:
            raise AchievementNotFoundError(achievement_id)
        # Postgres は matchId / facts を保持しないため、公開範囲変更の応答では空で返す。
        return _row_to_record(row, actor, match_id="", facts={"category": "", "minutes": 0})


_memory = MemoryAchievementRepository()
_postgres = PostgresAchievementRepository()


def get_achievement_repository() -> AchievementRepository:
    if settings.request_repository == "postgres":
        return _postgres
    return _memory
