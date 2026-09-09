import { apiClient, type ApiClient } from "../../api/client";

/**
 * 自治体ダッシュボードの集計。管理者だけが取得できる。
 * 件数などの集計値だけで、個人情報は含まない。人数が minCellSize 未満の区分は
 * サーバー側で件数が伏せられ（null）、画面では「-」と出す。
 */
export type BreakdownItem = {
  key: string;
  label: string;
  requests: number | null;
  completed: number | null;
};

export type MunicipalityTotals = {
  requestsCreated: number;
  requestsCompleted: number;
  requestsCancelled: number;
  matchesFormed: number;
  matchesCompleted: number;
  activeHelpers: number | null;
  avgEstimatedMinutes: number | null;
};

export type MunicipalityOverview = {
  fromDate: string;
  toDate: string;
  minCellSize: number;
  totals: MunicipalityTotals;
  byArea: BreakdownItem[];
  byCategory: BreakdownItem[];
};

export type OverviewRange = { from?: string; to?: string };

export function getMunicipalityOverview(
  range: OverviewRange = {},
  client: ApiClient = apiClient,
): Promise<MunicipalityOverview> {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const query = params.toString();
  return client.get<MunicipalityOverview>(
    `/admin/municipality-overview${query ? `?${query}` : ""}`,
  );
}

/** 期間プリセット。過去 N 日を今日までで表す。 */
export function rangeForDays(days: number, now: Date = new Date()): OverviewRange {
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

/** 伏せられた件数は「-」、完了率は依頼数が分かるときだけ百分率で。 */
export function formatCount(value: number | null): string {
  return value === null ? "-" : String(value);
}

export function completionRate(requests: number | null, completed: number | null): string {
  if (requests === null || completed === null || requests === 0) return "-";
  return `${Math.round((completed / requests) * 100)}%`;
}

/**
 * 集計を CSV（UTF-8）にする。表計算ソフトで開けるよう BOM を付ける。
 * 伏せた値は空欄にする。
 */
export function overviewToCsv(overview: MunicipalityOverview): string {
  const cell = (value: number | null): string => (value === null ? "" : String(value));
  const lines: string[] = [];
  lines.push(`集計期間,${overview.fromDate},${overview.toDate}`);
  lines.push("");
  lines.push("区分,項目,依頼数,完了数,完了率");
  const t = overview.totals;
  lines.push(`全体,合計,${t.requestsCreated},${t.requestsCompleted},${completionRate(t.requestsCreated, t.requestsCompleted)}`);
  lines.push("");
  lines.push("地域別,コード,依頼数,完了数,完了率");
  for (const row of overview.byArea) {
    lines.push(`${escapeCsv(row.label)},${escapeCsv(row.key)},${cell(row.requests)},${cell(row.completed)},${completionRate(row.requests, row.completed)}`);
  }
  lines.push("");
  lines.push("カテゴリ別,識別子,依頼数,完了数,完了率");
  for (const row of overview.byCategory) {
    lines.push(`${escapeCsv(row.label)},${escapeCsv(row.key)},${cell(row.requests)},${cell(row.completed)},${completionRate(row.requests, row.completed)}`);
  }
  return "﻿" + lines.join("\r\n");
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
