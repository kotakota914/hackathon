import { apiClient, type ApiClient } from "../../api/client";

/**
 * 他の利用者の公開プロフィール（実績ページ）。
 * 依頼者が応募者を選ぶとき、支援者が自分の見え方を確かめるときに使う。
 * サーバーは個人情報（地域・年齢・大学など）を返さない。
 */
export type PublicProfile = {
  userId: string;
  displayName: string;
  verificationStatus: "unverified" | "pending" | "approved" | "rejected" | "expired";
  memberSince: string | null;
  completedCount: number;
  totalMinutes: number;
  character: { stage: number; maxStage: number; characterId: string; helpCount: number };
  achievementText: string | null;
  achievementApprovedAt: string | null;
  reviewSummary: ReviewSummary;
};

/** 受け取った評価の要約。本文や評価者は含まれない。 */
export type ReviewSummary = {
  count: number;
  onTime: number;
  polite: number;
  safetyAware: number;
  communicative: number;
};

export const REVIEW_TRAIT_LABELS: { key: keyof Omit<ReviewSummary, "count">; label: string }[] = [
  { key: "onTime", label: "時間どおり" },
  { key: "polite", label: "丁寧" },
  { key: "safetyAware", label: "安全に配慮" },
  { key: "communicative", label: "連絡がこまめ" },
];

export function getPublicProfile(userId: string, client: ApiClient = apiClient): Promise<PublicProfile> {
  return client.get<PublicProfile>(`/users/${encodeURIComponent(userId)}/public-profile`);
}

/** "2026-09" → "2026年9月から" */
export function memberSinceLabel(memberSince: string | null): string {
  if (!memberSince) return "";
  const [year, month] = memberSince.split("-").map(Number);
  if (!year || !month) return "";
  return `${year}年${month}月から`;
}

/** 合計分 → 「1時間30分」 */
export function minutesLabel(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0分";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}分`;
  return minutes === 0 ? `${hours}時間` : `${hours}時間${minutes}分`;
}

export const VERIFICATION_LABELS: Record<PublicProfile["verificationStatus"], string> = {
  approved: "本人確認済み",
  pending: "本人確認の審査中",
  unverified: "本人確認は未完了",
  rejected: "本人確認は未完了",
  expired: "本人確認は未完了",
};
