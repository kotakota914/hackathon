"""管理者の運用（通報の確認、利用停止）。

- 通報の一覧・確認は管理者だけ。Postgres は RLS（管理者は全件 select）と
  security definer 関数（更新）で守る。Memory は runtime.reports を見る。
- 利用停止は users.status を suspended にする。停止中は認証で USER_SUSPENDED になり、
  依頼・応募・メッセージを一切できない。退会済みと管理者は対象外。
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Protocol

from app.auth import CurrentUser
from app.settings import settings

ReportRecord = dict[str, Any]
CLOSED_STATUSES = frozenset({"resolved", "rejected"})


class ModerationError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _iso(value: Any) -> str | None:
    if value is None or isinstance(value, str):
        return value
    return value.isoformat().replace("+00:00", "Z")


class ModerationRepository(Protocol):
    async def list_reports(self, actor: CurrentUser, *, status: str | None, limit: int) -> list[ReportRecord]: ...

    async def resolve_report(self, actor: CurrentUser, report_id: str, status: str) -> ReportRecord: ...

    async def set_user_suspended(self, actor: CurrentUser, user_id: str, suspended: bool) -> str: ...


class MemoryModerationRepository:
    async def list_reports(self, actor: CurrentUser, *, status: str | None, limit: int) -> list[ReportRecord]:
        from app.cruds import main as runtime

        del actor
        items = [dict(r) for r in runtime.reports.values() if status is None or r["status"] == status]
        items.sort(key=lambda r: (r["createdAt"], r["id"]), reverse=True)
        return items[:limit]

    async def resolve_report(self, actor: CurrentUser, report_id: str, status: str) -> ReportRecord:
        from app.cruds import main as runtime

        item = runtime.reports.get(report_id)
        if item is None:
            raise ModerationError("REPORT_NOT_FOUND")
        item["status"] = status
        item["handledBy"] = actor.user_id
        item["resolvedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z") if status in CLOSED_STATUSES else None
        return dict(item)

    async def set_user_suspended(self, actor: CurrentUser, user_id: str, suspended: bool) -> str:
        from app.cruds import main as runtime

        del actor
        record = runtime.users_store.get(user_id)
        if record is None or record.get("status") == "deleted" or record.get("role") == "admin":
            raise ModerationError("USER_NOT_FOUND")
        record["status"] = "suspended" if suspended else "active"
        return record["status"]


def _row(row: Any) -> ReportRecord:
    return {
        "id": str(row["id"]),
        "reporterId": row["reporter_auth_subject"] if "reporter_auth_subject" in row.keys() else str(row["reporter_id"]),
        "targetType": row["target_type"],
        "targetId": str(row["target_id"]),
        "reason": row["reason"],
        "description": row["description"],
        "severity": row["severity"],
        "status": row["status"],
        "createdAt": _iso(row["created_at"]),
        "resolvedAt": _iso(row["resolved_at"]),
    }


class PostgresModerationRepository:
    _SELECT = """
        select r.id, r.target_type, r.target_id, r.reason, r.description, r.severity, r.status,
               r.created_at, r.resolved_at, u.auth_subject as reporter_auth_subject
          from reports r
          left join users u on u.id = r.reporter_id
    """

    async def list_reports(self, actor: CurrentUser, *, status: str | None, limit: int) -> list[ReportRecord]:
        from app.db import actor_connection

        if actor.role != "admin":
            raise ModerationError("ROLE_FORBIDDEN")
        async with actor_connection(actor) as conn:
            rows = await conn.fetch(
                self._SELECT + """
                 where ($1::report_status is null or r.status = $1::report_status)
                 order by r.created_at desc, r.id desc
                 limit $2""",
                status, limit,
            )
        return [_row(row) for row in rows]

    async def resolve_report(self, actor: CurrentUser, report_id: str, status: str) -> ReportRecord:
        import asyncpg

        from app.db import actor_connection

        try:
            report_uuid = uuid.UUID(report_id)
        except ValueError as exc:
            raise ModerationError("REPORT_NOT_FOUND") from exc
        try:
            async with actor_connection(actor) as conn:
                row = await conn.fetchrow(
                    "select * from app.resolve_report($1, $2::report_status)", report_uuid, status,
                )
                if row is not None:
                    row = await conn.fetchrow(self._SELECT + " where r.id = $1", report_uuid)
        except asyncpg.InsufficientPrivilegeError as exc:
            raise ModerationError("ROLE_FORBIDDEN") from exc
        if row is None:
            raise ModerationError("REPORT_NOT_FOUND")
        return _row(row)

    async def set_user_suspended(self, actor: CurrentUser, user_id: str, suspended: bool) -> str:
        import asyncpg

        from app.db import actor_connection

        try:
            async with actor_connection(actor) as conn:
                row = await conn.fetchrow("select * from app.set_user_suspended($1, $2)", user_id, suspended)
        except asyncpg.InsufficientPrivilegeError as exc:
            raise ModerationError("ROLE_FORBIDDEN") from exc
        except asyncpg.NoDataFoundError as exc:
            raise ModerationError("USER_NOT_FOUND") from exc
        except asyncpg.RaiseError as exc:
            if "USER_NOT_FOUND" in str(exc):
                raise ModerationError("USER_NOT_FOUND") from exc
            raise
        if row is None:
            raise ModerationError("USER_NOT_FOUND")
        return row["status"]


_memory = MemoryModerationRepository()
_postgres = PostgresModerationRepository()


def get_moderation_repository() -> ModerationRepository:
    return _postgres if settings.request_repository == "postgres" else _memory
