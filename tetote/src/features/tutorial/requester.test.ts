import { describe, expect, it } from "vitest";

import {
  HELPER,
  canPostRequest,
  coachFor,
  hasExchangedMessages,
  initialRequesterState,
  requesterReducer,
  rewardPoints,
  scheduledEvent,
  type RequesterAction,
  type RequesterState,
} from "./requester";

function run(actions: RequesterAction[], from: RequesterState = initialRequesterState): RequesterState {
  return actions.reduce(requesterReducer, from);
}

/** 自動で起こる出来事を、待ち時間を飛ばしてその場で適用する。 */
function settle(state: RequesterState): RequesterState {
  let current = state;
  for (let i = 0; i < 5; i += 1) {
    const event = scheduledEvent(current);
    if (!event) break;
    current = requesterReducer(current, event.action);
  }
  return current;
}

describe("練習モード 依頼者編", () => {
  it("題名が空のままでは依頼を出せない", () => {
    expect(canPostRequest(initialRequesterState)).toBe(false);
    expect(requesterReducer(initialRequesterState, { type: "POST_REQUEST" }).phase).toBe("write");
    const typed = run([{ type: "SET_TITLE", title: "  電球を交換してほしい " }]);
    expect(canPostRequest(typed)).toBe(true);
    expect(requesterReducer(typed, { type: "POST_REQUEST" })).toMatchObject({
      phase: "waiting",
      title: "電球を交換してほしい",
    });
  });

  it("依頼を出すと少し待って応募が届き、応募者を開ける", () => {
    const waiting = run([{ type: "SET_TITLE", title: "電球" }, { type: "POST_REQUEST" }]);
    expect(scheduledEvent(waiting)).toMatchObject({ action: { type: "APPLICANT_ARRIVED" } });
    // 応募が届く前は応募者一覧を開けない（押し間違えても壊れない）
    expect(requesterReducer(waiting, { type: "OPEN_APPLICANTS" }).phase).toBe("waiting");
    const arrived = settle(waiting);
    expect(arrived.applicantArrived).toBe(true);
    expect(scheduledEvent(arrived)).toBeNull();
    expect(requesterReducer(arrived, { type: "OPEN_APPLICANTS" }).phase).toBe("applicants");
  });

  it("応募者を選ぶと相手の挨拶から会話が始まり、返事を送ると相手が返す", () => {
    const chat = run([
      { type: "SET_TITLE", title: "電球" },
      { type: "POST_REQUEST" },
      { type: "APPLICANT_ARRIVED" },
      { type: "OPEN_APPLICANTS" },
      { type: "SELECT_HELPER" },
    ]);
    expect(chat.phase).toBe("chat");
    expect(chat.messages).toEqual([{ from: "helper", text: HELPER.greeting }]);
    // 一往復する前は完了へ進めない
    expect(requesterReducer(chat, { type: "MARK_COMPLETE" }).phase).toBe("chat");

    const sent = requesterReducer(chat, { type: "SEND_MESSAGE", text: "10時ごろでお願いします" });
    expect(sent.awaitingHelperReply).toBe(true);
    // 返事待ちの間は二重送信できない
    expect(requesterReducer(sent, { type: "SEND_MESSAGE", text: "もう一度" }).messages).toHaveLength(2);
    expect(scheduledEvent(sent)).toMatchObject({ action: { type: "HELPER_REPLIED" } });

    const replied = settle(sent);
    expect(replied.messages.map((m) => m.from)).toEqual(["helper", "me", "helper"]);
    expect(hasExchangedMessages(replied)).toBe(true);
    expect(requesterReducer(replied, { type: "MARK_COMPLETE" }).phase).toBe("complete");
  });

  it("完了を確定するとポイントが付き、練習を終えられる", () => {
    const complete = run([
      { type: "SET_TITLE", title: "電球" },
      { type: "SET_MINUTES", minutes: 60 },
      { type: "POST_REQUEST" },
      { type: "APPLICANT_ARRIVED" },
      { type: "OPEN_APPLICANTS" },
      { type: "SELECT_HELPER" },
      { type: "SEND_MESSAGE", text: "10時" },
      { type: "HELPER_REPLIED" },
      { type: "MARK_COMPLETE" },
      { type: "SET_RATING", rating: 7 },
    ]);
    expect(complete.phase).toBe("complete");
    expect(complete.rating).toBe(5); // 5 が上限
    const reward = requesterReducer(complete, { type: "CONFIRM_COMPLETE" });
    expect(reward.phase).toBe("reward");
    expect(rewardPoints(reward)).toBe(50 + 60);
    expect(requesterReducer(reward, { type: "FINISH" }).phase).toBe("done");
  });

  it("案内文は段階ごとに 1〜6 の番号で進む", () => {
    const states = [
      initialRequesterState,
      run([{ type: "SET_TITLE", title: "a" }, { type: "POST_REQUEST" }]),
      run([{ type: "SET_TITLE", title: "a" }, { type: "POST_REQUEST" }, { type: "APPLICANT_ARRIVED" }, { type: "OPEN_APPLICANTS" }]),
    ];
    expect(states.map((s) => coachFor(s).step)).toEqual([1, 2, 3]);
    expect(coachFor(states[0]).total).toBe(6);
  });

  it("段階に合わない操作は無視される", () => {
    const waiting = run([{ type: "SET_TITLE", title: "a" }, { type: "POST_REQUEST" }]);
    expect(requesterReducer(waiting, { type: "SET_TITLE", title: "変更" }).title).toBe("a");
    expect(requesterReducer(waiting, { type: "SELECT_HELPER" }).phase).toBe("waiting");
    expect(requesterReducer(waiting, { type: "FINISH" }).phase).toBe("waiting");
  });
});
