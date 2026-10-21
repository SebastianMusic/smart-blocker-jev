/** The yes/no question asked about every page, as plain editable text. */
export interface PromptText {
  instructions: string;
  criteriaTrue: string;
  criteriaFalse: string;
}

export interface PromptPreset extends PromptText {
  id: string;
  label: string;
}

const QUESTION =
  "Is visiting the web page described in `page` consistent with `user_intention`, " +
  "the user's own statement of how they want to use the internet right now?";

/** Ordered: the first is the default. */
export const PROMPT_PRESETS: readonly PromptPreset[] = [
  {
    id: "balanced",
    label: "Balanced (default)",
    instructions: QUESTION,
    criteriaTrue:
      "The page serves what the user intends to do, or is a neutral step toward it. Neutral steps count as true: " +
      "search pages and search results, site search boxes, listings, category, comparison and pricing pages, " +
      "documentation and help indexes, logins, and tools a person would plausibly use while doing this. " +
      "Those pages often lead both ways — the user may find what they wanted and may not — and that is not a reason " +
      "to answer false. Judge whether a person with this intention would plausibly open the page, not what they " +
      "end up doing on it.",
    criteriaFalse:
      "The page has nothing to do with what the user intends, or pulls them away from it in a way they have said " +
      "they want to avoid. Being entertaining, habit-forming, or a site the user tends to waste time on is not in " +
      "itself a reason for false: the page itself has to be unrelated to the intention.",
  },
  {
    id: "lenient",
    label: "Lenient — show navigation and search pages",
    instructions: QUESTION,
    criteriaTrue:
      "Answer true unless the page is clearly about something other than the intention. Search pages, results, " +
      "listings, comparison pages, logins, references, tools, news sites and home pages are true, including ones " +
      "that could equally lead somewhere the user does not intend — when in doubt, answer true. The user blocks " +
      "specific sites with their own lists, so do not block on suspicion.",
    criteriaFalse:
      "Answer false only when the page is plainly about something the user is not here for: another subject, " +
      "another site's content, or entertainment with no connection to the intention.",
  },
  {
    id: "strict",
    label: "Strict — only pages about the intention",
    instructions: QUESTION,
    criteriaTrue:
      "Answer true only when the page is about the intention itself or moves a named part of it forward: the file, " +
      "document, thread, person, place, tool or task the intention is about. A search page, listing, home page, or " +
      "site the user visits for many reasons is true only when the query, the page or the site is specific to this " +
      "intention.",
    criteriaFalse:
      "The page is generic, about an unrelated subject, or the kind of page the user opens out of habit. If you " +
      "cannot point at the part of the intention the page serves, answer false.",
  },
];

export const DEFAULT_PROMPT: PromptText = {
  instructions: PROMPT_PRESETS[0]!.instructions,
  criteriaTrue: PROMPT_PRESETS[0]!.criteriaTrue,
  criteriaFalse: PROMPT_PRESETS[0]!.criteriaFalse,
};

export const presetById = (id: string): PromptPreset | undefined => PROMPT_PRESETS.find((p) => p.id === id);

/** Which preset these exact words come from, "custom" when they match none. */
export const presetNameFor = (p: PromptText): string =>
  PROMPT_PRESETS.find(
    (x) =>
      x.instructions === p.instructions && x.criteriaTrue === p.criteriaTrue && x.criteriaFalse === p.criteriaFalse,
  )?.id ?? "custom";
