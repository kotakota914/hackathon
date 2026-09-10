"""本番（または任意の環境）で、主要な流れが一通り動くかを確かめる。

使い方（PowerShell）:
    .venv\\Scripts\\python.exe scripts\\smoke_production.py
    .venv\\Scripts\\python.exe scripts\\smoke_production.py --api https://fitt0-api.vercel.app --origin https://fitt0-app.vercel.app

やること（使い捨ての利用者 2 人を作り、最後に両方とも退会させる）:
    A 登録 → A が依頼を作る → B 登録 → B に依頼が見える → B が応募 → A に「お知らせ」が届く
    → A が B を選ぶ → B がメッセージを送る → 双方が完了を確認 → A が B を評価
    → B の公開プロフィールに回数と評価が出る → A・B が退会 → 再ログインできない

- トークンやパスワードは表示しない。メールアドレスは example.com の使い捨て。
- 途中で失敗したら、その時点で分かる範囲の情報を出して終了コード 1。退会は可能な限り行う。
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import uuid

import httpx

DEFAULT_API = "https://fitt0-api.vercel.app"
DEFAULT_ORIGIN = "https://fitt0-app.vercel.app"


class Smoke:
    def __init__(self, api: str, origin: str) -> None:
        self.api = api.rstrip("/")
        self.origin = origin.rstrip("/")
        self.http = httpx.Client(timeout=30)
        self.tokens: dict[str, str] = {}
        self.failures: list[str] = []

    # ---- helpers -----------------------------------------------------------
    def _headers(self, who: str | None, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"Origin": self.origin, "Content-Type": "application/json"}
        if who:
            headers["Authorization"] = f"Bearer {self.tokens[who]}"
        if extra:
            headers.update(extra)
        return headers

    def call(self, who: str | None, method: str, path: str, body: dict | None = None, *,
             expect: int | tuple[int, ...] = 200, extra: dict[str, str] | None = None) -> httpx.Response:
        response = self.http.request(method, self.api + path, headers=self._headers(who, extra),
                                     content=json.dumps(body, ensure_ascii=False).encode() if body is not None else None)
        wanted = expect if isinstance(expect, tuple) else (expect,)
        if response.status_code not in wanted:
            self.fail(f"{method} {path} -> {response.status_code} (expected {wanted}): {response.text[:200]}")
        return response

    def fail(self, message: str) -> None:
        self.failures.append(message)
        print("  FAIL:", message)

    def ok(self, message: str) -> None:
        print("  ok  :", message)

    def signup(self, who: str) -> str:
        email = f"smoke-{who.lower()}-{uuid.uuid4().hex[:10]}@example.com"
        password = base64.urlsafe_b64encode(os.urandom(18)).decode().rstrip("=") + "x1"
        response = self.http.post(
            self.api + "/auth/signup",
            headers={"Origin": self.origin, "Content-Type": "application/json", "rid": "emailpassword", "st-auth-mode": "header"},
            json={"formFields": [{"id": "email", "value": email}, {"id": "password", "value": password}]},
        )
        token = response.headers.get("st-access-token")
        if response.status_code != 200 or not token or response.json().get("status") != "OK":
            self.fail(f"signup {who}: {response.status_code} {response.text[:120]}")
            raise SystemExit(1)
        self.tokens[who] = token
        self.ok(f"{who} を登録")
        return email

    # ---- the flow ------------------------------------------------------------
    def run(self) -> int:
        print(f"対象: API={self.api} ORIGIN={self.origin}")
        health = self.call(None, "GET", "/health")
        if health.status_code == 200:
            self.ok("/health")

        self.signup("A")
        request = self.call("A", "POST", "/requests", {
            "title": "[動作確認] 電球の交換", "description": "動作確認用の依頼です。すぐに消します。",
            "category": "household", "scheduledAt": "2099-01-01T10:00:00+09:00",
            "estimatedMinutes": 30, "confirmed": True,
        }, expect=201, extra={"Idempotency-Key": str(uuid.uuid4())}).json()
        request_id = request.get("id")
        if request_id and request.get("status") == "published":
            self.ok("A が依頼を作成（公開）")

        self.signup("B")
        listed = self.call("B", "GET", "/requests?limit=50").json().get("items", [])
        if any(item.get("id") == request_id for item in listed):
            self.ok("B の一覧に A の依頼が見える")
        else:
            self.fail("B の一覧に A の依頼が無い")

        application = self.call("B", "POST", f"/requests/{request_id}/applications", {
            "message": "動作確認です。伺えます。", "availableAt": "2099-01-01T10:00:00+09:00",
        }, expect=201).json()
        application_id = application.get("id")

        time.sleep(1.5)  # お知らせは応答後に記録される
        inbox = self.call("A", "GET", "/me/notifications").json()
        if any(item.get("kind") == "application" for item in inbox.get("items", [])):
            self.ok("A にお知らせ「応募が届きました」")
        else:
            self.fail(f"A のお知らせに応募が無い: {inbox}")

        match = self.call("A", "POST", f"/applications/{application_id}/select",
                          {"expectedVersion": request.get("version", 1)}, expect=(200, 201)).json()
        match_id = match.get("id")
        if match_id:
            self.ok("A が B を選んでマッチ成立")

        self.call("B", "POST", f"/matches/{match_id}/messages", {"body": "動作確認のメッセージです"}, expect=201)
        messages = self.call("A", "GET", f"/matches/{match_id}/messages").json()
        if messages.get("items"):
            self.ok("B のメッセージが A に届く")
        else:
            self.fail("メッセージが取得できない")

        self.call("B", "POST", f"/matches/{match_id}/complete", {"completed": True, "actorRole": "helper"})
        done = self.call("A", "POST", f"/matches/{match_id}/complete", {"completed": True, "actorRole": "requester"}).json()
        if done.get("status") == "completed":
            self.ok("双方が完了を確認")
        else:
            self.fail(f"完了にならない: {done.get('status')}")

        self.call("A", "POST", f"/matches/{match_id}/reviews", {
            "onTime": True, "polite": True, "safetyAware": True, "communicative": True, "comment": "動作確認。ありがとうございました。",
        }, expect=201)
        profile_b = self.call("A", "GET", f"/users/{self._user_id('B')}/public-profile").json()
        if profile_b.get("completedCount", 0) >= 1 and profile_b.get("reviewSummary", {}).get("count", 0) >= 1:
            self.ok("B の公開プロフィールに回数と評価が出る")
        else:
            self.fail(f"公開プロフィールが更新されていない: {profile_b}")

        return self.cleanup()

    def _user_id(self, who: str) -> str:
        return self.call(who, "GET", "/profile").json()["id"]

    def cleanup(self) -> int:
        for who in list(self.tokens):
            response = self.http.delete(self.api + "/account", headers=self._headers(who))
            if response.status_code == 204:
                self.ok(f"{who} を退会")
            else:
                self.fail(f"{who} の退会に失敗: {response.status_code} {response.text[:120]}")
        for who in list(self.tokens):
            after = self.http.get(self.api + "/profile", headers=self._headers(who))
            if after.status_code in (401, 403):
                self.ok(f"{who} は退会後にアクセスできない")
            else:
                self.fail(f"{who} が退会後もアクセスできる: {after.status_code}")
        print()
        if self.failures:
            print(f"NG: {len(self.failures)} 件の失敗")
            return 1
        print("OK: すべて通過")
        return 0


def main() -> None:
    # Windows のコンソールでも日本語が化けないようにする。
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default=os.getenv("SMOKE_API", DEFAULT_API))
    parser.add_argument("--origin", default=os.getenv("SMOKE_ORIGIN", DEFAULT_ORIGIN))
    args = parser.parse_args()
    smoke = Smoke(args.api, args.origin)
    try:
        code = smoke.run()
    except SystemExit as exc:
        code = int(exc.code or 1)
        smoke.cleanup()
    except Exception as exc:  # noqa: BLE001
        print("  ERROR:", repr(exc))
        smoke.cleanup()
        code = 1
    sys.exit(code)


if __name__ == "__main__":
    main()
