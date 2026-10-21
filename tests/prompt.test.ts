import { describe, expect, it } from "vitest";
import { buildQuestions } from "../src/background/jev";
import { DEFAULT_PROMPT, PROMPT_PRESETS, presetById, presetNameFor } from "../src/shared/prompt";
import { DEFAULT_SETTINGS } from "../src/shared/settings";

describe("prompt presets", () => {
  it("are all complete sentences with ids the options UI can look up", () => {
    for (const p of PROMPT_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.instructions.trim().length).toBeGreaterThan(20);
      expect(p.criteriaTrue.trim().length).toBeGreaterThan(20);
      expect(p.criteriaFalse.trim().length).toBeGreaterThan(20);
      expect(presetById(p.id)).toBe(p);
    }
  });

  it("are what a fresh install starts with", () => {
    expect(DEFAULT_PROMPT).toEqual({
      instructions: PROMPT_PRESETS[0]!.instructions,
      criteriaTrue: PROMPT_PRESETS[0]!.criteriaTrue,
      criteriaFalse: PROMPT_PRESETS[0]!.criteriaFalse,
    });
    expect({
      instructions: DEFAULT_SETTINGS.promptInstructions,
      criteriaTrue: DEFAULT_SETTINGS.promptCriteriaTrue,
      criteriaFalse: DEFAULT_SETTINGS.promptCriteriaFalse,
    }).toEqual(DEFAULT_PROMPT);
  });

  it("name the preset a saved prompt came from, and say custom after an edit", () => {
    expect(presetNameFor(DEFAULT_PROMPT)).toBe("balanced");
    expect(presetNameFor({ ...DEFAULT_PROMPT, criteriaTrue: "Only pages about the thesis." })).toBe("custom");
  });
});

describe("buildQuestions", () => {
  it("passes the stored words through as the noul question", () => {
    const prompt = { instructions: "Is this page mine?", criteriaTrue: "Yes means mine", criteriaFalse: "No means not" };
    expect(buildQuestions(prompt)).toEqual({
      matches_intention: { type: "noul", instructions: "Is this page mine?", criteria: { true: "Yes means mine", false: "No means not" } },
    });
  });

  it("says a search page is a match, so ambiguity is not a block", () => {
    expect(DEFAULT_PROMPT.criteriaTrue).toMatch(/search/i);
    expect(DEFAULT_PROMPT.criteriaTrue).toMatch(/both ways/);
  });
});
