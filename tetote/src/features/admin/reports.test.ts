import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../../api/client";
import { listReports, reasonLabel, resolveReport, setUserSuspended } from "./reports";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("通報の確認（管理者）", () => {
  it("一覧は status で絞り、対応と停止は POST で送る", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "r1", status: "resolved" }))
      .mockResolvedValueOnce(jsonResponse({ userId: "u/1", status: "suspended" }));
    const client = new ApiClient({ baseUrl: "http://api.test", fetch: fetchMock });
    await listReports("open", client);
    await resolveReport("r1", "resolved", client);
    await setUserSuspended("u/1", true, client);
    const [listUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [resolveUrl, resolveInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const [suspendUrl, suspendInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(listUrl).toBe("http://api.test/admin/reports?status=open");
    expect(resolveUrl).toBe("http://api.test/admin/reports/r1/resolve");
    expect(resolveInit.body).toBe(JSON.stringify({ status: "resolved" }));
    expect(suspendUrl).toBe("http://api.test/admin/users/u%2F1/suspend");
    expect(suspendInit.body).toBe(JSON.stringify({ suspended: true }));
  });

  it("理由は日本語に、未知の理由はそのまま", () => {
    expect(reasonLabel("fraud")).toBe("詐欺の疑い");
    expect(reasonLabel("something_new")).toBe("something_new");
  });
});
