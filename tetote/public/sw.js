/* fitt0 service worker
 *
 * 目的: ホーム画面に追加したとき、電波が弱くてもアプリの「殻」がすぐ開くようにする。
 * - ハッシュ付きの静的ファイル（/_expo/static/*, /assets/*, /icons/*）はキャッシュ優先。
 *   ファイル名にハッシュが入っているので、古いものが混ざる心配がない。
 * - 画面の遷移（HTML）はネットワーク優先。失敗したときだけ最後に開けたトップページを出す。
 * - API（別オリジン）や POST などはいっさい触らない。個人情報をキャッシュしない。
 */
const VERSION = "fitt0-sw-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const SHELL_URLS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_expo/static/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API など別オリジンは触らない

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname === "/") {
            caches.open(SHELL_CACHE).then((cache) => cache.put("/", response.clone()));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(request)) || (await cache.match("/")) || Response.error();
        }),
    );
  }
});
