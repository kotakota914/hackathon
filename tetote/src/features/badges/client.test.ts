import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../../api/client";
import { BADGE_POLL_INTERVAL_MS, EMPTY_BADGES, badgeLabel, getBadges } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("バッジ集計", () => {
  it("GET /me/badges の結果をそのまま返す", async () => {
    const summary = { pendingApplicants: 2, activeMatches: 1, unreadMessages: 5 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(summary));
    const client = new ApiClient({ baseUrl: "http://api.test", fetch: fetchMock });

    await expect(getBadges(client)).resolves.toEqual(summary);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/me/badges");
    expect(options.method).toBe("GET");
  });

  it("初期値はすべて0で、取り直し間隔はチャットより緩い", () => {
    expect(EMPTY_BADGES).toEqual({ pendingApplicants: 0, activeMatches: 0, unreadMessages: 0 });
    expect(BADGE_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
  });

  it("バッジの文字は 0 で消え、100 以上は 99+", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(-1)).toBeNull();
    expect(badgeLabel(Number.NaN)).toBeNull();
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(99)).toBe("99");
    expect(badgeLabel(100)).toBe("99+");
  });
});
