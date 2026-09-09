"""Web Push の購読先（通知の宛先）の保存。

- 本人は自分の購読を登録・削除できる（Postgres では RLS で本人の行だけ）。
- 送信側は相手の購読一覧を読む。退会済みと通知オフの利用者は除外する
  （Postgres は app.push_subscriptions_for、Memory は settings を参照）。
- 送信で失効（404/410）した endpoint は誰の行でも消す。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Protocol, TypedDict

from app.auth import CurrentUser
from app.db import actor_connection, admin_connection
from app.settings import settings


class PushSubscription(TypedDict):
    endpoint: str
    p256dh: str
    auth: str


class PushSubscriptionRepository(Protocol):
    async def upsert(
        self, actor: CurrentUser, subscription: PushSubscription, *, user_agent: str | None,
    ) -> None: ...

    async def delete(self, actor: CurrentUser, endpoint: str) -> bool: ...

    async def list_for_user(self, user_id: str) -> list[PushSubscription]: ...

    async def delete_endpoint(self, endpoint: str) -> bool: ...

    async def reset(self) -> None: ...


class MemoryPushSubscriptionRepository:
    def __init__(self) -> None:
        # endpoint -> (user_id, subscription)
        self._items: dict[str, tuple[str, PushSubscription, str]] = {}

    async def upsert(
        self, actor: CurrentUser, subscription: PushSubscription, *, user_agent: str | None,
    ) -> None:
        del user_agent
        self._items[subscription["endpoint"]] = (
            actor.user_id, dict(subscription), datetime.now(timezone.utc).isoformat(),  # type: ignore[arg-type]
        )

    async def delete(self, actor: CurrentUser, endpoint: str) -> bool:
        item = self._items.get(endpoint)
        if item is None or item[0] != actor.user_id:
            return False
        del self._items[endpoint]
        return True

    async def list_for_user(self, user_id: str) -> list[PushSubscription]:
        # 通知オフ・退会済みの除外は Postgres 関数と同じ条件で行う。
        from app.repositories.user_settings import get_user_settings_repository
        from app.cruds import main as runtime

        record = runtime.users_store.get(user_id)
        if record is None or record.get("status") != "active":
            return []
        actor = CurrentUser(
            user_id=user_id, role=record.get("role", "member"), status="active",
            email_verified=bool(record.get("emailVerified", False)),
            verification_status=record.get("verificationStatus", "unverified"),
        )
        preferences = await get_user_settings_repository().get(actor)
        if not preferences.get("notificationsEnabled", True):
            return []
        return [
            dict(subscription) for owner, subscription, _created in self._items.values()  # type: ignore[misc]
            if owner == user_id
        ]

    async def delete_endpoint(self, endpoint: str) -> bool:
        return self._items.pop(endpoint, None) is not None

    async def reset(self) -> None:
        self._items.clear()


class PostgresPushSubscriptionRepository:
    async def upsert(
        self, actor: CurrentUser, subscription: PushSubscription, *, user_agent: str | None,
    ) -> None:
        async with actor_connection(actor) as conn:
            await conn.execute(
                """
                insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
                values (app.current_actor(), $1, $2, $3, $4)
                on conflict (endpoint) do update
                   set user_id = excluded.user_id, p256dh = excluded.p256dh,
                       auth = excluded.auth, user_agent = excluded.user_agent, updated_at = now()
                """,
                subscription["endpoint"], subscription["p256dh"], subscription["auth"],
                (user_agent or "")[:300] or None,
            )

    async def delete(self, actor: CurrentUser, endpoint: str) -> bool:
        async with actor_connection(actor) as conn:
            result = await conn.execute(
                "delete from push_subscriptions where endpoint = $1 and user_id = app.current_actor()",
                endpoint,
            )
        return result.endswith(" 1")

    async def list_for_user(self, user_id: str) -> list[PushSubscription]:
        async with admin_connection() as conn:
            rows = await conn.fetch("select * from app.push_subscriptions_for($1)", user_id)
        return [{"endpoint": r["endpoint"], "p256dh": r["p256dh"], "auth": r["auth"]} for r in rows]

    async def delete_endpoint(self, endpoint: str) -> bool:
        async with admin_connection() as conn:
            return bool(await conn.fetchval(
                "select app.delete_push_subscription_by_endpoint($1)", endpoint,
            ))

    async def reset(self) -> None:
        return None


_memory = MemoryPushSubscriptionRepository()
_postgres = PostgresPushSubscriptionRepository()


def get_push_subscription_repository() -> PushSubscriptionRepository:
    if settings.request_repository == "postgres":
        return _postgres
    return _memory


def _unused(_: Any) -> None:  # pragma: no cover - keeps type checkers quiet about Any import
    return None
