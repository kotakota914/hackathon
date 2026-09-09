"""レビュー（完了後の評価）の保存と要約。

- 投稿は completed なマッチの当事者だけ。同じマッチに同じ人は 1 件（DB の一意制約）。
- 要約（件数と「良かった点」の件数）は公開プロフィールに出す。本文や誰が書いたかは出さない。
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Protocol, TypedDict

from app.auth import CurrentUser
from app.settings import settings

TRAITS = ("onTime", "polite", "safetyAware", "communicative")


class DuplicateReviewError(Exception):
    """同じマッチに同じ人が 2 件目を送ろうとした。"""


class ReviewSummary(TypedDict):
    count: int
    onTime: int
    polite: int
    safetyAware: int
    communicative: int


EMPTY_SUMMARY: ReviewSummary = {"count": 0, "onTime": 0, "polite": 0, "safetyAware": 0, "communicative": 0}


class ReviewRepository(Protocol):
    async def create(
        self, actor: CurrentUser, *, match_id: str, reviewee_id: str,
        evaluation: dict[str, bool], comment: str,
    ) -> dict[str, Any]: ...

    async def summary_for(self, viewer: CurrentUser, user_id: str) -> ReviewSummary: ...


def _iso(value: Any) -> str | None:
    if value is None or isinstance(value, str):
        return value
    return value.isoformat().replace("+00:00", "Z")


class MemoryReviewRepository:
    async def create(
        self, actor: CurrentUser, *, match_id: str, reviewee_id: str,
        evaluation: dict[str, bool], comment: str,
    ) -> dict[str, Any]:
        from app.cruds import main as runtime

        for review in runtime.reviews.values():
            if review["matchId"] == match_id and review["reviewerId"] == actor.user_id:
                raise DuplicateReviewError(match_id)
        item = {
            "id": f"review_{uuid.uuid4().hex[:8]}",
            "matchId": match_id,
            "reviewerId": actor.user_id,
            "revieweeId": reviewee_id,
            **{trait: bool(evaluation.get(trait, False)) for trait in TRAITS},
            "comment": comment,
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        runtime.reviews[item["id"]] = item
        return dict(item)

    async def summary_for(self, viewer: CurrentUser, user_id: str) -> ReviewSummary:
        from app.cruds import main as runtime

        del viewer
        summary: ReviewSummary = dict(EMPTY_SUMMARY)  # type: ignore[assignment]
        for review in runtime.reviews.values():
            if review.get("revieweeId") != user_id:
                continue
            summary["count"] += 1
            for trait in TRAITS:
                if review.get(trait):
                    summary[trait] += 1  # type: ignore[literal-required]
        return summary


class PostgresReviewRepository:
    async def create(
        self, actor: CurrentUser, *, match_id: str, reviewee_id: str,
        evaluation: dict[str, bool], comment: str,
    ) -> dict[str, Any]:
        import asyncpg

        from app.db import actor_connection

        payload = {trait: bool(evaluation.get(trait, False)) for trait in TRAITS}
        try:
            async with actor_connection(actor) as conn:
                row = await conn.fetchrow(
                    """
                    insert into reviews (match_id, reviewer_id, reviewee_id, evaluation, comment)
                    values ($1, app.current_actor(), app.authenticated_user_id($2), $3::jsonb, $4)
                    returning id, created_at
                    """,
                    uuid.UUID(match_id), reviewee_id, json.dumps(payload), comment,
                )
        except asyncpg.UniqueViolationError as exc:
            raise DuplicateReviewError(match_id) from exc
        return {
            "id": str(row["id"]),
            "matchId": match_id,
            "reviewerId": actor.user_id,
            "revieweeId": reviewee_id,
            **payload,
            "comment": comment,
            "createdAt": _iso(row["created_at"]),
        }

    async def summary_for(self, viewer: CurrentUser, user_id: str) -> ReviewSummary:
        from app.db import actor_connection

        async with actor_connection(viewer) as conn:
            row = await conn.fetchrow("select * from app.review_summary_for($1)", user_id)
        if row is None:
            return dict(EMPTY_SUMMARY)  # type: ignore[return-value]
        return {
            "count": int(row["review_count"]),
            "onTime": int(row["on_time_count"]),
            "polite": int(row["polite_count"]),
            "safetyAware": int(row["safety_aware_count"]),
            "communicative": int(row["communicative_count"]),
        }


_memory = MemoryReviewRepository()
_postgres = PostgresReviewRepository()


def get_review_repository() -> ReviewRepository:
    if settings.request_repository == "postgres":
        return _postgres
    return _memory
