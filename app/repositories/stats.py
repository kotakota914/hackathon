"""自治体ダッシュボード用の集計（個人情報を含まない）。

要点:
- 管理者だけが呼べる（呼び出し側でロールを確認する）。集計は全利用者の依頼・
  マッチを横断するため、Postgres では security definer 関数で RLS を越える。
- 返すのは件数などの集計値だけ。氏名・本文・座標などの個人情報は一切含めない。
- 人数の少ない区分（既定 5 未満）は個人が推測できてしまうため伏せる（null）。
  この判断は service 側で行い、しきい値を明示・テスト可能にする。

段階1では「管理者が全地域の集計を見る」形。将来、自治体ロールを足して地域ごとに
絞る際も、この集計ロジックと画面はそのまま使い、絞り込み条件を加えるだけでよい。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Protocol

from app.auth import CurrentUser
from app.settings import settings

# この人数未満の区分は伏せる（k-匿名性の簡易版）。
MIN_CELL_SIZE = 5

# 依頼の状態を「完了」「取消系」に分類する。
COMPLETED_REQUEST_STATUSES = frozenset({"completed"})
CANCELLED_REQUEST_STATUSES = frozenset({"cancelled", "rejected", "expired"})
# 「成立した」とみなすマッチの状態（cancelled は成立前に消えたものとして除く）。
FORMED_MATCH_STATUSES = frozenset(
    {"matched", "in_progress", "completion_pending", "completed", "disputed"}
)

# 集計の表示名。未知のコード・カテゴリはそのまま見せる。
AREA_LABELS = {"AREA-001": "大学周辺", "AREA-002": "大学北側", "AREA-003": "駅周辺"}
CATEGORY_LABELS = {
    "pet_support": "ペット・動物",
    "snow_removal": "雪かき・力仕事",
    "shopping": "買い物",
    "cleaning": "掃除・日常生活",
    "digital_support": "デジタル・パソコン",
    "escort": "付き添い・外出",
    "exercise": "運動",
    "walking": "散歩",
    "gardening": "庭・草むしり",
    "household": "家事",
    "errand": "用事・お使い",
    "moving": "移動・運搬",
}


def area_label(code: str) -> str:
    return AREA_LABELS.get(code, code)


def category_label(category: str) -> str:
    return CATEGORY_LABELS.get(category, category)


def suppress(count: int, *, min_cell: int = MIN_CELL_SIZE) -> int | None:
    """少人数の区分を伏せる。0 は誰も特定できないのでそのまま、1..min_cell-1 は null。"""
    if count <= 0:
        return 0
    return count if count >= min_cell else None


@dataclass
class _Bucket:
    requests: int = 0
    completed: int = 0


@dataclass
class Overview:
    from_date: datetime
    to_date: datetime
    requests_created: int = 0
    requests_completed: int = 0
    requests_cancelled: int = 0
    matches_formed: int = 0
    matches_completed: int = 0
    active_helpers: int = 0
    estimated_minutes_total: int = 0
    estimated_minutes_count: int = 0
    by_area: dict[str, _Bucket] = field(default_factory=dict)
    by_category: dict[str, _Bucket] = field(default_factory=dict)

    def avg_estimated_minutes(self) -> int | None:
        if self.estimated_minutes_count == 0:
            return None
        return round(self.estimated_minutes_total / self.estimated_minutes_count)


class StatsRepository(Protocol):
    async def municipality_overview(
        self, actor: CurrentUser, *, since: datetime, until: datetime
    ) -> Overview: ...


def _in_window(created_at: Any, since: datetime, until: datetime) -> bool:
    moment = _as_datetime(created_at)
    if moment is None:
        return False
    return since <= moment < until


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


class MemoryStatsRepository:
    def __init__(
        self,
        requests_provider: Callable[[], dict[str, dict[str, Any]]],
        matches_provider: Callable[[], dict[str, dict[str, Any]]],
    ) -> None:
        self._requests = requests_provider
        self._matches = matches_provider

    async def municipality_overview(
        self, actor: CurrentUser, *, since: datetime, until: datetime
    ) -> Overview:
        del actor  # ロール確認は呼び出し側（エンドポイント）で行う
        overview = Overview(from_date=since, to_date=until)
        for item in self._requests().values():
            if not _in_window(item.get("createdAt"), since, until):
                continue
            overview.requests_created += 1
            status = item.get("status")
            completed = status in COMPLETED_REQUEST_STATUSES
            if completed:
                overview.requests_completed += 1
            elif status in CANCELLED_REQUEST_STATUSES:
                overview.requests_cancelled += 1
            minutes = item.get("estimatedMinutes")
            if isinstance(minutes, int):
                overview.estimated_minutes_total += minutes
                overview.estimated_minutes_count += 1
            area = overview.by_area.setdefault(item.get("areaCode", "?"), _Bucket())
            area.requests += 1
            area.completed += int(completed)
            category = overview.by_category.setdefault(item.get("category", "?"), _Bucket())
            category.requests += 1
            category.completed += int(completed)

        helpers: set[str] = set()
        for match in self._matches().values():
            if not _in_window(match.get("matchedAt"), since, until):
                continue
            if match.get("status") not in FORMED_MATCH_STATUSES:
                continue
            overview.matches_formed += 1
            if match.get("status") == "completed":
                overview.matches_completed += 1
            helper = match.get("helperId")
            if helper:
                helpers.add(helper)
        overview.active_helpers = len(helpers)
        return overview


class PostgresStatsRepository:
    async def municipality_overview(
        self, actor: CurrentUser, *, since: datetime, until: datetime
    ) -> Overview:
        # security definer 関数が管理者かどうかを内部で再確認する（多層防御）。
        from app.db import actor_connection

        overview = Overview(from_date=since, to_date=until)
        async with actor_connection(actor) as conn:
            totals = await conn.fetchrow(
                "select * from app.municipality_totals($1, $2)", since, until
            )
            areas = await conn.fetch(
                "select * from app.municipality_breakdown($1, $2, 'area')", since, until
            )
            categories = await conn.fetch(
                "select * from app.municipality_breakdown($1, $2, 'category')", since, until
            )
        if totals is not None:
            overview.requests_created = totals["requests_created"]
            overview.requests_completed = totals["requests_completed"]
            overview.requests_cancelled = totals["requests_cancelled"]
            overview.matches_formed = totals["matches_formed"]
            overview.matches_completed = totals["matches_completed"]
            overview.active_helpers = totals["active_helpers"]
            overview.estimated_minutes_total = totals["estimated_minutes_total"] or 0
            overview.estimated_minutes_count = totals["estimated_minutes_count"] or 0
        for row in areas:
            overview.by_area[row["key"]] = _Bucket(row["requests"], row["completed"])
        for row in categories:
            overview.by_category[row["key"]] = _Bucket(row["requests"], row["completed"])
        return overview


_memory: MemoryStatsRepository | None = None
_postgres = PostgresStatsRepository()


def configure_memory_stats_store(
    requests_provider: Callable[[], dict[str, dict[str, Any]]],
    matches_provider: Callable[[], dict[str, dict[str, Any]]],
) -> None:
    global _memory
    _memory = MemoryStatsRepository(requests_provider, matches_provider)


def get_stats_repository() -> StatsRepository:
    if settings.request_repository == "postgres":
        return _postgres
    if _memory is None:
        raise RuntimeError("Memory stats store is not configured")
    return _memory
