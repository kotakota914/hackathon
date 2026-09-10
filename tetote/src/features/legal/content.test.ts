import { describe, expect, it } from "vitest";

import { HELP, LEGAL_DOCUMENTS, PRIVACY, TERMS } from "./content";

describe("利用規約・プライバシーポリシー・ヘルプの本文", () => {
  it("3 つの文書があり、見出しと本文がそろっている", () => {
    expect(Object.keys(LEGAL_DOCUMENTS)).toEqual(["terms", "privacy", "help"]);
    for (const doc of [TERMS, PRIVACY, HELP]) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.sections.length).toBeGreaterThanOrEqual(5);
      for (const section of doc.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.body.length).toBeGreaterThan(0);
        for (const line of section.body) expect(line.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("プライバシーポリシーは、実際に使っている外部サービスと退会時の扱いに触れている", () => {
    const text = PRIVACY.sections.flatMap((s) => s.body).join("\n");
    for (const word of ["Vercel", "Supabase", "SuperTokens", "退会", "現在地", "匿名化"]) {
      expect(text).toContain(word);
    }
  });

  it("利用規約は禁止事項と免責と退会の章を持つ", () => {
    const headings = TERMS.sections.map((s) => s.heading);
    expect(headings.some((h) => h.includes("禁止"))).toBe(true);
    expect(headings.some((h) => h.includes("免責"))).toBe(true);
    expect(headings.some((h) => h.includes("退会"))).toBe(true);
  });
});
