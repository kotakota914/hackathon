"""管理者の自動付与（ADMIN_AUTH_SUBJECTS）のテスト。"""

import asyncio

from app.services.admin_bootstrap import (
    admin_subjects_from_env,
    promote_in_memory,
    with_admin_bootstrap,
)


def test_env_parsing_ignores_blanks_and_spaces() -> None:
    assert admin_subjects_from_env(" a1 , ,b2,") == frozenset({"a1", "b2"})
    assert admin_subjects_from_env("") == frozenset()


def run(coro):
    return asyncio.run(coro)


def make_store() -> dict[str, dict]:
    return {
        "u-listed": {"id": "u-listed", "role": "member", "status": "active"},
        "u-other": {"id": "u-other", "role": "member", "status": "active"},
        "u-gone": {"id": "u-gone", "role": "member", "status": "deleted"},
    }


def test_listed_member_becomes_admin_on_lookup() -> None:
    store = make_store()
    resolve = with_admin_bootstrap(
        lambda uid: store.get(uid), promote_in_memory(lambda: store),
        subjects=frozenset({"u-listed", "u-gone"}),
    )
    assert run(resolve("u-listed"))["role"] == "admin"
    assert store["u-listed"]["role"] == "admin"
    # 載っていない人は変わらない
    assert run(resolve("u-other"))["role"] == "member"
    # 退会済みは対象外
    assert run(resolve("u-gone"))["role"] == "member"
    # 存在しない人は None のまま
    assert run(resolve("nobody")) is None


def test_lookup_may_be_async() -> None:
    store = make_store()

    async def lookup(uid: str):
        return store.get(uid)

    resolve = with_admin_bootstrap(lookup, promote_in_memory(lambda: store), subjects=frozenset({"u-listed"}))
    assert run(resolve("u-listed"))["role"] == "admin"
