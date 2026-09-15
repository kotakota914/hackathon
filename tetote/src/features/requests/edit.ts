import { ApiError } from "../../api/errors";
import type { UpdateRequestInput, RequestUpdateState } from "../../api/request-update";
import type { RequestDeletionState } from "../../api/request-deletion";

/**
 * 依頼の編集・取消の「画面に依存しない部分」。
 * 日付と時間の組み立て、入力チェック、変わった項目だけの抽出、エラー文の変換をここに置き、
 * 画面（request-edit.tsx）は表示と操作だけにする。テストもこのファイルに対して書く。
 */

/** 内容を直せる状態。支援者が決まった後（matched 以降）は直せない。 */
export const EDITABLE_STATUSES = new Set(["draft", "pending_review", "published"]);

/** 取り消せる状態。支援者が決まった後はトークで相談してから取り消す想定なので画面からは出さない。 */
export const CANCELLABLE_STATUSES = new Set(["draft", "pending_review", "published", "matching"]);

export function canEditRequest(status: string): boolean {
  return EDITABLE_STATUSES.has(status);
}

export function canCancelRequest(status: string): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

/** 選べる時間（時）。早朝・深夜は安全のため選べない。 */
export const HOUR_OPTIONS = Array.from({ length: 15 }, (_, index) => index + 7); // 7〜21 時

/** 所要時間の候補（分）。 */
export const MINUTE_OPTIONS = [30, 60, 90, 120, 180];

export const HELPER_OPTIONS = [1, 2, 3, 4, 5];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "YYYY-MM-DD" の日付キー。端末のタイムゾーンに左右されないよう UTC 計算で扱う。 */
export type DateKey = string;

export function dateKeyOf(date: Date): DateKey {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 日本時間で「今日」の日付キー。 */
export function todayKey(now: Date = new Date()): DateKey {
  return dateKeyOf(new Date(now.getTime() + JST_OFFSET_MS));
}

export function shiftDateKey(key: DateKey, days: number): DateKey {
  const [year, month, day] = key.split("-").map(Number);
  return dateKeyOf(new Date(Date.UTC(year, month - 1, day + days)));
}

/** 「9月20日(土)」の形にする。 */
export function formatDateKey(key: DateKey): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return "";
  return `${month}月${day}日(${WEEKDAYS[date.getUTCDay()]})`;
}

/**
 * API の予定日時（ISO 文字列。Z でも +09:00 でもよい）を日本時間の日付キーと時に分ける。
 * 読めない値は今日の 10 時にする。
 */
export function parseScheduledAt(iso: string, now: Date = new Date()): { dateKey: DateKey; hour: number } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { dateKey: todayKey(now), hour: 10 };
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return { dateKey: dateKeyOf(jst), hour: jst.getUTCHours() };
}

/** 日付キーと時から、作成画面と同じ形（+09:00、分は 00）の予定日時を作る。 */
export function buildScheduledAt(dateKey: DateKey, hour: number): string {
  return `${dateKey}T${pad(hour)}:00:00+09:00`;
}

export type RequestEditForm = {
  title: string;
  description: string;
  dateKey: DateKey;
  hour: number;
  estimatedMinutes: number;
  requiredHelpers: number;
};

export type RequestEditSource = {
  title: string;
  description: string;
  scheduledAt: string;
  estimatedMinutes: number;
  requiredHelpers: number;
  acceptedHelpers?: number;
};

export function formFromRequest(request: RequestEditSource, now: Date = new Date()): RequestEditForm {
  const { dateKey, hour } = parseScheduledAt(request.scheduledAt, now);
  return {
    title: request.title,
    description: request.description,
    dateKey,
    hour,
    estimatedMinutes: request.estimatedMinutes,
    requiredHelpers: request.requiredHelpers,
  };
}

/** 入力チェック。問題があれば利用者向けの文を返し、無ければ null。 */
export function validateRequestEdit(
  form: RequestEditForm,
  options: { acceptedHelpers?: number; now?: Date } = {},
): string | null {
  const title = form.title.trim();
  const description = form.description.trim();
  if (title.length === 0) return "タイトルを入力してください。";
  if (title.length > 100) return "タイトルは 100 文字までです。";
  if (description.length === 0) return "内容を入力してください。";
  if (description.length > 2000) return "内容は 2000 文字までです。";
  if (!Number.isInteger(form.estimatedMinutes) || form.estimatedMinutes < 10 || form.estimatedMinutes > 240) {
    return "所要時間は 10 分から 240 分の間で入力してください。";
  }
  if (!Number.isInteger(form.requiredHelpers) || form.requiredHelpers < 1 || form.requiredHelpers > 5) {
    return "募集人数は 1 人から 5 人までです。";
  }
  const accepted = options.acceptedHelpers ?? 0;
  if (form.requiredHelpers < accepted) {
    return `すでに ${accepted} 人が決まっているため、募集人数はそれより少なくできません。`;
  }
  const scheduled = new Date(buildScheduledAt(form.dateKey, form.hour));
  const now = options.now ?? new Date();
  if (Number.isNaN(scheduled.getTime())) return "日付を選び直してください。";
  if (scheduled.getTime() < now.getTime()) return "予定の日時が過ぎています。これからの日時を選んでください。";
  return null;
}

/** もとの依頼と比べて変わった項目だけを、更新 API の形で返す（expectedVersion は含めない）。 */
export function changedFields(
  original: RequestEditSource,
  form: RequestEditForm,
): Omit<UpdateRequestInput, "expectedVersion"> {
  const changes: Omit<UpdateRequestInput, "expectedVersion"> = {};
  const title = form.title.trim();
  const description = form.description.trim();
  if (title !== original.title) changes.title = title;
  if (description !== original.description) changes.description = description;
  const originalSchedule = parseScheduledAt(original.scheduledAt);
  if (originalSchedule.dateKey !== form.dateKey || originalSchedule.hour !== form.hour) {
    changes.scheduledAt = buildScheduledAt(form.dateKey, form.hour);
  }
  if (form.estimatedMinutes !== original.estimatedMinutes) changes.estimatedMinutes = form.estimatedMinutes;
  if (form.requiredHelpers !== original.requiredHelpers) changes.requiredHelpers = form.requiredHelpers;
  return changes;
}

const updateErrorByCode: Record<string, string> = {
  REQUEST_NOT_EDITABLE: "この依頼はもう編集できません（支援者が決まっているか、終了しています）。",
  HELPER_COUNT_CONFLICT: "すでに決まっている支援者の人数より少なくはできません。",
  REQUEST_STATE_CONFLICT: "別の端末で更新されていたため、最新の内容を読み込み直しました。もう一度確認してください。",
  REQUEST_PROHIBITED: "この内容の依頼は受け付けられません。内容を見直してください。",
  VALIDATION_ERROR: "入力内容を確認してください。",
};

/** 更新結果を利用者向けの文にする。成功時は null。 */
export function updateResultMessage(state: RequestUpdateState): string | null {
  if (state.status === "updated") return null;
  const error = state.error;
  if (error instanceof ApiError) {
    const known = updateErrorByCode[error.code];
    if (known) return known;
    if (error.status === 422) return updateErrorByCode.VALIDATION_ERROR;
    if (error.status === 403) return "この依頼は編集できません。";
    if (error.status === 404) return "依頼が見つかりませんでした。";
    return error.message;
  }
  return "依頼を更新できませんでした。通信環境を確認して、もう一度お試しください。";
}

/** 取消結果を利用者向けの文にする。成功時は null。 */
export function cancelResultMessage(state: RequestDeletionState): string | null {
  if (state.status === "deleted") return null;
  if (state.status === "conflict") return "この依頼は今の状態では取り消せません。完了済みか、すでに取り消されています。";
  if (state.status === "forbidden") return "この依頼は取り消せません。";
  if (state.status === "not_found") return "依頼が見つかりませんでした。";
  return "依頼を取り消せませんでした。通信環境を確認して、もう一度お試しください。";
}
