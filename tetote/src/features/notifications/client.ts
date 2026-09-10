import { apiClient, type ApiClient } from "../../api/client";

/**
 * お知らせ（アプリ内の通知履歴）。
 * プッシュ通知が届かない環境でも、開いたときに「何があったか」を確認できる。
 * 本文に相手の名前やメッセージ内容は含まれない。
 */
export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationList = { items: NotificationItem[]; unreadCount: number };

export function getNotifications(client: ApiClient = apiClient): Promise<NotificationList> {
  return client.get<NotificationList>("/me/notifications");
}

export function markNotificationsRead(
  ids: string[] | null = null,
  client: ApiClient = apiClient,
): Promise<{ marked: number }> {
  return client.post<{ marked: number }>("/me/notifications/read", ids ? { ids } : {});
}

/** お知らせの種類ごとのアイコン名（Ionicons）。 */
export function iconForKind(kind: string): "person-add" | "checkmark-circle" | "chatbubble-ellipses" | "notifications" {
  switch (kind) {
    case "application":
      return "person-add";
    case "selected":
      return "checkmark-circle";
    case "message":
      return "chatbubble-ellipses";
    default:
      return "notifications";
  }
}

/** 「3分前」「昨日」「9/9」のような相対表示。 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMinutes = Math.round((now.getTime() - then.getTime()) / 60000);
  if (diffMinutes < 1) return "たった今";
  if (diffMinutes < 60) return `${diffMinutes}分前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}時間前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "昨日";
  if (diffDays < 7) return `${diffDays}日前`;
  return `${then.getMonth() + 1}/${then.getDate()}`;
}

/**
 * サーバーが返す URL は「/help/…」「/helper/…」の形。開いている側（help / helper）に
 * 合わせて置き換える。同じ画面がもう一方に無い場合はそのまま。
 */
export function urlForSide(url: string, side: "help" | "helper"): string {
  const other = side === "help" ? "/helper/" : "/help/";
  const mine = side === "help" ? "/help/" : "/helper/";
  if (!url.startsWith(other)) return url;
  const rest = url.slice(other.length);
  const shared = ["chat", "chats", "profile", "settings", "notifications"];
  return shared.some((name) => rest === name || rest.startsWith(`${name}?`)) ? mine + rest : url;
}
