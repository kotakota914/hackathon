import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../../api/client";
import { getPublicProfile, memberSinceLabel, minutesLabel } from "./client";

describe("公開プロフィール", () => {
  it("GET /users/{id}/public-profile を呼ぶ（ID は URL 用に変換）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ userId: "u/1" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const client = new ApiClient({ baseUrl: "http://api.test", fetch: fetchMock });
    await getPublicProfile("u/1", client);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/users/u%2F1/public-profile");
  });

  it("参加月と合計時間を読みやすくする", () => {
    expect(memberSinceLabel("2026-09")).toBe("2026年9月から");
    expect(memberSinceLabel(null)).toBe("");
    expect(minutesLabel(0)).toBe("0分");
    expect(minutesLabel(45)).toBe("45分");
    expect(minutesLabel(60)).toBe("1時間");
    expect(minutesLabel(90)).toBe("1時間30分");
  });
});
