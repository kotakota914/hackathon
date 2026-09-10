import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../../api/client";
import { getNotifications, iconForKind, markNotificationsRead, relativeTime, urlForSide } from "./client";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("お知らせ", () => {
  it("一覧を取得し、既読は ids 省略で全部", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [], unreadCount: 0 }))
      .mockResolvedValueOnce(jsonResponse({ marked: 2 }))
      .mockResolvedValueOnce(jsonResponse({ marked: 1 }));
    const client = new ApiClient({ baseUrl: "http://api.test", fetch: fetchMock });
    await getNotifications(client);
    await markNotificationsRead(null, client);
    await markNotificationsRead(["a"], client);
    const [listUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, allInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const [, someInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(listUrl).toBe("http://api.test/me/notifications");
    expect(allInit.body).toBe("{}");
    expect(someInit.body).toBe(JSON.stringify({ ids: ["a"] }));
  });

  it("種類ごとのアイコンと相対時間", () => {
    expect(iconForKind("application")).toBe("person-add");
    expect(iconForKind("selected")).toBe("checkmark-circle");
    expect(iconForKind("message")).toBe("chatbubble-ellipses");
    expect(iconForKind("other")).toBe("notifications");
    const now = new Date("2026-09-10T12:00:00+09:00");
    expect(relativeTime("2026-09-10T11:59:40+09:00", now)).toBe("たった今");
    expect(relativeTime("2026-09-10T11:30:00+09:00", now)).toBe("30分前");
    expect(relativeTime("2026-09-10T09:00:00+09:00", now)).toBe("3時間前");
    expect(relativeTime("2026-09-09T09:00:00+09:00", now)).toBe("昨日");
    expect(relativeTime("2026-09-01T09:00:00+09:00", now)).toBe("9/1");
  });

  it("開いている側に合わせて URL を置き換える", () => {
    expect(urlForSide("/help/chat?matchId=1", "helper")).toBe("/helper/chat?matchId=1");
    expect(urlForSide("/helper/chats", "help")).toBe("/help/chats");
    // 依頼者側にしか無い画面はそのまま
    expect(urlForSide("/help/requests", "helper")).toBe("/help/requests");
    expect(urlForSide("/help/requests", "help")).toBe("/help/requests");
  });
});
