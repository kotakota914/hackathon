import { apiClient, type ApiClient } from "../../api/client";

/**
 * 画面の「気づき」に使うバッジの集計。
 * サーバーがその時点の事実（応募待ち・進行中のマッチ・未読メッセージ）を数えるだけで、
 * 端末側に状態を持たない。開き直さなくても変化に気づけるよう、定期的に取り直す。
 */
export type BadgeSummary = {
  /** 自分の依頼に来て、まだ選んでいない応募の数（依頼者向け） */
  pendingApplicants: number;
  /** 進行中のマッチの数（マッチ済み・支援中・完了確認待ち） */
  activeMatches: number;
  /** 相手から届いて、まだ開いていないメッセージの数 */
  unreadMessages: number;
};

export const EMPTY_BADGES: BadgeSummary = {
  pendingApplicants: 0,
  activeMatches: 0,
  unreadMessages: 0,
};

/** 取り直す間隔。チャットの3秒より緩く、電池と通信量を抑える。 */
export const BADGE_POLL_INTERVAL_MS = 30_000;

export function getBadges(client: ApiClient = apiClient): Promise<BadgeSummary> {
  return client.get<BadgeSummary>("/me/badges");
}

/** バッジに出す文字。0 は出さない、100 以上は「99+」。 */
export function badgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? "99+" : String(Math.floor(count));
}
