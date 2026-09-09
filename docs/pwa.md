# PWA 対応（ホーム画面に追加・オフラインの殻）

Web 版をスマホの「ホーム画面に追加」でアプリのように開けるようにし、
電波が弱い場所でも画面の殻だけは即座に開くようにする。
プッシュ通知（Web Push）の土台にもなる。

## 入っているもの

| ファイル | 役割 |
|---|---|
| `tetote/public/manifest.webmanifest` | アプリ名・アイコン・テーマ色・`display: standalone`（ブラウザの枠なしで開く） |
| `tetote/public/icons/*` | 192 / 512 / maskable / apple-touch-icon。`assets/images/icon.png` から生成 |
| `tetote/public/sw.js` | service worker。ハッシュ付き静的ファイルはキャッシュ優先、画面遷移はネットワーク優先で失敗時だけトップの殻を返す。API・POST・別オリジンには触れず、個人情報をキャッシュしない |
| `tetote/src/app/+html.tsx` | 静的出力の HTML 枠。manifest・theme-color・iOS 用メタ・service worker 登録を入れる |
| `tetote/vercel.json` | `sw.js` を no-cache（更新がすぐ届く）、manifest の Content-Type |

`public/` の中身は `expo export` で `dist/` 直下にそのままコピーされる。

## 使い方（利用者向けの案内文）

- **iPhone（Safari）**: 共有ボタン → 「ホーム画面に追加」
- **Android（Chrome）**: 右上のメニュー → 「ホーム画面に追加」または「アプリをインストール」

追加後はアイコンから開くと、ブラウザの枠なしでアプリのように起動する。

## 確認方法

1. `https://fitt0-app.vercel.app` を Chrome で開き、DevTools → Application → Manifest にエラーが無い
2. Application → Service Workers に `sw.js` が activated で出る
3. Network を Offline にしてトップを開き直しても、画面の殻が出る（ログインや一覧は通信が要る）

開発用の同一オリジン proxy（HTTP/1.1 の簡易サーバー）では service worker の登録が
安定しないため、最終確認は本番 URL で行う。

## 更新の仕組み

`sw.js` の `VERSION` を上げると、古いキャッシュは次回起動時に削除される。
ビルドごとにファイル名のハッシュが変わるので、静的ファイルの取り違えは起きない。

## 次の段階

- Web Push（VAPID 鍵、購読 API、応募・選出・メッセージ時の送信）
- オフライン時の案内表示（「通信できません」の一言）
