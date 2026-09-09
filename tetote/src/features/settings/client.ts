import { apiClient, type ApiClient } from "../../api/client";

/**
 * 利用者設定（通知・位置情報・文字サイズ）。サーバーに保存され、端末をまたいで同じ。
 * 通知の「希望」はここ、通知の「許可」はブラウザ側（features/push）で別に扱う。
 */
export type FontSizeOption = "small" | "medium" | "large";

export type UserSettings = {
  notificationsEnabled: boolean;
  locationEnabled: boolean;
  fontSize: FontSizeOption;
};

export function getSettings(client: ApiClient = apiClient): Promise<UserSettings> {
  return client.get<UserSettings>("/settings");
}

export function updateSettings(
  changes: Partial<UserSettings>,
  client: ApiClient = apiClient,
): Promise<UserSettings> {
  return client.patch<UserSettings>("/settings", changes);
}
