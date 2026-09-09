"""Web Push の送信。

環境変数:
- VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: base64url の生鍵（py_vapid の from_raw 形式）。
  無ければ通知機能は無効（購読 API は 404 PUSH_DISABLED、送信は何もしない）。
- VAPID_SUBJECT: 連絡先（mailto:… または https://…）。既定は mailto:support@fitt0.invalid。

送信は本文（メッセージの中身など）を含めない。「応募が届きました」のような事実と、
開くべき画面の URL だけを送る。個人情報を通知経路に流さないため。
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Awaitable, Callable

import anyio

from app.repositories.push import PushSubscription, get_push_subscription_repository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PushMessage:
    title: str
    body: str
    url: str
    tag: str

    def to_json(self) -> str:
        return json.dumps(
            {"title": self.title, "body": self.body, "url": self.url, "tag": self.tag},
            ensure_ascii=False,
        )


# 通知の文面。本文は固定文で、相手の名前やメッセージ内容は入れない。
def application_received(url: str) -> PushMessage:
    return PushMessage("応募が届きました", "あなたの依頼に手伝いたい人が現れました。", url, "application")


def helper_selected(url: str) -> PushMessage:
    return PushMessage("選ばれました", "依頼した人があなたを選びました。トークで約束をしましょう。", url, "selected")


def message_received(url: str) -> PushMessage:
    return PushMessage("新しいメッセージ", "トークに新しいメッセージが届きました。", url, "message")


class SendResult:
    __slots__ = ("sent", "expired", "failed")

    def __init__(self) -> None:
        self.sent = 0
        self.expired = 0
        self.failed = 0


# 実送信の差し替え口。テストでは偽の送信関数を入れる。
# 戻り値: "ok" | "expired" | "failed"
Transport = Callable[[PushSubscription, str], Awaitable[str]]


def vapid_configured() -> bool:
    return bool(os.getenv("VAPID_PUBLIC_KEY")) and bool(os.getenv("VAPID_PRIVATE_KEY"))


def vapid_public_key() -> str | None:
    return os.getenv("VAPID_PUBLIC_KEY") or None


def _vapid_claims() -> dict[str, str]:
    return {"sub": os.getenv("VAPID_SUBJECT", "mailto:support@fitt0.invalid")}


async def _webpush_transport(subscription: PushSubscription, payload: str) -> str:
    """pywebpush で実際に送る。HTTP は同期ライブラリなのでスレッドに逃がす。"""
    from py_vapid import Vapid
    from pywebpush import WebPushException, webpush

    private = os.getenv("VAPID_PRIVATE_KEY", "")

    def send() -> str:
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription["endpoint"],
                    "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
                },
                data=payload,
                vapid_private_key=Vapid.from_raw(private.encode("ascii")),
                vapid_claims=_vapid_claims(),
                ttl=60 * 60 * 6,
                timeout=10,
            )
            return "ok"
        except WebPushException as exc:  # pragma: no cover - 実送信の失敗経路
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in {404, 410}:
                return "expired"
            logger.warning("web push failed status=%s", status)
            return "failed"
        except Exception:  # pragma: no cover
            logger.exception("web push raised")
            return "failed"

    return await anyio.to_thread.run_sync(send)


_transport: Transport | None = None


def configure_transport(transport: Transport | None) -> None:
    """テストや将来の別経路（APNs など）のための差し替え。None で既定に戻す。"""
    global _transport
    _transport = transport


async def notify_user(user_id: str, message: PushMessage) -> SendResult:
    """相手の購読すべてに送る。失効した購読は消す。VAPID 未設定なら何もしない。"""
    result = SendResult()
    transport = _transport
    if transport is None:
        if not vapid_configured():
            return result
        transport = _webpush_transport
    repository = get_push_subscription_repository()
    subscriptions = await repository.list_for_user(user_id)
    payload = message.to_json()
    for subscription in subscriptions:
        outcome = await transport(subscription, payload)
        if outcome == "ok":
            result.sent += 1
        elif outcome == "expired":
            result.expired += 1
            await repository.delete_endpoint(subscription["endpoint"])
        else:
            result.failed += 1
    return result


async def notify_quietly(user_id: str, message: PushMessage) -> None:
    """バックグラウンドで呼ぶ用。例外で本処理を壊さない。"""
    try:
        await notify_user(user_id, message)
    except Exception:  # pragma: no cover - 通知は補助機能
        logger.exception("push notification failed user=%s", user_id)
