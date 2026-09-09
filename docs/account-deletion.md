# アカウント削除（退会）

利用者が自分でアプリ内からアカウントを削除できるようにする。
App Store / Google Play の審査では「アプリ内からアカウントを削除できること」が条件のため、
この文書がそのまま説明資料になる。上流 Issue #82 に対応する。

## 利用者から見た動き

1. 設定 → 「アカウントを削除」 → 確認ダイアログ → 「アカウントを削除」
2. サーバーで退会処理が完了（204）してから、端末側のログイン状態を捨ててログイン画面へ戻る
3. 失敗したときはダイアログ内に理由を出し、データもログイン状態もそのまま残す

| 状況 | 結果 |
|---|---|
| 進行中の支援がある（マッチが `matched` / `in_progress` / `completion_pending`） | 409 `ACCOUNT_HAS_ACTIVE_MATCH`。「支援を完了するか取消してから」と案内 |
| 募集中の依頼がある | 依頼を `cancelled` にし、来ていた未処理の応募も `cancelled` にして退会 |
| 自分の未処理の応募がある | 応募を `withdrawn` にして退会 |
| 完了済み・取消済みのものしかない | そのまま退会 |
| 二回押した | 二回目も 204（何もしない） |

退会後は同じメールアドレスで新規登録できる。認証側の利用者を削除するため、
以前のデータと結びつくことはない。

## API

`DELETE /account`（認証必須、本文なし、成功は 204）

処理の順番。**アプリ側のデータを先に、認証側を後に** 消す。逆にすると、途中で失敗したとき
本人がログインできず再試行できなくなる。

1. セッションを検証し、本人を特定する
2. 進行中のマッチがあれば 409 で止める
3. DB 関数 `app.delete_own_account()` を 1 トランザクションで実行（下記）
4. SuperTokens の全セッションを失効させ、利用者を削除する（`app/auth.py` の `delete_auth_user`）
5. 204

4 が失敗した場合、利用者はまだログインできる。次回ログイン時にアプリ側では新しい空の
プロフィールが作られ、もう一度「アカウントを削除」を押せば 3〜4 がやり直される。

## データの扱い（何を消し、何を残すか）

`users` の行は **物理削除しない**。依頼・応募・マッチ・メッセージ・レビュー・通報が
`on delete restrict` で参照しており、消すと相手側のトーク履歴やレビューまで消えるため。
代わりに「個人が特定できる情報」を消して匿名化する。

| 対象 | 扱い |
|---|---|
| 表示名 | 「退会したユーザー」に置き換え |
| 地域・生年・自己紹介・大学/勤務先などのプロフィール項目 | すべて null |
| メール確認・本人確認の状態 | `email_verified=false`, `verification_status=unverified` |
| ログイン ID との紐づけ（`auth_subject`） | `deleted:<id>` に置き換えて切る |
| `status` | `deleted`。これで `app.is_active_actor()` が偽になり、全テーブルへのアクセスが閉じる |
| 設定、実績プロフィール、大学メール認証、保存した依頼、非表示にした依頼、自分が行ったブロック | 削除 |
| 本人確認申請 | 行は残し `deleted_at` を記録。書類の実体（ストレージ）は `deletion_due_at` に従って別途掃除する（未実装） |
| 依頼・応募・マッチ・メッセージ・レビュー・通報 | 残す（表示名は「退会したユーザー」になる） |
| 監査ログ | `account.deleted` を 1 件記録。個人情報は含めず、取消した依頼数と取下げた応募数だけ |

## 実装の場所

- DB: `supabase/migrations/20260909000000_account_deletion.sql`（`app.delete_own_account()`、security definer）
- API: `app/cruds/main.py` の `delete_account`、`app/repositories/accounts.py`（Memory / Postgres）
- 認証: `app/auth.py` の `delete_auth_user`
- フロント: `tetote/src/features/account/client.ts`、`tetote/src/shared/SettingsScreen.tsx`
- テスト: `tests/test_account_deletion.py`、`tetote/src/features/account/client.test.ts`

## 今後

- 本人確認書類のストレージ実体の削除ジョブ
- プロフィール画像（アップロード）の実体削除
- 退会理由のアンケート（任意）
