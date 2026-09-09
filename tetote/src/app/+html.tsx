import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Web の静的出力で使う HTML の枠。PWA（ホーム画面に追加・オフラインの殻）に必要な
 * manifest、テーマ色、iOS 用アイコン、service worker の登録をここで入れる。
 * ネイティブアプリでは使われない。
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <title>fitt0</title>
        <meta name="description" content="小さな「助けて」と「手伝いたい」を、もっと近くに。" />
        <meta name="theme-color" content="#245C2D" />
        <meta name="application-name" content="fitt0" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="fitt0" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        {/* service worker は本番相当の https か localhost でだけ有効になる（ブラウザの仕様） */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
