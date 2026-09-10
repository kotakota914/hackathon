"""お知らせ（アプリ内の通知履歴）の保存。

- 出来事（応募が届いた／選ばれた／メッセージ）の相手に 1 件ずつ残す。本文に個人情報は入れない。
- 本人だけが自分の分を読み、既読にできる（Postgres は RLS と security definer 関数）。
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Protocol

from app.auth import CurrentUser
from app.settings import settings

NotificationRecord = dict[str, Any]

MAX_LIST = 50


def _iso(value: Any) -> str | None:
    if value is None or isinstance(value, str):
        return value
    return value.isoformat().replace("+00:00", "Z")


class NotificationRepository(Protocol):
    async def add(self, user_id: str, *, kind: str, title: str, body: str, url: str) -> None: ...

    async def list_for(self, actor: CurrentUser, *, limit: int = MAX_LIST) -> list[NotificationRecord]: ...

    async def unread_count(self, actor: CurrentUser) -> int: ...

    async def mark_read(self, actor: CurrentUser, ids: list[str] | None) -> int: ...


class MemoryNotificationRepository:
    def __init__(self) -> None:
        self._items: dict[str, list[NotificationRecord]] = {}

    def reset_sync(self) -> None:
        self._items.clear()

    async def add(self, user_id: str, *, kind: str, title: str, body: str, url: str) -> None:
        self._items.setdefault(user_id, []).insert(0, {
            "id": str(uuid.uuid4()), "kind": kind, "title": title, "body": body, "url": url,
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "readAt": None,
        })

    async def list_for(self, actor: CurrentUser, *, limit: int = MAX_LIST) -> list[NotificationRecord]:
        return [dict(item) for item in self._items.get(actor.user_id, [])[:limit]]

    async def unread_count(self, actor: CurrentUser) -> int:
        return sum(1 for item in self._items.get(actor.user_id, []) if item["readAt"] is None)

    async def mark_read(self, actor: CurrentUser, ids: list[str] | None) -> int:
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        count = 0
        for item in self._items.get(actor.user_id, []):
            if item["readAt"] is None and (ids is None or item["id"] in ids):
                item["readAt"] = now
                count += 1
        return count


class PostgresNotificationRepository:
    async def add(self, user_id: str, *, kind: str, title: str, body: str, url: str) -> None:
        from app.db import admin_connection

        async with admin_connection() as conn:
            await conn.fetchval(
                "select app.add_notification($1, $2, $3, $4, $5)", user_id, kind, title, body, url,
            )

    async def list_for(self, actor: CurrentUser, *, limit: int = MAX_LIST) -> list[NotificationRecord]:
        from app.db import actor_connection

        async with actor_connection(actor) as conn:
            rows = await conn.fetch(
                """select id, kind, title, body, url, created_at, read_at
                     from notifications
                    where user_id = app.current_actor()
                    order by created_at desc, id desc
                    limit $1""",
                limit,
            )
        return [{
            "id": str(row["id"]), "kind": row["kind"], "title": row["title"], "body": row["body"],
            "url": row["url"], "createdAt": _iso(row["created_at"]), "readAt": _iso(row["read_at"]),
        } for row in rows]

    async def unread_count(self, actor: CurrentUser) -> int:
        from app.db import actor_connection

        async with actor_connection(actor) as conn:
            value = await conn.fetchval(
                "select count(*) from notifications where user_id = app.current_actor() and read_at is null"
            )
        return int(value or 0)

    async def mark_read(self, actor: CurrentUser, ids: list[str] | None) -> int:
        from app.db import actor_connection

        parsed = None
        if ids is not None:
            parsed = []
            for value in ids:
                try:
                    parsed.append(uuid.UUID(value))
                except ValueError:
                    continue
        async with actor_connection(actor) as conn:
            count = await conn.fetchval("select app.mark_own_notifications_read($1::uuid[])", parsed)
        return int(count or 0)


_memory = MemoryNotificationRepository()
_postgres = PostgresNotificationRepository()


def get_notification_repository() -> NotificationRepository:
    if settings.request_repository == "postgres":
        return _postgres
    return _memory
