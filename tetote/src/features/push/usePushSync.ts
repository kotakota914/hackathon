import { useEffect } from "react";
import { Platform } from "react-native";

import { syncPushSubscription } from "./client";

/**
 * ログイン後の画面で一度だけ、既存の通知購読をサーバーに登録し直す。
 * 新たに許可を求めることはしない（許可を求めるのは設定画面の「通知」だけ）。
 */
export function usePushSync(): void {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const timer = setTimeout(() => void syncPushSubscription(), 1500);
    return () => clearTimeout(timer);
  }, []);
}
