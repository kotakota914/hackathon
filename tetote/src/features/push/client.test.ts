import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../../api/client";
import {
  getVapidPublicKey,
  registerSubscription,
  toSubscriptionInput,
  unregisterSubscription,
  urlBase64ToUint8Array,
} from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Web Push クライアント", () => {
  it("base64url の公開鍵をバイト列にする（パディング・記号の置換）", () => {
    // "hello" を base64url にした "aGVsbG8" （パディング無し）
    const bytes = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
    // '-' と '_' は '+' と '/' に戻す
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });

  it("公開鍵の取得は 404（鍵未設定）を null にし、それ以外は投げる", async () => {
    const disabled = new ApiClient({
      baseUrl: "http://api.test",
      fetch: vi.fn().mockResolvedValue(jsonResponse({ error: { code: "PUSH_DISABLED", message: "x" } }, 404)),
    });
    await expect(getVapidPublicKey(disabled)).resolves.toBeNull();

    const enabled = new ApiClient({
      baseUrl: "http://api.test",
      fetch: vi.fn().mockResolvedValue(jsonResponse({ publicKey: "BPub" })),
    });
    await expect(getVapidPublicKey(enabled)).resolves.toBe("BPub");

    const broken = new ApiClient({
      baseUrl: "http://api.test",
      fetch: vi.fn().mockResolvedValue(jsonResponse({ error: { code: "INTERNAL_SERVER_ERROR", message: "x" } }, 500)),
    });
    await expect(getVapidPublicKey(broken)).rejects.toBeTruthy();
  });

  it("購読の登録は PUT、解除は DELETE で endpoint を送る", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new ApiClient({ baseUrl: "http://api.test", fetch: fetchMock });
    await registerSubscription({ endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" } }, client);
    await unregisterSubscription("https://push.example/a", client);
    const [putUrl, putInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [delUrl, delInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(putUrl).toBe("http://api.test/push/subscriptions");
    expect(putInit.method).toBe("PUT");
    expect(JSON.parse(String(putInit.body))).toEqual({
      endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" },
    });
    expect(delUrl).toBe("http://api.test/push/subscriptions");
    expect(delInit.method).toBe("DELETE");
    expect(JSON.parse(String(delInit.body))).toEqual({ endpoint: "https://push.example/a" });
  });

  it("鍵が欠けた購読は API に送らない", () => {
    expect(toSubscriptionInput({ endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" } })).toEqual({
      endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" },
    });
    expect(toSubscriptionInput({ endpoint: "https://push.example/a", keys: { p256dh: "p" } })).toBeNull();
    expect(toSubscriptionInput({})).toBeNull();
  });
});
