/**
 * 通信できるかどうか（オンライン/オフライン）の購読。
 * ブラウザの navigator.onLine と online/offline イベントをそのまま使う。
 * React からは useSyncExternalStore で読む（描画中に外部の値を読む正しい方法）。
 * ブラウザの無い環境（テスト・サーバー側の描画）では常にオンライン扱い。
 */

export type OnlineListener = () => void;

type NavigatorLike = { onLine?: boolean } | undefined;
type EventTargetLike =
  | { addEventListener: (type: string, listener: () => void) => void; removeEventListener: (type: string, listener: () => void) => void }
  | undefined;

function defaultNavigator(): NavigatorLike {
  return typeof navigator === "undefined" ? undefined : navigator;
}

function defaultTarget(): EventTargetLike {
  return typeof window === "undefined" ? undefined : window;
}

export function isOnline(nav: NavigatorLike = defaultNavigator()): boolean {
  if (!nav || typeof nav.onLine !== "boolean") return true;
  return nav.onLine;
}

/** サーバー側の描画（静的出力）では常にオンライン扱いにして、初回表示を揃える。 */
export function serverSnapshot(): boolean {
  return true;
}

export function subscribeOnline(listener: OnlineListener, target: EventTargetLike = defaultTarget()): () => void {
  if (!target) return () => undefined;
  target.addEventListener("online", listener);
  target.addEventListener("offline", listener);
  return () => {
    target.removeEventListener("online", listener);
    target.removeEventListener("offline", listener);
  };
}

export const OFFLINE_MESSAGE = "通信できません。電波の届く場所で、もう一度お試しください。";
