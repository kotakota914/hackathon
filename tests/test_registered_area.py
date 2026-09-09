"""登録地域の解決のテスト。

本番では利用者のプロフィールが Postgres にあり、開発用の users_store には無い。
認証時に解決した登録地域（CurrentUser.area_code）を使うことで、現在地が取れない
ときも既定地域ではなく登録地域の依頼が出るようにする。
"""

import os

os.environ["SUPERTOKENS_ENABLED"] = "false"
os.environ["MOCK_RESET_ENABLED"] = "true"
os.environ["APP_ENV"] = "test"
os.environ["REQUEST_REPOSITORY"] = "memory"

from app.auth import CurrentUser, _current_user_from_record
from app.cruds.main import DEFAULT_AREA_CODE, resolve_location


def user(area_code: str | None, user_id: str = "usr_unknown_in_memory") -> CurrentUser:
    return CurrentUser(
        user_id=user_id, role="member", status="active", email_verified=True,
        verification_status="approved", area_code=area_code,
    )


def test_registered_area_from_authentication_is_used() -> None:
    assert resolve_location(None, user("AREA-002")) == ("AREA-002", "registered_region")


def test_unknown_registered_area_falls_back_to_default() -> None:
    assert resolve_location(None, user("AREA-999")) == (DEFAULT_AREA_CODE, "default_region")
    assert resolve_location(None, user(None)) == (DEFAULT_AREA_CODE, "default_region")


def test_selected_area_wins_over_registered() -> None:
    assert resolve_location(None, user("AREA-002"), "AREA-003") == ("AREA-003", "selected_region")


def test_current_user_carries_area_code_from_the_profile_record() -> None:
    record = {"role": "member", "status": "active", "areaCode": "AREA-003"}
    current = _current_user_from_record("u1", record)
    assert current.area_code == "AREA-003"
    assert _current_user_from_record("u2", {"role": "member", "status": "active"}).area_code is None
