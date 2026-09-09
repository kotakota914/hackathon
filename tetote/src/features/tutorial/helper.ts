/**
 * 練習モード「支援者編」の進み方。依頼者編（requester.ts）と同じ作り。
 *
 * 流れ: 近くの依頼を見る → 応募する → 選ばれる → やり取り → 完了を報告 → ポイントがたまる
 */

import type { Coach } from "./requester";
import { POINTS_PER_HELP } from "./requester";

export type HelperPhase =
  | "browse" // 近くの依頼を見る
  | "detail" // 依頼の内容を見て応募する
  | "applied" // 応募済み。少し待つと選ばれる
  | "chat" // 依頼者とやり取り
  | "report" // 手伝いを終えて完了を報告
  | "reward" // ポイントと実績
  | "done";

export type ChatMessage = { from: "me" | "requester"; text: string };

export type NearbyRequest = {
  id: string;
  title: string;
  requester: string;
  distance: string;
  minutes: number;
  note: string;
};

export type HelperState = {
  phase: HelperPhase;
  selectedId: string | null;
  chosen: boolean;
  messages: ChatMessage[];
  awaitingReply: boolean;
};

export type HelperAction =
  | { type: "OPEN_REQUEST"; id: string }
  | { type: "BACK_TO_LIST" }
  | { type: "APPLY" }
  | { type: "CHOSEN" }
  | { type: "OPEN_CHAT" }
  | { type: "SEND_MESSAGE"; text: string }
  | { type: "REQUESTER_REPLIED" }
  | { type: "FINISH_HELP" }
  | { type: "CONFIRM_REPORT" }
  | { type: "FINISH" };

/** 練習用の近くの依頼。実際の一覧と同じ情報（距離・所要時間・依頼者）を見せる。 */
export const NEARBY_REQUESTS: NearbyRequest[] = [
  {
    id: "r1",
    title: "電球を交換してほしい",
    requester: "佐藤 花子",
    distance: "徒歩 8 分",
    minutes: 15,
    note: "脚立に乗るのが怖くて…。玄関の電球です。",
  },
  {
    id: "r2",
    title: "買い物の荷物を運んでほしい",
    requester: "山田 一郎",
    distance: "徒歩 12 分",
    minutes: 30,
    note: "スーパーから自宅まで、お米などを一緒に運んでほしいです。",
  },
];

/** 練習で選ぶのはこの依頼。他を押しても壊れないが、案内はこちらを勧める。 */
export const SUGGESTED_REQUEST_ID = "r1";

export const APPLY_MESSAGES = ["できます。何時ごろがよいですか？", "近くに住んでいます。伺えます。"];
export const REPLY_SUGGESTIONS = ["10時に伺います", "午後でも大丈夫です"];

export const REQUESTER_GREETING = "ありがとうございます。10時ごろ来てもらえますか？";
export const REQUESTER_REPLY = "助かります。お待ちしています。";

export const initialHelperState: HelperState = {
  phase: "browse",
  selectedId: null,
  chosen: false,
  messages: [],
  awaitingReply: false,
};

export function selectedRequest(state: HelperState): NearbyRequest | null {
  return NEARBY_REQUESTS.find((item) => item.id === state.selectedId) ?? null;
}

export function hasExchangedMessages(state: HelperState): boolean {
  return (
    state.messages.some((m) => m.from === "me") &&
    state.messages.filter((m) => m.from === "requester").length >= 2 &&
    !state.awaitingReply
  );
}

export function helperReducer(state: HelperState, action: HelperAction): HelperState {
  switch (action.type) {
    case "OPEN_REQUEST":
      return state.phase === "browse" && NEARBY_REQUESTS.some((item) => item.id === action.id)
        ? { ...state, phase: "detail", selectedId: action.id }
        : state;
    case "BACK_TO_LIST":
      return state.phase === "detail" ? { ...state, phase: "browse", selectedId: null } : state;
    case "APPLY":
      return state.phase === "detail" && state.selectedId ? { ...state, phase: "applied" } : state;
    case "CHOSEN":
      return state.phase === "applied" ? { ...state, chosen: true } : state;
    case "OPEN_CHAT":
      return state.phase === "applied" && state.chosen
        ? { ...state, phase: "chat", messages: [{ from: "requester", text: REQUESTER_GREETING }] }
        : state;
    case "SEND_MESSAGE": {
      const text = action.text.trim();
      if (state.phase !== "chat" || !text || state.awaitingReply) return state;
      return { ...state, messages: [...state.messages, { from: "me", text }], awaitingReply: true };
    }
    case "REQUESTER_REPLIED":
      return state.phase === "chat" && state.awaitingReply
        ? {
            ...state,
            messages: [...state.messages, { from: "requester", text: REQUESTER_REPLY }],
            awaitingReply: false,
          }
        : state;
    case "FINISH_HELP":
      return state.phase === "chat" && hasExchangedMessages(state) ? { ...state, phase: "report" } : state;
    case "CONFIRM_REPORT":
      return state.phase === "report" ? { ...state, phase: "reward" } : state;
    case "FINISH":
      return state.phase === "reward" ? { ...state, phase: "done" } : state;
    default:
      return state;
  }
}

/** 架空の依頼者が「勝手に」動く部分。次に自動で起こす出来事と待ち時間（ミリ秒）。 */
export function scheduledEvent(state: HelperState): { after: number; action: HelperAction } | null {
  if (state.phase === "applied" && !state.chosen) {
    return { after: 1800, action: { type: "CHOSEN" } };
  }
  if (state.phase === "chat" && state.awaitingReply) {
    return { after: 1400, action: { type: "REQUESTER_REPLIED" } };
  }
  return null;
}

export const TOTAL_STEPS = 6;

export function coachFor(state: HelperState): Coach {
  switch (state.phase) {
    case "browse":
      return {
        step: 1,
        total: TOTAL_STEPS,
        title: "近くの依頼を見ます",
        body: "歩いて行ける範囲の困りごとが並びます。気になるものを押して、内容を見てみましょう。",
      };
    case "detail":
      return {
        step: 2,
        total: TOTAL_STEPS,
        title: "できそうなら応募します",
        body: "一言そえると選ばれやすくなります。下の例を押してから「応募する」を押してください。",
      };
    case "applied":
      return state.chosen
        ? {
            step: 3,
            total: TOTAL_STEPS,
            title: "選ばれました",
            body: "依頼した人があなたを選ぶと、こうしてお知らせが出ます。「トークを開く」を押しましょう。",
          }
        : {
            step: 3,
            total: TOTAL_STEPS,
            title: "応募しました",
            body: "依頼した人が応募者の中から選びます。少し待ちましょう。",
          };
    case "chat":
      if (state.awaitingReply) {
        return { step: 4, total: TOTAL_STEPS, title: "返事を待っています", body: "相手からの返事を待ちましょう。" };
      }
      return hasExchangedMessages(state)
        ? {
            step: 4,
            total: TOTAL_STEPS,
            title: "約束ができました",
            body: "当日、手伝い終えたら「手伝いを終えた」を押します。手伝う前には押さないでください。",
          }
        : {
            step: 4,
            total: TOTAL_STEPS,
            title: "依頼した人とやり取りします",
            body: "行ける時間を伝えましょう。下の例を押すと送れます。",
          };
    case "report":
      return {
        step: 5,
        total: TOTAL_STEPS,
        title: "完了を報告します",
        body: "「完了を報告する」を押すと依頼した人に届き、相手が確認すると完了になります。",
      };
    case "reward":
    case "done":
      return {
        step: 6,
        total: TOTAL_STEPS,
        title: "ありがとうが実績になります",
        body: "手伝った回数とポイントが記録され、キャラクターも育ちます。本番も同じ流れです。",
      };
  }
}

export function rewardPoints(state: HelperState): number {
  return POINTS_PER_HELP + (selectedRequest(state)?.minutes ?? 0);
}
