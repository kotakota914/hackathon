# 運用手順（管理者向け）

日々の運用で使う操作をまとめる。画面の操作はすべて「管理者」アカウントで行う。

## 管理者になる

Vercel（fitt0-api）の環境変数 `ADMIN_AUTH_SUBJECTS` に自分の SuperTokens ユーザー ID を入れて Redeploy し、
アプリでログインし直す。設定の一番上に「自治体ダッシュボード（管理者）」が出れば成功。
複数人はカンマ区切り。詳細は [municipality-dashboard.md](municipality-dashboard.md)。

## 通報を確認する

1. 設定 → 自治体ダッシュボード → 「通報の確認」
2. 「未対応」の通報を読む。理由・対象・本文が出る
3. 対応したら「対応済みにする」、問題が無ければ「問題なし」
4. 対象が利用者で悪質なら「利用停止」。停止中はログインしても何もできない。誤りなら「停止を解除」

詐欺・危険作業の通報は、通報された依頼が自動で非公開（suspended）になる。

## 本番が動いているか確かめる

主要な流れ（登録 → 依頼 → 応募 → お知らせ → 選出 → トーク → 完了 → 評価 → 退会）を
使い捨ての利用者 2 人で通しで試すスクリプトがある。数十秒で終わり、最後に両方とも退会させる。

```powershell
.venv\Scripts\python.exe scripts\smoke_production.py
```

`OK: すべて通過` と出れば正常。`FAIL` の行が出たら、その API の応答を見て原因を探す。
デプロイ直後や設定変更後に流すとよい。

## 定期処理（期限切れの確定）

毎日 3:00（日本時間）に Vercel Cron が `GET /jobs/expire-requests` を呼び、予定日 + 24 時間を
過ぎた依頼を「期限切れ」にする。Vercel → fitt0-api → Settings → Cron Jobs で実行履歴を見られる。
手で流す場合は `CRON_SECRET` を Bearer に付けて呼ぶ（[request-expiry.md](request-expiry.md)）。

## 利用者からの問い合わせ

- パスワードを忘れた → ログイン画面の「パスワードをお忘れですか？」を案内する
- 退会したい → 設定 → アカウントを削除。進行中の支援があると断られるので、先に完了か取消
- 通知が来ない → 設定の「通知」がオンか、iPhone はホーム画面に追加したアイコンから開いているか

## データベースの変更（migration）

コードを更新して `supabase/migrations/` に新しいファイルが増えたら、所有者の接続文字列で当てる。

```powershell
$env:DATABASE_URL = "postgresql://postgres.<project-ref>:<所有者パスワード>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
.venv\Scripts\python.exe scripts\apply_migrations.py --check
.venv\Scripts\python.exe scripts\apply_migrations.py
```

## 公開前に必ず直すもの

- `tetote/src/features/legal/content.ts` の運営者名・連絡先・施行日（利用規約とプライバシーポリシーは「案」）
- 本人確認メール（Cloudflare Email）の設定。未設定のあいだは「準備中」と表示される
- プロフィール画像の保存先（Supabase Storage）。未設定のあいだは「準備中」と表示される
