# 古い依頼の自動期限切れ

予定日が過ぎた依頼が「募集中」のまま支援者の一覧に残り続ける問題を直す。
古い依頼が並ぶと、支援者は本当に手伝える依頼を見つけにくくなり、応募しても
依頼者はもう必要としていない、ということが起きる。

## 仕組み（2 段構え）

1. **期限を付ける。** 依頼の作成・予定変更のとき、`expires_at = 予定日時 + 24 時間` を入れる。
   公開一覧は期限を過ぎた依頼を出さない（Postgres は `app.request_is_public()`、Memory は `list`）。
   これだけで支援者側の一覧はすぐにきれいになる。定期処理が止まっていても効く。
2. **1 日 1 回、状態を確定する。** Vercel Cron が `GET /jobs/expire-requests` を呼び、
   期限を過ぎた `published` / `matching` の依頼を `expired` に変え、未処理の応募を `cancelled` にする。
   依頼者の「自分の依頼一覧」に「期限切れ」と出るようになる。

マッチ済み（`matched` 以降）の依頼は対象外。当日の約束は期限に関係なく進める。

## 設定

- Vercel（fitt0-api）の環境変数 `CRON_SECRET` にランダムな文字列を入れる（PowerShell で生成）。

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

- `vercel.json` の `crons` で毎日 18:00 UTC（日本時間 3:00）に実行する。
  Vercel は `Authorization: Bearer <CRON_SECRET>` を自動で付けて呼ぶ。
- `CRON_SECRET` が無い環境では `/jobs/expire-requests` は 404 を返し、定期処理は動かない
  （1 の期限による非表示は動く）。

## 確認方法

- Vercel → fitt0-api → Settings → Cron Jobs に `/jobs/expire-requests` が出る。
- 手で試す: `curl -H "Authorization: Bearer <CRON_SECRET>" https://fitt0-api.vercel.app/jobs/expire-requests`
  → `{"expiredRequests": n, "closedApplications": m}`。

## 実装の場所

- `app/services/request_expiry.py`（期限の計算、合言葉の照合、Memory 版の確定処理）
- `app/repositories/requests.py`（作成・更新で期限を付ける、一覧で隠す）
- `supabase/migrations/20260910040000_request_expiry.sql`（`app.expire_requests()`、`app.set_request_expiry()`）
- `vercel.json`（cron）、テスト `tests/test_request_expiry.py`
