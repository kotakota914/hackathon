import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../../api/client";
import {
  completionRate,
  formatCount,
  getMunicipalityOverview,
  overviewToCsv,
  rangeForDays,
  type MunicipalityOverview,
} from "./client";

const OVERVIEW: MunicipalityOverview = {
  fromDate: "2026-06-01T00:00:00.000Z",
  toDate: "2026-09-01T00:00:00.000Z",
  minCellSize: 5,
  totals: {
    requestsCreated: 20,
    requestsCompleted: 15,
    requestsCancelled: 2,
    matchesFormed: 16,
    matchesCompleted: 14,
    activeHelpers: 9,
    avgEstimatedMinutes: 35,
  },
  byArea: [
    { key: "AREA-001", label: "大学周辺", requests: 14, completed: 11 },
    { key: "AREA-002", label: "大学北側", requests: null, completed: null },
  ],
  byCategory: [{ key: "cleaning", label: "掃除・日常生活", requests: 8, completed: 6 }],
};

describe("自治体ダッシュボードの集計", () => {
  it("期間を絞って GET /admin/municipality-overview を呼ぶ", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(OVERVIEW), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const client = new ApiClient({ baseUrl: "http://api.test", fetch: fetchMock });
    await getMunicipalityOverview({ from: "2026-06-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" }, client);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/admin/municipality-overview?");
    expect(url).toContain("from=2026-06-01");
    expect(url).toContain("to=2026-09-01");
  });

  it("伏せた件数は「-」、完了率は依頼数があるときだけ百分率にする", () => {
    expect(formatCount(14)).toBe("14");
    expect(formatCount(null)).toBe("-");
    expect(completionRate(14, 11)).toBe("79%");
    expect(completionRate(null, 11)).toBe("-");
    expect(completionRate(0, 0)).toBe("-");
  });

  it("直近N日の範囲は from < to になる", () => {
    const now = new Date("2026-09-10T00:00:00.000Z");
    const range = rangeForDays(30, now);
    expect(range.to).toBe("2026-09-10T00:00:00.000Z");
    expect(new Date(range.from!).getTime()).toBeLessThan(new Date(range.to!).getTime());
  });

  it("CSV は BOM 付きで、伏せた値は空欄にする", () => {
    const csv = overviewToCsv(OVERVIEW);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("大学周辺,AREA-001,14,11,79%");
    // AREA-002 は伏せられているので件数は空欄。
    expect(csv).toContain("大学北側,AREA-002,,,-");
    expect(csv).toContain("掃除・日常生活,cleaning,8,6,75%");
  });
});
