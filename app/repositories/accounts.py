"""アカウント削除（退会）。

方針は docs/account-deletion.md を参照。要点:
- users 行は物理削除せず匿名化して残す（依頼・会話・レビューは相手のためにも残す）。
- 進行中のマッチがあれば拒否する。募集中の依頼は取消、未処理の応募は取下げにする。
- status を deleted にすると、以後の認証は USER_SUSPENDED で弾かれ、
  Postgres では app.is_active_actor() が偽になって全テーブルへのアクセスが閉じる。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol

import asyncpg

from app.auth import CurrentUser
from app.db import actor_connection
from app.settings import settings

# 進行中とみなすマッチの状態。これがある利用者は退会できない。
ACTIVE_MATCH_STATUSES = frozenset({"matched", "in_progress", "completion_pending"})
# 退会時に取り消す、まだ相手が決まっていない依頼の状態。
CANCELLABLE_REQUEST_STATUSES = ("draft", "pending_review", "published", "matching")
ANONYMIZED_DISPLAY_NAME = "退会したユーザー"


class ActiveMatchError(Exception):
    """進行中のマッチがあるため退会できない。"""


@dataclass(frozen=True)
class AccountDeletionResult:
    already_deleted: bool
    cancelled_requests: int
    withdrawn_applications: int


class AccountRepository(Protocol):
    async def delete_own(self, actor: CurrentUser) -> AccountDeletionResult: ...


StoreProvider = Callable[[], dict[str, dict[str, Any]]]


class MemoryAccountRepository:
    def __init__(self, users_provider: StoreProvider) -> None:
        self._users = users_provider

    async def delete_own(self, actor: CurrentUser) -> AccountDeletionResult:
        # 循環 import を避けるため、他のメモリリポジトリは実行時に取得する。
        from app.repositories.applications import get_application_repository
        from app.repositories.matches import get_match_repository
        from app.repositories.requests import get_request_repository

        users = self._users()
        record = users.get(actor.user_id)
        if record is None:
            raise KeyError(actor.user_id)
        if record.get("status") == "deleted":
            return AccountDeletionResult(True, 0, 0)

        matches = get_match_repository()
        for match in await matches.list_for_user(actor):
            if match["status"] in ACTIVE_MATCH_STATUSES:
                raise ActiveMatchError(match["id"])

        requests = get_request_repository()
        cancelled_ids: set[str] = set()
        for item in await requests.list_owned(
            actor, statuses=list(CANCELLABLE_REQUEST_STATUSES), limit=1000,
        ):
            if await requests.set_status(actor, item["id"], "cancelled"):
                cancelled_ids.add(item["id"])

        withdrawn = 0
        applications = get_application_repository()
        # メモリ実装は _items に直接触れる。Postgres では SQL 関数が同じことを行う。
        for application in getattr(applications, "_items", {}).values():
            if application["status"] != "applied":
                continue
            if application["helperId"] == actor.user_id:
                application["status"] = "withdrawn"
                withdrawn += 1
            elif application["requestId"] in cancelled_ids:
                application["status"] = "cancelled"

        users[actor.user_id] = {
            "id": actor.user_id,
            "displayName": ANONYMIZED_DISPLAY_NAME,
            "role": record.get("role", "member"),
            "status": "deleted",
            "emailVerified": False,
            "verificationStatus": "unverified",
        }
        return AccountDeletionResult(False, len(cancelled_ids), withdrawn)


class PostgresAccountRepository:
    async def delete_own(self, actor: CurrentUser) -> AccountDeletionResult:
        try:
            async with actor_connection(actor) as conn:
                row = await conn.fetchrow("select * from app.delete_own_account()")
        except asyncpg.RaiseError as exc:
            if "ACCOUNT_HAS_ACTIVE_MATCH" in str(exc):
                raise ActiveMatchError() from exc
            raise
        if row is None:
            raise KeyError(actor.user_id)
        # SQL 関数は二重実行時に (0, 0) を返す。区別が要る場面は今のところ無い。
        return AccountDeletionResult(
            False, int(row["cancelled_requests"]), int(row["withdrawn_applications"]),
        )


_memory: MemoryAccountRepository | None = None
_postgres = PostgresAccountRepository()


def configure_memory_account_store(users_provider: StoreProvider) -> None:
    global _memory
    _memory = MemoryAccountRepository(users_provider)


def get_account_repository() -> AccountRepository:
    if settings.request_repository == "postgres":
        return _postgres
    if _memory is None:
        raise RuntimeError("Memory account store is not configured")
    return _memory
