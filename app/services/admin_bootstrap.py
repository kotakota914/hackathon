"""管理者の自動付与。

環境変数 ADMIN_AUTH_SUBJECTS に SuperTokens のユーザーIDをカンマ区切りで入れておくと、
その利用者はログイン時に role が admin になる。管理者を作る画面が無くても、
SQL を手で打たずに自治体ダッシュボードなどの管理者機能を使えるようにするため。

- 付与は「ログイン時に利用者を解決する」経路（get_current_user → lookup）で行う。
- 一度 admin になれば環境変数から外しても降格はしない（降格は明示的に行う）。
- 退会済みの利用者は対象にしない（Postgres 側の関数でも同じ条件）。
"""

from __future__ import annotations

import os
from typing import Any, Awaitable, Callable

UserRecord = dict[str, Any]
Lookup = Callable[[str], Awaitable[UserRecord | None] | UserRecord | None]
Promote = Callable[[str], Awaitable[UserRecord | None]]


def admin_subjects_from_env(value: str | None = None) -> frozenset[str]:
    """カンマ区切りの環境変数を集合にする。空白と空要素は無視する。"""
    raw = os.getenv("ADMIN_AUTH_SUBJECTS", "") if value is None else value
    return frozenset(part.strip() for part in raw.split(",") if part.strip())


ADMIN_AUTH_SUBJECTS: frozenset[str] = admin_subjects_from_env()


def with_admin_bootstrap(
    lookup: Lookup, promote: Promote, *, subjects: frozenset[str] | None = None,
) -> Callable[[str], Awaitable[UserRecord | None]]:
    """利用者の解決に「環境変数に載っていれば admin にする」を挟む。"""

    async def resolve(user_id: str) -> UserRecord | None:
        record = lookup(user_id)
        if hasattr(record, "__await__"):
            record = await record  # type: ignore[assignment]
        listed = user_id in (ADMIN_AUTH_SUBJECTS if subjects is None else subjects)
        if (
            listed
            and record is not None
            and record.get("role") != "admin"
            and record.get("status") != "deleted"
        ):
            promoted = await promote(user_id)
            if promoted is not None:
                return promoted
        return record

    return resolve


def promote_in_memory(store_provider: Callable[[], dict[str, UserRecord]]) -> Promote:
    async def promote(user_id: str) -> UserRecord | None:
        store = store_provider()
        record = store.get(user_id)
        if record is None:
            return None
        record["role"] = "admin"
        return record

    return promote


async def promote_in_postgres(user_id: str) -> UserRecord | None:
    from app.db import admin_connection
    from app.repositories.profiles import resolve_authenticated_user

    async with admin_connection() as conn:
        await conn.fetchval("select app.grant_role_by_subject($1, 'admin')", user_id)
    return await resolve_authenticated_user(user_id)
