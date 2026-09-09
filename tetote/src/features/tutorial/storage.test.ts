import { afterEach, describe, expect, it } from "vitest";

import { hasCompletedTutorial, markTutorialCompleted, resetTutorial } from "./storage";

describe("練習モードの完了記録", () => {
  afterEach(() => {
    resetTutorial("requester");
    resetTutorial("helper");
  });

  it("最初は未完了で、終えると完了になり、役割ごとに別に数える", () => {
    expect(hasCompletedTutorial("requester")).toBe(false);
    markTutorialCompleted("requester");
    expect(hasCompletedTutorial("requester")).toBe(true);
    expect(hasCompletedTutorial("helper")).toBe(false);
  });

  it("記録を消すと、もう一度体験できる", () => {
    markTutorialCompleted("helper");
    resetTutorial("helper");
    expect(hasCompletedTutorial("helper")).toBe(false);
  });
});
