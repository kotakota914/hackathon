import { useEffect, useState } from "react";

import { BADGE_POLL_INTERVAL_MS, EMPTY_BADGES, getBadges, type BadgeSummary } from "./client";

/**
 * バッジ集計を定期的に取り直す。
 * 失敗しても前回の値を保ち、画面を止めない（バッジは補助情報）。
 * ログイン前や API 未設定のときは 401 などになるが、0 表示のまま静かに再試行する。
 */
export function useBadges(intervalMs: number = BADGE_POLL_INTERVAL_MS): BadgeSummary {
  const [badges, setBadges] = useState<BadgeSummary>(EMPTY_BADGES);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getBadges()
        .then((summary) => {
          if (active) setBadges(summary);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return badges;
}
