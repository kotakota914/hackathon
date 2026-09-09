"""古い依頼の自動期限切れ。

- 期限（expires_at）は「予定日時 + EXPIRY_GRACE」。作成・更新時にアプリが決める。
  公開一覧は期限を過ぎた依頼を出さない（Postgres は app.request_is_public、Memory は list）。
- 1 日 1 回の定期処理（Vercel Cron → GET /jobs/expire-requests）で、期限を過ぎた
  published / matching の依頼を expired に確定し、未処理の応募を cancelled にする。
- 定期処理の呼び出しは CRON_SECRET（Authorization: Bearer …）で守る。未設定なら 404。
"""

from __future__ import annotations

import hmac
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

EXPIRY_GRACE = timedelta(hours=24)
EXPIRABLE_STATUSES = frozenset({"published", "matching"})


def expires_at_for(scheduled_at: str | datetime | None) -> datetime | None:
    """予定日時から期限を決める。予定が無ければ期限も無し。"""
    if scheduled_at is None:
        return None
    if isinstance(scheduled_at, str):
        try:
            moment = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        moment = scheduled_at
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment + EXPIRY_GRACE


def is_expired(expires_at: str | datetime | None, *, now: datetime | None = None) -> bool:
    if expires_at is None:
        return False
    if isinstance(expires_at, str):
        try:
            moment = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            return False
    else:
        moment = expires_at
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment <= (now or datetime.now(timezone.utc))


def cron_secret_matches(authorization: str | None) -> bool | None:
    """Authorization ヘッダーが CRON_SECRET と一致するか。秘密が未設定なら None。"""
    secret = os.getenv("CRON_SECRET", "")
    if not secret:
        return None
    if not authorization:
        return False
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return False
    return hmac.compare_digest(token.strip(), secret)


@dataclass(frozen=True)
class ExpiryResult:
    expired_requests: int
    closed_applications: int


async def expire_requests_in_memory() -> ExpiryResult:
    """Memory 実装向け。Postgres は app.expire_requests() が同じことを行う。"""
    from app.repositories.applications import get_application_repository
    from app.repositories.requests import get_request_repository

    now = datetime.now(timezone.utc)
    expired_ids: set[str] = set()
    for item in getattr(get_request_repository(), "_items", {}).values():
        if item.get("status") in EXPIRABLE_STATUSES and is_expired(item.get("expiresAt"), now=now):
            item["status"] = "expired"
            item["updatedAt"] = now.isoformat().replace("+00:00", "Z")
            expired_ids.add(item["id"])
    closed = 0
    for application in getattr(get_application_repository(), "_items", {}).values():
        if application.get("requestId") in expired_ids and application.get("status") == "applied":
            application["status"] = "cancelled"
            closed += 1
    return ExpiryResult(len(expired_ids), closed)


async def expire_requests_in_postgres() -> ExpiryResult:
    from app.db import admin_connection

    async with admin_connection() as conn:
        row = await conn.fetchrow("select * from app.expire_requests()")
    if row is None:
        return ExpiryResult(0, 0)
    return ExpiryResult(int(row["expired_requests"]), int(row["closed_applications"]))
