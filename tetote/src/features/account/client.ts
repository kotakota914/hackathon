import { apiClient, type ApiClient } from "../../api/client";
import { ApiError, ApiNetworkError } from "../../api/errors";

/**
 * アカウント削除（退会）。
 * サーバー側で依頼の取消・応募の取下げ・プロフィールの匿名化・セッション失効まで行う。
 * 成功（204）を確認してから、端末側の認証状態を捨ててログイン画面へ戻す。
 * 詳細は docs/account-deletion.md。
 */
export function deleteAccount(client: ApiClient = apiClient): Promise<void> {
  return client.delete<void>("/account");
}

export const ACTIVE_MATCH_MESSAGE =
  "進行中の支援があるため削除できません。支援を完了するか取消してから、もう一度お試しください。";
export const NETWORK_MESSAGE =
  "通信できませんでした。電波の良い場所でもう一度お試しください。";
export const GENERIC_MESSAGE =
  "アカウントを削除できませんでした。時間をおいてもう一度お試しください。";

/** 失敗理由を利用者向けの文章にする。 */
export function accountDeletionMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "ACCOUNT_HAS_ACTIVE_MATCH") {
    return ACTIVE_MATCH_MESSAGE;
  }
  if (error instanceof ApiNetworkError) {
    return NETWORK_MESSAGE;
  }
  return GENERIC_MESSAGE;
}
