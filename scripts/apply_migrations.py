"""supabase/migrations/*.sql を順番に適用し、適用済みを記録する。

使い方（PowerShell）:
    $env:DATABASE_URL = "postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres"
    .venv\\Scripts\\python.exe scripts\\apply_migrations.py            # 未適用分を適用
    .venv\\Scripts\\python.exe scripts\\apply_migrations.py --check    # 状態を見るだけ
    $env:TETOTE_APP_PASSWORD = "<アプリ用ロールのパスワード>"
    .venv\\Scripts\\python.exe scripts\\apply_migrations.py --set-app-password

- 接続には所有者権限（Supabase の postgres ユーザー）を使う。migration はロールや
  RLS を作るため、アプリ用ロール（tetote_app）では当てられない。
- 適用済みは public.schema_migrations に記録し、同じファイルは二度当てない
  （migration は forward-only で、既存ファイルは書き換えない前提）。
- 各ファイルは1つのトランザクションで当てる。途中で失敗したらそのファイルは
  丸ごと戻り、記録も残らない。
- --set-app-password は、アプリが接続する tetote_app ロールにパスワードを設定する。
  Vercel の DATABASE_URL はこのロールで作る（RLS を必ず通すため）。
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import sys
from pathlib import Path

import asyncpg

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "supabase" / "migrations"

TRACKING_TABLE_SQL = """
create table if not exists public.schema_migrations (
    filename text primary key,
    sha256 text not null,
    applied_at timestamptz not null default now()
);
"""


def _database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL が設定されていません。Supabase の接続文字列（postgres ユーザー）を環境変数に入れてください。")
    return url


def _redact(url: str) -> str:
    # 表示用。パスワード部分を伏せる。
    if "@" in url and "://" in url:
        head, tail = url.split("@", 1)
        scheme, creds = head.split("://", 1)
        user = creds.split(":", 1)[0]
        return f"{scheme}://{user}:***@{tail}"
    return "***"


async def _connect() -> asyncpg.Connection:
    # Supabase の transaction モードの pooler は prepared statement を扱えないため
    # statement_cache_size=0 にする。直結や session モードでも害はない。
    return await asyncpg.connect(_database_url(), statement_cache_size=0)


async def check() -> None:
    conn = await _connect()
    try:
        version = await conn.fetchval("select version()")
        print("接続先:", _redact(_database_url()))
        print("PostgreSQL:", version.split(",")[0])
        exists = await conn.fetchval(
            "select to_regclass('public.schema_migrations') is not null"
        )
        applied: set[str] = set()
        if exists:
            rows = await conn.fetch("select filename, applied_at from public.schema_migrations order by filename")
            applied = {row["filename"] for row in rows}
            print(f"適用済み: {len(applied)} 件")
            for row in rows:
                print(f"  ✓ {row['filename']}  ({row['applied_at']:%Y-%m-%d %H:%M})")
        else:
            print("適用済み: 0 件（schema_migrations テーブルなし）")
        pending = [p.name for p in sorted(MIGRATIONS_DIR.glob("*.sql")) if p.name not in applied]
        print(f"未適用: {len(pending)} 件")
        for name in pending:
            print(f"  - {name}")
        roles = await conn.fetch("select rolname, rolcanlogin from pg_roles where rolname in ('tetote_app','tetote_anon') order by rolname")
        print("ロール:", ", ".join(f"{r['rolname']}(login={'yes' if r['rolcanlogin'] else 'no'})" for r in roles) or "なし（baseline 未適用）")
    finally:
        await conn.close()


async def apply() -> None:
    conn = await _connect()
    try:
        await conn.execute(TRACKING_TABLE_SQL)
        applied = {
            row["filename"] for row in await conn.fetch("select filename from public.schema_migrations")
        }
        files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        pending = [path for path in files if path.name not in applied]
        if not pending:
            print("未適用の migration はありません。")
            return
        print(f"{len(pending)} 件を適用します（接続先: {_redact(_database_url())}）")
        for path in pending:
            sql = path.read_text(encoding="utf-8")
            digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
            print(f"  → {path.name} ...", end="", flush=True)
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute(
                    "insert into public.schema_migrations (filename, sha256) values ($1, $2)",
                    path.name, digest,
                )
            print(" OK")
        print("完了。--check で状態を確認できます。")
    finally:
        await conn.close()


async def set_app_password() -> None:
    password = os.getenv("TETOTE_APP_PASSWORD")
    if not password or len(password) < 16:
        sys.exit("TETOTE_APP_PASSWORD（16文字以上）を環境変数に設定してください。")
    conn = await _connect()
    try:
        exists = await conn.fetchval("select exists (select 1 from pg_roles where rolname = 'tetote_app')")
        if not exists:
            sys.exit("tetote_app ロールがありません。先に migration を適用してください。")
        # ロール名は固定文字列、パスワードは識別子ではなく文字列リテラルとして渡す。
        await conn.execute("alter role tetote_app with login password " + _quote_literal(password))
        print("tetote_app のパスワードを設定しました。")
        print("Vercel の DATABASE_URL は、ユーザー名を tetote_app（pooler 経由なら tetote_app.<project-ref>）にして作ってください。")
    finally:
        await conn.close()


def _quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="適用状態を表示するだけ")
    parser.add_argument("--set-app-password", action="store_true", help="tetote_app ロールのパスワードを設定する")
    args = parser.parse_args()
    if args.set_app_password:
        asyncio.run(set_app_password())
    elif args.check:
        asyncio.run(check())
    else:
        asyncio.run(apply())


if __name__ == "__main__":
    main()
