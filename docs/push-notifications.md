# プッシュ通知（Web Push）

アプリを閉じていても「応募が届いた」「選ばれた」「メッセージが届いた」を知らせる。
助け合いは相手の反応を待つ時間が長いので、この機能が無いと依頼が放置されやすい。

## 何を、いつ、誰に送るか

| 出来事 | 宛先 | 通知の文面 | 押すと開く画面 |
|---|---|---|---|
| 応募が来た | 依頼者 | 応募が届きました / あなたの依頼に手伝いたい人が現れました。 | `/help/requests` |
| 応募者が選ばれた | 支援者 | 選ばれました / 依頼した人があなたを選びました。 | `/helper/chats` |
| メッセージが届いた | 相手 | 新しいメッセージ / トークに新しいメッセージが届きました。 | `/help/chat?matchId=…` または `/helper/chat?matchId=…` |

**通知の本文に個人情報は入れない。** 相手の名前もメッセージの中身も送らず、事実と開く画面だけを送る。
通知経路（ブラウザベンダーのサーバー）に個人情報を流さないため。

送らない条件: 宛先が退会済み、設定の「通知」がオフ、購読が無い。
失効した購読（404 / 410）は送信時に自動で削除する。

## 仕組み

- ブラウザ側: `public/sw.js` が `push` で通知を表示し、`notificationclick` で画面を開く。
- 購読: 設定の「通知」をオンにしたときだけ許可を求め、`PushManager.subscribe` の結果を `PUT /push/subscriptions` で保存する。
  ログイン後の画面では `usePushSync` が既存の購読を登録し直す（許可は新たに求めない）。
- サーバー: `app/services/push.py` が `pywebpush` で送る。`FastAPI` の `BackgroundTasks` で応答後に送るので、応募や送信の応答が遅くならない。
- 保存先: `push_subscriptions`（本人だけが自分の行を読み書き。送信用の読み出しは security definer 関数で、退会済み・通知オフを除外）。

## 鍵の作り方（一度だけ）

VAPID という方式の鍵ペアが要る。ローカルで作って Vercel（fitt0-api）の環境変数に入れる。

```powershell
.venv\Scripts\python.exe -c "from py_vapid import Vapid, b64urlencode; from cryptography.hazmat.primitives import serialization as s; v=Vapid(); v.generate_keys(); print('VAPID_PUBLIC_KEY=' + b64urlencode(v.public_key.public_bytes(s.Encoding.X962, s.PublicFormat.UncompressedPoint))); print('VAPID_PRIVATE_KEY=' + b64urlencode(v.private_key.private_numbers().private_value.to_bytes(32, 'big')))"
```

出た 2 行を Vercel の Environment Variables に入れ、あわせて `VAPID_SUBJECT=mailto:自分のメールアドレス` を追加して再デプロイする。
**秘密鍵はチャットやリポジトリに貼らない。** 未設定の環境では通知機能は静かに無効になる（購読 API は 404 `PUSH_DISABLED`）。

## 確認方法

1. 本番をスマホの Chrome で開き、設定 → 「通知」をオンにする → 許可ダイアログで許可 → 「通知をオンにしました」が出る
2. 別のアカウントからその人の依頼に応募する → 通知が届く → 押すと依頼一覧が開く
3. iPhone は **ホーム画面に追加したアプリから開いたときだけ** 通知が使える（iOS 16.4 以降）

## 対応していない環境

- iPhone の Safari のタブ（ホーム画面に追加していない）
- 通知を「ブロック」にしたブラウザ（設定から許可し直す必要がある）

その場合は設定画面に理由を表示する。バッジ（30 秒ごとの再取得）はこれまでどおり動く。

## 実装の場所

- API: `GET /push/vapid-public-key`、`PUT /push/subscriptions`、`DELETE /push/subscriptions`
- `app/services/push.py`、`app/repositories/push.py`、`supabase/migrations/20260910020000_push_subscriptions.sql`
- `tetote/src/features/push/`、`tetote/src/features/settings/client.ts`、`tetote/public/sw.js`
- テスト: `tests/test_push.py`、`tetote/src/features/push/client.test.ts`

## 次の段階

- ネイティブアプリ（App Store）向けの APNs / FCM。`app/services/push.py` の送信口を差し替えて対応する。
- 「完了の確認をお願いします」「明日の約束のリマインド」など、時間で送る通知（定期処理が必要）。
