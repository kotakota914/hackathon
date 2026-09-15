import { apiClient, type ApiClient } from "../../api/client";
import { ApiError } from "../../api/errors";

/**
 * 公開依頼の一覧・詳細をAPIから取得する層。
 * 画面が使うカード表示用の形（RequestCard）への変換もここで行い、
 * 画面側はAPIのレスポンス形式を知らなくて済むようにする。
 */

export type PublicRequest = {
  id: string;
  requesterId?: string;
  title: string;
  description: string;
  category: string;
  areaLabel: string;
  distanceKm: number | null;
  scheduledAt: string;
  estimatedMinutes: number;
  requiredHelpers: number;
  acceptedHelpers: number;
  status: string;
  warnings: string[];
  version?: number;
};

export type RequestListPage = {
  items: PublicRequest[];
  nextCursor: string | null;
};

/** 一覧カードが表示に使う形。 */
export type RequestCard = {
  id: string;
  title: string;
  description: string;
  location: string;
  distance: string;
  deadline: string;
  meta: string;
  tags: string[];
};

const listErrorMessages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "セッションの有効期限が切れました。もう一度ログインしてください。",
  VALIDATION_ERROR: "検索条件を確認してください。",
};

export function requestListErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return listErrorMessages[error.code] ?? error.message;
  }
  return "依頼を読み込めませんでした。通信環境を確認して、もう一度お試しください。";
}

// バックエンドのカテゴリ識別子を、一覧のタグ表示へ寄せる。
// 未知のカテゴリは「#その他」として表示だけ行い、絞り込み対象にはならない。
const categoryTags: Record<string, string[]> = {
  pet_support: ["#動物", "#散歩"],
  snow_removal: ["#力仕事"],
  shopping: ["#買い物"],
  cleaning: ["#日常生活"],
  digital_support: ["#デジタル", "#パソコン"],
  escort: ["#付き添い", "#外出"],
  exercise: ["#運動"],
  walking: ["#散歩"],
};

export function tagsForCategory(category: string): string[] {
  return categoryTags[category] ?? ["#その他"];
}

/** 絞り込みに使えるカテゴリ（識別子はバックエンドと同じ）。 */
export const REQUEST_CATEGORIES: { id: string; label: string }[] = [
  { id: "shopping", label: "買い物" },
  { id: "cleaning", label: "掃除・日常生活" },
  { id: "household", label: "家事" },
  { id: "escort", label: "付き添い・外出" },
  { id: "digital_support", label: "デジタル・パソコン" },
  { id: "pet_support", label: "ペット・動物" },
  { id: "walking", label: "散歩" },
  { id: "exercise", label: "運動" },
  { id: "gardening", label: "庭・草むしり" },
  { id: "snow_removal", label: "雪かき・力仕事" },
  { id: "errand", label: "用事・お使い" },
  { id: "moving", label: "移動・運搬" },
];

export type RequestSort = "newest" | "scheduled";

export const REQUEST_SORTS: { id: RequestSort; label: string }[] = [
  { id: "newest", label: "新しい順" },
  { id: "scheduled", label: "予定日が近い順" },
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 予定日時を「9/20(土) 10:00」の形にする。読めない値は空文字。 */
export function formatScheduledAt(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]}) ${hours}:${minutes}`;
}

function formatMonthDay(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * APIの依頼をカード表示用の形へ変換する。
 * 年齢・性別はAPIが返さない（公開一覧に個人情報を出さない設計）ため、
 * 代わりに所要時間と募集人数を表示する。
 */
export function toRequestCard(item: PublicRequest): RequestCard {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    location: item.areaLabel,
    distance: item.distanceKm === null ? "" : `${item.distanceKm}km`,
    deadline: formatMonthDay(item.scheduledAt),
    meta: `約${item.estimatedMinutes}分・${item.requiredHelpers}人募集`,
    tags: tagsForCategory(item.category),
  };
}

export type ListRequestsParams = {
  areaCode?: string;
  category?: string;
  cursor?: string;
  /** タイトル・本文のキーワード（部分一致）。空白だけなら送らない。 */
  q?: string;
  sort?: RequestSort;
  limit?: number;
};

export async function listPublicRequests(
  params: ListRequestsParams = {},
  client: ApiClient = apiClient,
): Promise<RequestListPage> {
  const query = new URLSearchParams();
  const keyword = params.q?.trim() ?? "";
  if (keyword) query.set("q", keyword.slice(0, 50));
  if (params.sort && params.sort !== "newest") query.set("sort", params.sort);
  if (params.areaCode) query.set("areaCode", params.areaCode);
  if (params.category) query.set("category", params.category);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.cursor) query.set("cursor", params.cursor);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  const page = await client.get<RequestListPage>(`/requests${suffix}`);
  return { items: page.items, nextCursor: page.nextCursor };
}

/** 依頼者本人の依頼を、状態に関係なく新しい順で返す。 */
export async function listMyRequests(
  params: { status?: string[]; limit?: number } = {},
  client: ApiClient = apiClient,
): Promise<{ items: PublicRequest[] }> {
  const query = new URLSearchParams();
  for (const status of params.status ?? []) query.append("status", status);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return client.get<{ items: PublicRequest[] }>(`/requests/mine${suffix}`);
}

// 依頼の状態を、依頼者が読んで分かる言葉にする。
const statusLabels: Record<string, string> = {
  draft: "下書き",
  pending_review: "確認中",
  published: "募集中",
  matching: "募集中",
  matched: "支援者が決まりました",
  in_progress: "支援中",
  completion_pending: "完了の確認待ち",
  completed: "完了",
  rejected: "受付できませんでした",
  cancelled: "取消済み",
  expired: "期限切れ",
  suspended: "停止中",
  disputed: "トラブル対応中",
};

export function requestStatusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

export async function getRequest(
  requestId: string,
  client: ApiClient = apiClient,
): Promise<PublicRequest> {
  return client.get<PublicRequest>(`/requests/${encodeURIComponent(requestId)}`);
}
