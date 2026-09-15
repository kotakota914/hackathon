"""Postgres 版の依頼一覧が組み立てる SQL の、プレースホルダ数と引数数の一致を確かめる。

本番でだけ 500 になった不具合（$13 を片方の並び順でしか使わないのに引数は常に 13 個）
の再発防止。DB は使わず、接続を偽物に差し替えて SQL と引数だけを見る。
"""

from __future__ import annotations

import asyncio
import contextlib
import re
from datetime import datetime, timezone

import pytest

from app.auth import CurrentUser
from app.repositories import requests as module
from app.repositories.requests import PostgresRequestRepository, RequestCursor

ACTOR = CurrentUser(user_id="usr_101", role="member", status="active",
                    email_verified=True, verification_status="approved")
CURSOR_ID = "5fcfec7f-a8b0-58d4-931e-593d60355ee3"
CREATED_AT = datetime(2026, 8, 18, 1, 0, tzinfo=timezone.utc)


class FakeConnection:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple]] = []

    async def fetchrow(self, sql: str, *args):
        self.calls.append((sql, args))
        return {"created_at": CREATED_AT, "scheduled_at": CREATED_AT}

    async def fetch(self, sql: str, *args):
        self.calls.append((sql, args))
        return []


def placeholders(sql: str) -> int:
    return max(int(n) for n in re.findall(r"\$(\d+)", sql))


@pytest.mark.parametrize("sort", ["newest", "scheduled"])
@pytest.mark.parametrize("with_cursor", [False, True])
@pytest.mark.parametrize("keyword", [None, "電球"])
def test_list_sql_uses_every_argument(monkeypatch, sort: str, with_cursor: bool, keyword: str | None) -> None:
    conn = FakeConnection()

    @contextlib.asynccontextmanager
    async def fake_connection(actor):
        yield conn

    monkeypatch.setattr(module, "actor_connection", fake_connection)
    cursor = RequestCursor(CREATED_AT, CURSOR_ID) if with_cursor else None

    asyncio.run(PostgresRequestRepository().list(
        ACTOR, category=None, area_code=None, limit=20, cursor=cursor, keyword=keyword, sort=sort,
    ))

    sql, args = conn.calls[-1]
    assert placeholders(sql) == len(args), f"{placeholders(sql)} placeholders, {len(args)} args"
    # 未使用の引数が無いこと（$1〜$n がすべて SQL に現れる）
    used = {int(n) for n in re.findall(r"\$(\d+)", sql)}
    assert used == set(range(1, len(args) + 1))
    order_by = "scheduled_at asc" if sort == "scheduled" else "created_at desc"
    assert order_by in sql


def test_list_sql_references_only_existing_request_columns(monkeypatch) -> None:
    """SQL 中の r.<列名> が、migration の requests テーブル定義に存在することを確かめる。

    本番でだけ 500 になった不具合（本文の列は original_text なのに r.description を書いた）
    の再発防止。
    """
    from pathlib import Path

    baseline = Path("supabase/migrations/20260820000000_baseline.sql").read_text(encoding="utf-8")
    table = re.search(r"create table (?:if not exists )?(?:public\.)?requests \((.*?)\n\);", baseline, re.S)
    assert table, "requests テーブル定義が見つからない"
    columns = {
        line.strip().split()[0]
        for line in table.group(1).splitlines()
        if line.strip() and not line.strip().startswith(("constraint", "primary", "unique", "check", "foreign"))
    }
    # 後から alter table で足した列
    columns |= set(re.findall(r"alter table (?:public\.)?requests\s+add column (?:if not exists )?(\w+)", "\n".join(
        p.read_text(encoding="utf-8") for p in Path("supabase/migrations").glob("*.sql")
    ), re.I))

    conn = FakeConnection()

    @contextlib.asynccontextmanager
    async def fake_connection(actor):
        yield conn

    monkeypatch.setattr(module, "actor_connection", fake_connection)
    asyncio.run(PostgresRequestRepository().list(
        ACTOR, category=None, area_code=None, limit=20, keyword="電球", sort="scheduled",
    ))
    sql, _ = conn.calls[-1]
    referenced = set(re.findall(r"\br\.(\w+)", sql))
    missing = referenced - columns
    assert not missing, f"requests テーブルに無い列を参照している: {sorted(missing)}"
