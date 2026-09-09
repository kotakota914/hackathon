import { describe, expect, it } from "vitest";

import {
  REQUESTER_GREETING,
  SUGGESTED_REQUEST_ID,
  coachFor,
  hasExchangedMessages,
  helperReducer,
  initialHelperState,
  rewardPoints,
  scheduledEvent,
  selectedRequest,
  type HelperAction,
  type HelperState,
} from "./helper";

function run(actions: HelperAction[], from: HelperState = initialHelperState): HelperState {
  return actions.reduce(helperReducer, from);
}

function settle(state: HelperState): HelperState {
  let current = state;
  for (let i = 0; i < 5; i += 1) {
    const event = scheduledEvent(current);
    if (!event) break;
    current = helperReducer(current, event.action);
  }
  return current;
}

describe("練習モード 支援者編", () => {
  it("依頼を開くと内容が見え、一覧に戻れる", () => {
    const detail = run([{ type: "OPEN_REQUEST", id: SUGGESTED_REQUEST_ID }]);
    expect(detail.phase).toBe("detail");
    expect(selectedRequest(detail)?.title).toBe("電球を交換してほしい");
    expect(run([{ type: "BACK_TO_LIST" }], detail).phase).toBe("browse");
    // 存在しない依頼は開けない
    expect(run([{ type: "OPEN_REQUEST", id: "nope" }]).phase).toBe("browse");
  });

  it("応募すると少し待って選ばれ、トークを開ける", () => {
    const applied = run([{ type: "OPEN_REQUEST", id: "r2" }, { type: "APPLY" }]);
    expect(applied.phase).toBe("applied");
    expect(scheduledEvent(applied)).toMatchObject({ action: { type: "CHOSEN" } });
    expect(helperReducer(applied, { type: "OPEN_CHAT" }).phase).toBe("applied");
    const chosen = settle(applied);
    expect(chosen.chosen).toBe(true);
    const chat = helperReducer(chosen, { type: "OPEN_CHAT" });
    expect(chat.phase).toBe("chat");
    expect(chat.messages).toEqual([{ from: "requester", text: REQUESTER_GREETING }]);
  });

  it("返事を送ると相手が返し、一往復してから完了報告へ進める", () => {
    const chat = run([
      { type: "OPEN_REQUEST", id: "r1" },
      { type: "APPLY" },
      { type: "CHOSEN" },
      { type: "OPEN_CHAT" },
    ]);
    expect(helperReducer(chat, { type: "FINISH_HELP" }).phase).toBe("chat");
    const sent = helperReducer(chat, { type: "SEND_MESSAGE", text: "10時に伺います" });
    expect(sent.awaitingReply).toBe(true);
    expect(helperReducer(sent, { type: "SEND_MESSAGE", text: "二重" }).messages).toHaveLength(2);
    const replied = settle(sent);
    expect(hasExchangedMessages(replied)).toBe(true);
    const report = helperReducer(replied, { type: "FINISH_HELP" });
    expect(report.phase).toBe("report");
    const reward = helperReducer(report, { type: "CONFIRM_REPORT" });
    expect(reward.phase).toBe("reward");
    expect(rewardPoints(reward)).toBe(50 + 15);
    expect(helperReducer(reward, { type: "FINISH" }).phase).toBe("done");
  });

  it("案内文は 1〜6 の番号で進む", () => {
    const applied = run([{ type: "OPEN_REQUEST", id: "r1" }, { type: "APPLY" }]);
    expect(coachFor(initialHelperState).step).toBe(1);
    expect(coachFor(run([{ type: "OPEN_REQUEST", id: "r1" }])).step).toBe(2);
    expect(coachFor(applied).step).toBe(3);
    expect(coachFor(applied).total).toBe(6);
  });
});
