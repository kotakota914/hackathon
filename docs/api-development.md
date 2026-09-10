# フロントエンド向けAPI開発ガイド

APIを `.venv/bin/python -m uvicorn main:app --reload --port 8000` で起動し、
Swagger UI（`http://localhost:8000/docs`）をAPI契約として参照する。固定版は
`docs/openapi.json` で、変更後は次のコマンドによりFastAPIアプリから再生成する。

```bash
.venv/bin/python scripts/export_openapi.py
```

## 認証

業務APIはすべてSuperTokensのHttpOnly Cookieセッションを要求する。登録、ログイン、
ログアウト、パスワード再設定はSuperTokensが提供する `/auth/*` を使う。更新系では
SDKが設定する `anti-csrf` ヘッダーも必要である。`userId`、`requesterId`、
`reporterId`、ロール、送信日時をクライアントから送っても本人情報として信用されない。

単体テストではSuperTokens依存関係を差し替える。開発用の認証ヘッダーは実装しておらず、
本番でも利用できない。初期モック利用者は次のとおり（パスワードは用意されていない）。

| ID | 表示名 | 用途 |
|---|---|---|
| `usr_101` | 山田 花子 | 初期依頼者・承認済み会員 |
| `usr_207` | 田中 悠 | 初期応募者・承認済み会員 |
| `usr_208` | 佐藤 海 | 初期応募者・未確認会員 |

`MOCK_RESET_ENABLED=true` の非本番環境では、認証済みセッションから
`POST /_mock/reset` を呼ぶと全モックデータを初期化できる。既定では無効で、
本番用APIではない。

## 共通規約

- 日時はISO 8601文字列。サーバー生成日時はUTCの `Z`、入力日時はタイムゾーン必須。
- エラーは `{"error":{"code":"...","message":"...","details":{},"requestId":"trace_..."}}`。
  `requestId` は `X-Request-ID` と一致する。
- 依頼一覧の既定件数は20、最大100。公開中かつブロック関係にない依頼だけを返す。
  Repositoryでは `createdAt`、IDの降順で取得後、現在地または登録地域への近さを反映する。
- 一覧の `nextCursor` が `null` なら次ページはない。現行の依頼・メッセージ一覧は
  カーソル入力未実装のため常に `null`。
- `/api` 接頭辞あり・なしの両方を実行時に受け付ける。OpenAPIでは正規パスとして
  接頭辞なしを掲載する。

## 実装状況

### バッジ集計

`GET /me/badges` は、認証済み本人について `pendingApplicants`（募集中の自分の依頼に来て
未選択の応募）、`activeMatches`（matched / in_progress / completion_pending のマッチ）、
`unreadMessages`（相手からの未読メッセージ）を返す。ブロック関係の相手は除外する。
状態は持たず、その時点の事実だけを数える。画面は `tetote/src/features/badges/useBadges.ts`
で 30 秒ごとに取り直し、タブバーの「トーク」と依頼者ホームの「自分の依頼」に件数を出す。

### 自分の依頼一覧

`GET /requests/mine` は、認証済み本人が依頼者の依頼を **状態に関係なく** 新しい順で返す
（`limit` 既定50、最大100）。`status` を複数指定して絞り込める
（例: `?status=published&status=matched`）。不明な状態は 422 `INVALID_STATUS`。
公開一覧 `GET /requests` は published しか返さないため、依頼者が審査待ち・マッチ済み・
完了・取消済みを追う画面（`tetote/src/app/help/requests.tsx`）はこちらを使う。
Postgres 実装は RLS の `requester_id = app.current_actor()` に乗る。

### 利用者設定

`GET /settings` と `PATCH /settings` は、認証済み本人の `notificationsEnabled`、
`locationEnabled`、`fontSize`（`small`、`medium`、`large`）を取得・部分更新する。
未指定項目は維持される。`locationEnabled: false` の間、画面はブラウザ位置情報の
取得を開始しない。`notificationsEnabled` はアプリ内の通知希望であり、ブラウザや
OSの通知権限自体を付与・解除するものではない。

現在はMemory Repositoryを使用する。Postgres実装、migration、RLSはSupabase担当との
合意後に追加する。`tetote/src/shared/SettingsScreen.tsx` は初回表示時にGETを行い、
各操作をPATCHした成功レスポンスで表示状態を確定できる。

### 依頼カードの非表示

`POST /requests/{request_id}/dismiss` は認証済み本人の一覧から依頼を非表示にし、
`DELETE /requests/{request_id}/dismiss` は非表示を解除する。どちらも冪等で成功時は
204を返す。`GET /requests` は本人が非表示にした依頼だけを除外し、他利用者の一覧へ
影響しない。存在しない依頼、公開中でない依頼、ブロック関係など存在を開示できない
依頼への操作は404となる。

現在はMemory Repositoryを使用する。Postgres実装、migration、RLSはSupabase担当との
合意後に追加する。`tetote/src/context/RequestsContext.tsx` はスキップ操作の成功後に
対象を画面状態から除外し、再取得後はAPI一覧を正本として表示できる。

### 依頼の保存

`GET /saved-requests` は認証済み本人の保存依頼だけを返す。
`POST /saved-requests/{request_id}` と `DELETE /saved-requests/{request_id}` は保存・解除を
冪等に行い、成功時は204を返す。非公開、停止、取消済み、ブロック関係の依頼は一覧へ
露出しない。保存操作の対象を閲覧できない場合は404を返す。

現在はMemory Repositoryを使用する。Postgres実装、migration、RLSはSupabase担当との
合意後に追加する。`tetote/src/context/RequestsContext.tsx` はローカル保存状態の代わりに
この一覧を正本として利用できる。

依頼CRUD、応募、マッチ、チャット、完了処理、プロフィール、ブロック、通報はMemory/Postgres
Repositoryに対応する。位置解決、レビュー、AI実績、本人確認のAPI経路と
状態・認可検査は実装済みだが、これらの保存、AI生成、本人確認審査は開発用
インメモリ／モックである。SuperTokensの `/auth/*` はSDK提供であり、FastAPI生成の
OpenAPIには個別操作として現れない。管理画面、Realtime、実AI、本人確認審査、
証明画像アップロード、カーソルによる次ページ取得は未実装である。

### アカウント削除（退会）

- `DELETE /account`（認証必須、204）。本人だけが実行できる。
- 進行中のマッチがあれば 409 `ACCOUNT_HAS_ACTIVE_MATCH`。募集中の依頼は取消、未処理の応募は取下げにしたうえで、プロフィールを匿名化し、SuperTokens の利用者と全セッションを失効させる。
- `users` 行は物理削除せず匿名化して残す（依頼・会話・レビューを相手のために保つ）。詳細と「何を消し何を残すか」の表は [account-deletion.md](account-deletion.md)。
- 実装: `app/repositories/accounts.py`（Memory / Postgres）、DB 関数 `app.delete_own_account()`。

### 自治体ダッシュボード（集計）

- `GET /admin/municipality-overview?from=&to=`（管理者のみ、200）。期間内の依頼数・完了数・取消数、成立/完了マッチ数、支援した人数、平均所要時間と、地域別・カテゴリ別の内訳。
- 個人情報は含まない。人数が `minCellSize`（5）未満の区分は件数を `null` で伏せる。
- 実装: `app/repositories/stats.py`（Memory / Postgres）、DB 関数 `app.municipality_totals()` / `app.municipality_breakdown()`（security definer、内部で `app.is_admin()` を再確認）。
- 段階2（自治体ロール・地域絞り込み）の計画は [municipality-dashboard.md](municipality-dashboard.md)。

### レビュー（完了後の評価）

- `POST /matches/{match_id}/reviews`（completed なマッチの当事者、相手へ 1 件）。Memory / Postgres の Repository（`app/repositories/reviews.py`）に保存する。以前はメモリ上の辞書だけで、本番では保存されなかった。
- 公開プロフィール `GET /users/{user_id}/public-profile` の `reviewSummary` に件数と「良かった点」の件数を出す。本文と評価者は出さない。

### AI 実績プロフィールの保存

- `POST /achievements/generate`（completed なマッチの**支援者本人**）と `PATCH /achievements/visibility` は `app/repositories/achievements.py`（Memory / Postgres）に保存する。以前はメモリ上の辞書だけで、本番では消えていた。
- 1 利用者 1 件。生成し直すと承認と公開範囲はやり直し。`members` は DB では `unlisted`。`public` は本人の承認（`approved=true`）が必須。
- DB 関数: `app.upsert_own_achievement()`、`app.set_own_achievement_visibility()`（security definer、本人のみ）。

### お知らせ（アプリ内の通知履歴）

- `GET /me/notifications`（新しい順、最大 50 件、未読数つき）、`POST /me/notifications/read`（ids 省略で全部既読）。`/me/badges` に `unreadNotifications`。
- 応募が届いた／選ばれた／メッセージが届いた、の 3 つの出来事で、相手に 1 件残してからプッシュ通知を送る（`app/services/notifications.py`）。本文に相手の名前やメッセージ内容は入れない。
- Postgres: `notifications` 表（RLS で本人のみ select）、`app.add_notification()`、`app.mark_own_notifications_read()`。

### 通報の確認（管理者）

- `GET /admin/reports?status=`、`POST /admin/reports/{id}/resolve`（resolved / rejected / investigating）、`POST /admin/users/{id}/suspend`（利用停止・解除）。すべて `role = admin` のみ。
- 停止中の利用者は認証で `USER_SUSPENDED`（403）になり、何もできない。退会済みと管理者は停止できない。
- Postgres: `app.resolve_report()`、`app.set_user_suspended()`（security definer、内部で `app.is_admin()` を再確認、audit_logs に記録）。

