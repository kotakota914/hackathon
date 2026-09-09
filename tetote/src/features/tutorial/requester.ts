/**
 * 練習モード「依頼者編」の進み方。
 *
 * 画面は本物そっくりだが、データはこのファイルの中だけで完結する（サーバーには何も送らない）。
 * 状態と操作を純粋な関数にしてあるので、画面なしでテストできる。
 *
 * 流れ: 依頼を書く → 応募が届く → 応募者を選ぶ → チャット → 完了 → キャラクターが育つ
 */

export type RequesterPhase =
  | "write" // 依頼を書く
  | "waiting" // 募集中。少し待つと応募が届く
  | "applicants" // 応募者を見て選ぶ
  | "chat" // 相手とやり取り
  | "complete" // 手伝ってもらった後の完了確認
  | "reward" // キャラクターが育つ
  | "done";

export type ChatMessage = { from: "me" | "helper"; text: string };

export type RequesterState = {
  phase: RequesterPhase;
  title: string;
  minutes: number;
  applicantArrived: boolean;
  messages: ChatMessage[];
  awaitingHelperReply: boolean;
  rating: number;
};

export type RequesterAction =
  | { type: "SET_TITLE"; title: string }
  | { type: "SET_MINUTES"; minutes: number }
  | { type: "POST_REQUEST" }
  | { type: "APPLICANT_ARRIVED" }
  | { type: "OPEN_APPLICANTS" }
  | { type: "SELECT_HELPER" }
  | { type: "SEND_MESSAGE"; text: string }
  | { type: "HELPER_REPLIED" }
  | { type: "MARK_COMPLETE" }
  | { type: "SET_RATING"; rating: number }
  | { type: "CONFIRM_COMPLETE" }
  | { type: "FINISH" };

/** 架空の支援者。本物の画面と同じ情報（本人確認・実績）を見せる。 */
export const HELPER = {
  name: "田中 悠",
  detail: "大学生 ・ 本人確認済み ・ お手伝い 12 回",
  message: "近くに住んでいます。電球の交換など、力仕事も大丈夫です！",
  greeting: "よろしくお願いします！何時ごろ伺えばよいですか？",
  reply: "わかりました。その時間に伺います。当日はよろしくお願いします。",
};

/** 依頼の例。入力が難しい人はこれを押すだけで進める。 */
export const TITLE_SUGGESTIONS = [
  "電球を交換してほしい",
  "重い荷物を運ぶのを手伝ってほしい",
  "スマホの設定を教えてほしい",
];

export const MINUTE_OPTIONS = [15, 30, 60];

/** チャットの返事の例。自由入力の代わりに押して進める。 */
export const REPLY_SUGGESTIONS = ["10時ごろでお願いします", "午後なら空いています"];

/** 本番と同じ規則: 1回の手伝いで 50 点 + 活動分数。app/services/character.py と揃える。 */
export const POINTS_PER_HELP = 50;
export const NEXT_STAGE_POINTS = 150;

export const initialRequesterState: RequesterState = {
  phase: "write",
  title: "",
  minutes: 30,
  applicantArrived: false,
  messages: [],
  awaitingHelperReply: false,
  rating: 0,
};

export function canPostRequest(state: RequesterState): boolean {
  return state.phase === "write" && state.title.trim().length > 0;
}

export function requesterReducer(
  state: RequesterState,
  action: RequesterAction,
): RequesterState {
  switch (action.type) {
    case "SET_TITLE":
      return state.phase === "write" ? { ...state, title: action.title } : state;
    case "SET_MINUTES":
      return state.phase === "write" ? { ...state, minutes: action.minutes } : state;
    case "POST_REQUEST":
      return canPostRequest(state) ? { ...state, phase: "waiting", title: state.title.trim() } : state;
    case "APPLICANT_ARRIVED":
      return state.phase === "waiting" ? { ...state, applicantArrived: true } : state;
    case "OPEN_APPLICANTS":
      return state.phase === "waiting" && state.applicantArrived
        ? { ...state, phase: "applicants" }
        : state;
    case "SELECT_HELPER":
      return state.phase === "applicants"
        ? { ...state, phase: "chat", messages: [{ from: "helper", text: HELPER.greeting }] }
        : state;
    case "SEND_MESSAGE": {
      const text = action.text.trim();
      if (state.phase !== "chat" || !text || state.awaitingHelperReply) return state;
      return {
        ...state,
        messages: [...state.messages, { from: "me", text }],
        awaitingHelperReply: true,
      };
    }
    case "HELPER_REPLIED":
      return state.phase === "chat" && state.awaitingHelperReply
        ? {
            ...state,
            messages: [...state.messages, { from: "helper", text: HELPER.reply }],
            awaitingHelperReply: false,
          }
        : state;
    case "MARK_COMPLETE":
      // 返事を1往復してから完了へ進める。
      return state.phase === "chat" && hasExchangedMessages(state)
        ? { ...state, phase: "complete" }
        : state;
    case "SET_RATING":
      return state.phase === "complete"
        ? { ...state, rating: Math.max(0, Math.min(5, Math.round(action.rating))) }
        : state;
    case "CONFIRM_COMPLETE":
      return state.phase === "complete" ? { ...state, phase: "reward" } : state;
    case "FINISH":
      return state.phase === "reward" ? { ...state, phase: "done" } : state;
    default:
      return state;
  }
}

export function hasExchangedMessages(state: RequesterState): boolean {
  return (
    state.messages.some((m) => m.from === "me") &&
    state.messages.filter((m) => m.from === "helper").length >= 2 &&
    !state.awaitingHelperReply
  );
}

/**
 * 架空の相手が「勝手に」動く部分。次に自動で起こす出来事と、その待ち時間（ミリ秒）。
 * 画面側はこれを setTimeout に載せるだけ。無ければ null。
 */
export function scheduledEvent(
  state: RequesterState,
): { after: number; action: RequesterAction } | null {
  if (state.phase === "waiting" && !state.applicantArrived) {
    return { after: 1800, action: { type: "APPLICANT_ARRIVED" } };
  }
  if (state.phase === "chat" && state.awaitingHelperReply) {
    return { after: 1400, action: { type: "HELPER_REPLIED" } };
  }
  return null;
}

export type Coach = { step: number; total: number; title: string; body: string };

export const TOTAL_STEPS = 6;

/** 画面上部の案内。「今なにをすればよいか」を一文で。 */
export function coachFor(state: RequesterState): Coach {
  switch (state.phase) {
    case "write":
      return {
        step: 1,
        total: TOTAL_STEPS,
        title: "困っていることを書きます",
        body: "短くて大丈夫です。例を押すだけでも進めます。書けたら「この内容で依頼する」を押してください。",
      };
    case "waiting":
      return state.applicantArrived
        ? {
            step: 2,
            total: TOTAL_STEPS,
            title: "応募が届きました",
            body: "手伝いたい人が現れると、こうしてお知らせが出ます。「応募者を見る」を押してみましょう。",
          }
        : {
            step: 2,
            total: TOTAL_STEPS,
            title: "依頼を出しました",
            body: "近くの人に届いています。少し待つと応募が来ます。",
          };
    case "applicants":
      return {
        step: 3,
        total: TOTAL_STEPS,
        title: "応募者を選びます",
        body: "本人確認済みのマークと、これまでのお手伝い回数が目安です。「この人にお願いする」を押してください。",
      };
    case "chat":
      if (state.awaitingHelperReply) {
        return { step: 4, total: TOTAL_STEPS, title: "返事を待っています", body: "相手からの返事を待ちましょう。" };
      }
      return hasExchangedMessages(state)
        ? {
            step: 4,
            total: TOTAL_STEPS,
            title: "約束ができました",
            body: "当日、手伝ってもらえたら「手伝ってもらった」を押します。まだ手伝ってもらう前なら押さないでください。",
          }
        : {
            step: 4,
            total: TOTAL_STEPS,
            title: "相手とやり取りします",
            body: "都合のよい時間を伝えましょう。下の例を押すと送れます。",
          };
    case "complete":
      return {
        step: 5,
        total: TOTAL_STEPS,
        title: "完了を伝えます",
        body: "「完了にする」を押すと、相手にありがとうが届きます。星で評価もできます（任意）。",
      };
    case "reward":
    case "done":
      return {
        step: 6,
        total: TOTAL_STEPS,
        title: "キャラクターが育ちました",
        body: "助け合うほどキャラクターが育ちます。本番もまったく同じ流れです。",
      };
  }
}

export function rewardPoints(state: RequesterState): number {
  return POINTS_PER_HELP + state.minutes;
}
