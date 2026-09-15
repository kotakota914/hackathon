import { describe, expect, it } from "vitest";

import { ApiError } from "../../api/errors";
import {
  buildScheduledAt,
  canCancelRequest,
  canEditRequest,
  changedFields,
  formFromRequest,
  formatDateKey,
  parseScheduledAt,
  shiftDateKey,
  todayKey,
  updateResultMessage,
  validateRequestEdit,
  type RequestEditSource,
} from "./edit";

const ORIGINAL: RequestEditSource = {
  title: "電球の交換",
  description: "脚立はあります",
  scheduledAt: "2099-01-10T10:00:00+09:00",
  estimatedMinutes: 30,
  requiredHelpers: 1,
  acceptedHelpers: 0,
};

describe("依頼の編集: 日付と時間", () => {
  it("+09:00 と Z のどちらの予定日時も日本時間の日付と時に分ける", () => {
    expect(parseScheduledAt("2099-01-10T10:00:00+09:00")).toEqual({ dateKey: "2099-01-10", hour: 10 });
    // 2099-01-10 01:00Z は日本時間 10:00
    expect(parseScheduledAt("2099-01-10T01:00:00Z")).toEqual({ dateKey: "2099-01-10", hour: 10 });
    // 日本時間で日付をまたぐ場合
    expect(parseScheduledAt("2099-01-09T22:00:00Z")).toEqual({ dateKey: "2099-01-10", hour: 7 });
  });

  it("作成画面と同じ形（+09:00、分は 00）で組み立て直す", () => {
    expect(buildScheduledAt("2099-01-10", 9)).toBe("2099-01-10T09:00:00+09:00");
  });

  it("日付キーをずらし、月末や年末をまたいでも正しい", () => {
    expect(shiftDateKey("2099-01-31", 1)).toBe("2099-02-01");
    expect(shiftDateKey("2099-12-31", 1)).toBe("2100-01-01");
    expect(shiftDateKey("2099-03-01", -1)).toBe("2099-02-28");
  });

  it("日付を「9月20日(日)」の形にし、今日は日本時間で決める", () => {
    expect(formatDateKey("2099-09-20")).toBe("9月20日(日)");
    // 2099-01-09 20:00Z は日本時間 1/10 05:00
    expect(todayKey(new Date("2099-01-09T20:00:00Z"))).toBe("2099-01-10");
  });
});

describe("依頼の編集: 入力チェックと差分", () => {
  const form = formFromRequest(ORIGINAL);

  it("もとの依頼から編集フォームを作る", () => {
    expect(form).toEqual({
      title: "電球の交換", description: "脚立はあります", dateKey: "2099-01-10", hour: 10,
      estimatedMinutes: 30, requiredHelpers: 1,
    });
  });

  it("問題が無ければ null、あれば利用者向けの文を返す", () => {
    expect(validateRequestEdit(form)).toBeNull();
    expect(validateRequestEdit({ ...form, title: "  " })).toMatch(/タイトル/);
    expect(validateRequestEdit({ ...form, description: "" })).toMatch(/内容/);
    expect(validateRequestEdit({ ...form, estimatedMinutes: 5 })).toMatch(/所要時間/);
    expect(validateRequestEdit({ ...form, requiredHelpers: 6 })).toMatch(/募集人数/);
    expect(validateRequestEdit({ ...form, requiredHelpers: 1 }, { acceptedHelpers: 2 })).toMatch(/2 人が決まっている/);
    expect(validateRequestEdit({ ...form, dateKey: "2000-01-01" })).toMatch(/過ぎています/);
  });

  it("変わった項目だけを更新 API の形で返す", () => {
    expect(changedFields(ORIGINAL, form)).toEqual({});
    expect(changedFields(ORIGINAL, { ...form, title: " 電球の交換と掃除 ", hour: 14, requiredHelpers: 2 })).toEqual({
      title: "電球の交換と掃除",
      scheduledAt: "2099-01-10T14:00:00+09:00",
      requiredHelpers: 2,
    });
  });

  it("状態によって編集・取消の可否を決める", () => {
    expect(canEditRequest("published")).toBe(true);
    expect(canEditRequest("matched")).toBe(false);
    expect(canCancelRequest("matching")).toBe(true);
    expect(canCancelRequest("completed")).toBe(false);
    expect(canCancelRequest("cancelled")).toBe(false);
  });
});

describe("依頼の編集: エラー文", () => {
  const failure = (status: number, code: string) =>
    updateResultMessage({
      status: "conflict", requestId: "r1", request: null, latestRequest: null,
      error: new ApiError({ status, code, message: "raw" }), refreshError: null,
    });

  it("API のエラーコードを利用者向けの文にする", () => {
    expect(failure(409, "REQUEST_NOT_EDITABLE")).toMatch(/もう編集できません/);
    expect(failure(409, "HELPER_COUNT_CONFLICT")).toMatch(/人数/);
    expect(failure(409, "REQUEST_STATE_CONFLICT")).toMatch(/別の端末/);
    expect(failure(422, "SOMETHING_ELSE")).toMatch(/入力内容/);
  });

  it("成功なら null", () => {
    expect(updateResultMessage({
      status: "updated", requestId: "r1", request: {} as never, latestRequest: null, error: null, refreshError: null,
    })).toBeNull();
  });
});
