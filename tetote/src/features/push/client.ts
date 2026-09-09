import { apiClient, type ApiClient } from "../../api/client";
import { ApiError } from "../../api/errors";

/**
 * Web Push の購読（ブラウザに通知の宛先を作り、サーバーへ登録する）。
 * - ブラウザが対応していない・鍵が無い環境では何もしない（エラーにしない）。
 * - 許可を求めるのは利用者が「通知」をオンにしたときだけ。勝手に出さない。
 */
export type PushSupport = "supported" | "unsupported" | "denied";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "supported";
}

/** VAPID 公開鍵（base64url）を PushManager が受け取る形に変える。 */
export function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * 有効な service worker 登録を取る。無ければ null。
 * `navigator.serviceWorker.ready` は登録が無いと永遠に待つので使わない。
 */
async function activeRegistration(timeoutMs = 3000): Promise<ServiceWorkerRegistration | null> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return null;
    if (registration.active) return registration;
    return await new Promise<ServiceWorkerRegistration | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      navigator.serviceWorker.ready.then(
        (ready) => {
          clearTimeout(timer);
          resolve(ready);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
      );
    });
  } catch {
    return null;
  }
}

export async function getVapidPublicKey(client: ApiClient = apiClient): Promise<string | null> {
  try {
    const { publicKey } = await client.get<{ publicKey: string }>("/push/vapid-public-key");
    return publicKey;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null; // PUSH_DISABLED
    throw error;
  }
}

export function registerSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  client: ApiClient = apiClient,
): Promise<void> {
  return client.put<void>("/push/subscriptions", subscription);
}

export function unregisterSubscription(endpoint: string, client: ApiClient = apiClient): Promise<void> {
  return client.delete<void>("/push/subscriptions", { body: { endpoint } });
}

/** PushSubscription を API の形にする。鍵が取れない環境では null。 */
export function toSubscriptionInput(
  subscription: PushSubscriptionJSON,
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (!subscription.endpoint || !p256dh || !auth) return null;
  return { endpoint: subscription.endpoint, keys: { p256dh, auth } };
}

export type SubscribeOutcome = "subscribed" | "unsupported" | "disabled" | "denied" | "failed";

/**
 * 通知をオンにする。許可 → 購読 → サーバー登録。
 * 戻り値で画面に理由を出せるようにする。
 */
export async function subscribeToPush(client: ApiClient = apiClient): Promise<SubscribeOutcome> {
  if (pushSupport() !== "supported") return pushSupport() === "denied" ? "denied" : "unsupported";
  const publicKey = await getVapidPublicKey(client);
  if (!publicKey) return "disabled";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const registration = await activeRegistration();
    if (!registration) return "unsupported";
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));
    const input = toSubscriptionInput(subscription.toJSON());
    if (!input) return "failed";
    await registerSubscription(input, client);
    return "subscribed";
  } catch {
    return "failed";
  }
}

/** 通知をオフにする。ブラウザ側の購読も解除し、サーバーの宛先も消す。 */
export async function unsubscribeFromPush(client: ApiClient = apiClient): Promise<void> {
  if (pushSupport() === "unsupported") return;
  try {
    const registration = await activeRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await unregisterSubscription(subscription.endpoint, client).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    /* 解除に失敗しても画面は止めない。サーバー側は失効時に自動で消える。 */
  }
}

/**
 * 起動時の同期。すでに許可済みで購読が残っていれば、サーバーに宛先を登録し直す
 * （ブラウザが購読を更新することがあるため）。許可を新たに求めることはしない。
 */
export async function syncPushSubscription(client: ApiClient = apiClient): Promise<void> {
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return;
  try {
    const registration = await activeRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const input = toSubscriptionInput(subscription.toJSON());
    if (input) await registerSubscription(input, client);
  } catch {
    /* 補助機能なので黙って諦める */
  }
}

export const PUSH_OUTCOME_MESSAGES: Record<SubscribeOutcome, string> = {
  subscribed: "通知をオンにしました。応募やメッセージが届くとお知らせします。",
  unsupported: "このブラウザは通知に対応していません。ホーム画面に追加したアプリから開くと使える場合があります。",
  disabled: "この環境では通知を利用できません。",
  denied: "通知が許可されていません。ブラウザの設定から許可してください。",
  failed: "通知の設定に失敗しました。もう一度お試しください。",
};
