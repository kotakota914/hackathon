import { describe, expect, it } from "vitest";

import { RESET_MAIL_SENT_MESSAGE, validateEmail, validateNewPassword } from "./password-reset";

describe("パスワード再設定の入力確認", () => {
  it("メールアドレスは空と形式違いを弾く", () => {
    expect(validateEmail("")).toContain("入力");
    expect(validateEmail("abc")).toContain("形式");
    expect(validateEmail(" a@b.jp ")).toBeNull();
  });

  it("新しいパスワードは 8 文字以上で、2 回が一致すること", () => {
    expect(validateNewPassword("short", "short")).toContain("8文字");
    expect(validateNewPassword("longenough1", "different1")).toContain("一致");
    expect(validateNewPassword("longenough1", "longenough1")).toBeNull();
  });

  it("送信後の案内は、登録の有無を答えない", () => {
    expect(RESET_MAIL_SENT_MESSAGE).not.toContain("登録されていません");
    expect(RESET_MAIL_SENT_MESSAGE).toContain("迷惑メール");
  });
});
