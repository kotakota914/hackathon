import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "../../api/client";
import { ApiError, ApiNetworkError } from "../../api/errors";
import {
  ACTIVE_MATCH_MESSAGE,
  GENERIC_MESSAGE,
  NETWORK_MESSAGE,
  accountDeletionMessage,
  deleteAccount,
} from "./client";

describe("アカウント削除", () => {
  it("DELETE /account を呼び、204 なら何も返さない", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new ApiClient({ baseUrl: "http://api.test", fetch: fetchMock });

    await expect(deleteAccount(client)).resolves.toBeUndefined();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/account");
    expect(options.method).toBe("DELETE");
  });

  it("進行中の支援がある 409 は、その理由を利用者向けに伝える", () => {
    const error = new ApiError({
      status: 409,
      code: "ACCOUNT_HAS_ACTIVE_MATCH",
      message: "進行中の支援があります",
    });
    expect(accountDeletionMessage(error)).toBe(ACTIVE_MATCH_MESSAGE);
  });

  it("通信失敗と、それ以外の失敗は別の文章にする", () => {
    expect(accountDeletionMessage(new ApiNetworkError())).toBe(NETWORK_MESSAGE);
    expect(
      accountDeletionMessage(
        new ApiError({ status: 500, code: "INTERNAL_SERVER_ERROR", message: "x" }),
      ),
    ).toBe(GENERIC_MESSAGE);
    expect(accountDeletionMessage(new Error("unknown"))).toBe(GENERIC_MESSAGE);
  });
});
