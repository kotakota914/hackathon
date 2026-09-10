import { apiClient, type ApiClient } from "../../api/client";

/** 通報の確認（管理者）。通報の一覧・対応済み・利用停止。 */
export type ReportStatus = "open" | "investigating" | "resolved" | "rejected";

export type Report = {
  id: string;
  reporterId: string;
  targetType: "user" | "request" | "match" | "message" | "review";
  targetId: string;
  reason: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
};

export function listReports(status: ReportStatus | null, client: ApiClient = apiClient): Promise<{ items: Report[] }> {
  const query = status ? `?status=${status}` : "";
  return client.get<{ items: Report[] }>(`/admin/reports${query}`);
}

export function resolveReport(
  reportId: string,
  status: "resolved" | "rejected" | "investigating",
  client: ApiClient = apiClient,
): Promise<Report> {
  return client.post<Report>(`/admin/reports/${encodeURIComponent(reportId)}/resolve`, { status });
}

export function setUserSuspended(
  userId: string,
  suspended: boolean,
  client: ApiClient = apiClient,
): Promise<{ userId: string; status: "active" | "suspended" }> {
  return client.post(`/admin/users/${encodeURIComponent(userId)}/suspend`, { suspended });
}

export const REASON_LABELS: Record<string, string> = {
  fraud: "詐欺の疑い",
  harassment: "嫌がらせ",
  dangerous_work: "危険な作業",
  false_information: "うその情報",
  no_show: "無断で来なかった",
  personal_information_request: "個人情報を聞かれた",
  payment_request: "金銭を要求された",
  other: "その他",
};

export const TARGET_LABELS: Record<Report["targetType"], string> = {
  user: "利用者",
  request: "依頼",
  match: "マッチ",
  message: "メッセージ",
  review: "レビュー",
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "未対応",
  investigating: "確認中",
  resolved: "対応済み",
  rejected: "問題なし",
};

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}
