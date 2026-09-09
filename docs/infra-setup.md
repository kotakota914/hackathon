# 自前インフラの構築手順（Supabase / SuperTokens / Vercel）

ハッカソン後に個人で運用するための構成。チームの配信先に依存せず、
自分のアカウントだけで「コードを更新 → 公開」ができる状態を作る。

秘密の値（DB パスワード、API キー、接続文字列）は **このリポジトリにもチャットにも書かない**。
Vercel の Environment Variables と PowerShell の環境変数にだけ入れる。

## 全体像

```
ブラウザ ── https://fitt0-app.vercel.app（Expo Web / Vercel）
              │  EXPO_PUBLIC_API_URL
              ▼
          https://fitt0-api.vercel.app（FastAPI / Vercel Serverless）
              │ DATABASE_URL（tetote_app ロール）      │ SUPERTOKENS_CONNECTION_URI
              ▼                                        ▼
          Supabase Postgres（RLS 有効）        SuperTokens Managed Service
```

## 1. Supabase（データベース）

1. https://supabase.com で新しい project を作る（リージョンは Tokyo）。
   ここで決める **DB パスワードは所有者（postgres ユーザー）用**。ランダムな長い文字列にする。
2. Project Settings → Database → Connection string から「Session pooler」の URI を控える。
3. PowerShell で所有者として migration を当てる。

   ```powershell
   $env:DATABASE_URL = "postgresql://postgres.<project-ref>:<所有者パスワード>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
   .venv\Scripts\python.exe scripts\apply_migrations.py --check   # 状態を見るだけ
   .venv\Scripts\python.exe scripts\apply_migrations.py           # 未適用分を適用
   ```

   `supabase/migrations/*.sql` をファイル名順に 1 ファイル 1 トランザクションで当て、
   適用済みを `public.schema_migrations` に記録する。同じファイルは二度当てない。
4. アプリが接続するロール `tetote_app` にパスワードを付ける（16 文字以上、ランダム）。

   ```powershell
   $env:TETOTE_APP_PASSWORD = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
   $env:TETOTE_APP_PASSWORD   # 表示して控える（Vercel に入れる）
   .venv\Scripts\python.exe scripts\apply_migrations.py --set-app-password
   ```

5. Vercel に入れる `DATABASE_URL` は **tetote_app** で作る（所有者ではない）。
   RLS（行レベルセキュリティ）を必ず通すため。pooler 経由のユーザー名は `tetote_app.<project-ref>`。

   ```
   postgresql://tetote_app.<project-ref>:<tetote_appのパスワード>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
   ```

## 2. SuperTokens Managed Service（認証）

1. https://supertokens.com/dashboard-saas でアプリ（core）を作る。リージョンは最寄り（Singapore）。
2. core の画面にある **Connection URI**（`https://….aws.supertokens.io:3568`）と **API Key** を控える。
   API Key が無ければ「Create new key」で作る。

## 3. Vercel（API）

1. Add New → Project → `kotakota914/hackathon` を Import。
2. Project Name `fitt0-api`、Framework Preset FastAPI、Root Directory `./`。
3. Environment Variables は次の 10 個だけ。検出された Claude 系・Cloudflare 系の空の変数は削除する。

   | Key | Value |
   |---|---|
   | `APP_ENV` | `production` |
   | `REQUEST_REPOSITORY` | `postgres` |
   | `DATABASE_URL` | 1-5 で作った tetote_app の接続文字列 |
   | `VERIFICATION_CODE_SECRET` | ランダム 32 文字 |
   | `SUPERTOKENS_ENABLED` | `true` |
   | `SUPERTOKENS_CONNECTION_URI` | 2 で控えた URI |
   | `SUPERTOKENS_API_KEY` | 2 で控えたキー |
   | `API_DOMAIN` | `https://fitt0-api.vercel.app` |
   | `WEBSITE_DOMAIN` | `https://fitt0-app.vercel.app` |
   | `AUTH_COOKIE_SAME_SITE` | `none` |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | プッシュ通知の鍵（docs/push-notifications.md の手順で生成。任意） |
   | `VAPID_SUBJECT` | `mailto:自分のメールアドレス`（任意） |
   | `ADMIN_AUTH_SUBJECTS` | 管理者にしたい自分の SuperTokens ユーザーID（任意。あとから追加してもよい） |

4. Deploy 後、Settings → Domains に `fitt0-api.vercel.app` を追加する。
   新規プロジェクトの既定 URL は `fitt0-api-<team>.vercel.app` になり、
   Deployment Protection のログイン画面に飛ばされてアプリから使えないため。
5. 確認: `https://fitt0-api.vercel.app/health` が `{"status":"ok"}` を返す。

## 4. Vercel（フロント）

1. 同じリポジトリでもう 1 つ Project を作る。Project Name `fitt0-app`、**Root Directory `tetote`**。
   ビルド方法は `tetote/vercel.json`（`npx expo export --platform web`、出力 `dist`）が使われる。
2. Environment Variables は `EXPO_PUBLIC_API_URL=https://fitt0-api.vercel.app` の 1 つ。
3. Deploy 後、Domains に `fitt0-app.vercel.app` を追加する。

## 5. 動作確認

- `https://fitt0-app.vercel.app` でログイン画面が出る。
- 新規登録 → ホームが表示される（SuperTokens と DB の両方が動いている証拠）。
- API 側は `/docs` で一覧を見られる。認証なしのデータ取得は 401 で弾かれるのが正しい。

## つまずきやすい点

- `DATABASE_URL` の `[YOUR-PASSWORD]` をそのまま残すと IPv6 の解析エラーになる。必ず置き換える。
- 自分の普段使いのパスワードを DB に使わない。漏れたときの被害が広がる。
- Windows の Git Bash から日本語を含む JSON を `curl -d` で送ると文字化けして 400 になる。
  UTF-8 でファイルに書き `--data-binary @file` で送る。
- `API_DOMAIN` と実際の URL が食い違うと認証が崩れる。プロジェクト名を変えたら Domains も揃える。
