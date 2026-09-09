# 自治体ダッシュボード

自治体の担当者が、地域の助け合いの状況を数字で見るための画面。
「行政と協力する」ための根拠資料をアプリ自身が出せるようにする。

## 方針

- **個人情報は一切出さない。** 件数・割合・平均だけ。氏名・本文・座標・ID は返さない。
- **少人数の区分は伏せる。** 件数が `minCellSize`（5）未満の地域・カテゴリは `null`（画面では「-」）。
  小さな地域で「1 件」と出ると誰のことか推測できてしまうため。
- **集計は DB 側の関数で行い、関数の入口で権限を再確認する。**
  全利用者の依頼を横断するため RLS を越える必要があるが、管理者以外が呼べば例外にする。

## 段階計画

| 段階 | 誰が見るか | 状態 |
|---|---|---|
| 1 | 運営の管理者（`role = admin`）が全地域の集計を見る | **実装済み** |
| 2 | 自治体アカウント（新ロール）が自分の地域だけを見る | 未着手 |

段階 2 で必要になるもの: `account_role` に `municipality` を追加、利用者と地域の対応表、
アカウント発行の手順、集計関数に地域の絞り込みを追加。段階 1 の集計と画面はそのまま使う。

## 見られる数字（期間指定つき、既定は直近 90 日）

| 項目 | 意味 |
|---|---|
| 依頼数 | 期間内に作成された依頼（下書き・審査中を含む） |
| 完了した依頼・完了率 | うち `completed` になった件数と割合 |
| 取消・期限切れ | `cancelled` / `rejected` / `expired` |
| 成立したマッチ | 期間内に成立したマッチ（`cancelled` は除く） |
| 支援した人数 | 期間内に支援者として成立したマッチの人数（少人数なら伏せる） |
| 平均所要時間 | 依頼の想定所要時間の平均（分） |
| 地域別・カテゴリ別 | それぞれの依頼数・完了数・完了率 |

## 使い方

1. 管理者アカウントでログインし、設定 → 「自治体ダッシュボード（管理者）」。
   直接 `/admin/dashboard` を開いてもよい（管理者以外は「この画面は管理者だけが見られます」）。
2. 期間を「直近 30 日 / 90 日 / 1 年」から選ぶ。
3. 「CSV で保存」で表計算ソフトに読み込める形で書き出せる（Web のみ）。

## 実装の場所

- API: `GET /admin/municipality-overview`（`app/cruds/main.py`）
- 集計: `app/repositories/stats.py`（Memory / Postgres）、`supabase/migrations/20260910000000_municipality_overview.sql`
- 画面: `tetote/src/app/admin/dashboard.tsx`、`tetote/src/features/dashboard/client.ts`
- テスト: `tests/test_municipality_overview.py`、`tetote/src/features/dashboard/client.test.ts`

## 管理者アカウントの作り方（本番）

現時点では管理者を作る画面が無い。Supabase の SQL エディタで対象利用者の `role` を変える。

```sql
update users set role = 'admin' where auth_subject = '<SuperTokens の user id>';
```

`auth_subject` は SuperTokens ダッシュボードの Users で確認できる。
