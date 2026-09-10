"""出来事を相手に知らせる（アプリ内のお知らせ + プッシュ通知）。

呼び出し側は「誰に」「何を」だけを渡す。ここでアプリ内に残し、続けてプッシュを送る。
どちらも失敗しても本来の処理（応募・選出・送信）は成功したままにする。
"""

from __future__ import annotations

import logging

from app.repositories.notifications import get_notification_repository
from app.services import push as push_service
from app.services.push import PushMessage

logger = logging.getLogger(__name__)


async def deliver(user_id: str, message: PushMessage) -> None:
    try:
        await get_notification_repository().add(
            user_id, kind=message.tag, title=message.title, body=message.body, url=message.url,
        )
    except Exception:  # noqa: BLE001 - お知らせの記録失敗で本来の処理を止めない
        logger.exception("in-app notification failed user=%s kind=%s", user_id, message.tag)
    await push_service.notify_quietly(user_id, message)
