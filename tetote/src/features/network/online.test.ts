import { describe, expect, it, vi } from "vitest";

import { isOnline, serverSnapshot, subscribeOnline } from "./online";

describe("オンライン状態の購読", () => {
  it("navigator.onLine をそのまま返し、無い環境ではオンライン扱い", () => {
    expect(isOnline({ onLine: false })).toBe(false);
    expect(isOnline({ onLine: true })).toBe(true);
    expect(isOnline({})).toBe(true);
    expect(isOnline(undefined)).toBe(true);
    expect(serverSnapshot()).toBe(true);
  });

  it("online / offline イベントで通知し、解除できる", () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const unsubscribe = subscribeOnline(listener, target);
    target.dispatchEvent(new Event("offline"));
    target.dispatchEvent(new Event("online"));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    target.dispatchEvent(new Event("offline"));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("イベントの届け先が無い環境では何もしない", () => {
    const unsubscribe = subscribeOnline(() => undefined, undefined);
    expect(() => unsubscribe()).not.toThrow();
  });
});
