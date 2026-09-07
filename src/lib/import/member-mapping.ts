/**
 * Explicit mapping from workbook player-sheet names to `public.members`
 * display names. Deliberately hardcoded (not inferred/fuzzy-matched) —
 * see AGENTS/user instructions: do not invent emails, do not silently
 * skip a workbook member's data if they're missing from the database.
 */
export const SHEET_TO_MEMBER_NAME: Record<string, string> = {
  Sri: "Srikanth Mamidala",
  CTR: "Chandra Teja Reddy",
  Adi: "Adithya Bommaraju",
  Rahul: "Rahul Gollapudi",
  Geo: "George Thomas",
  Deepu: "Deepak Bommaraju",
  Ajay: "Ajay Veerapaneni",
  Sashi: "Sashi Ravipati",
  Hari: "Hari Kurada",
  Zach: "Zachary Paradise",
};

export const PLAYER_SHEET_NAMES = Object.keys(SHEET_TO_MEMBER_NAME);

/**
 * Known display-name aliases used elsewhere in the workbook (e.g. the
 * "Handicap Summary" sheet) that refer to the SAME person as a mapped
 * member name, but are spelled slightly differently. This is purely a
 * reconciliation/lookup aid — it must NEVER be used to rename a member
 * record, and it must NEVER be used to resolve a member for import
 * purposes (only `SHEET_TO_MEMBER_NAME` + `namesMatch` against real
 * `members.displayName` rows does that).
 */
const HANDICAP_SUMMARY_NAME_ALIASES: Record<string, string> = {
  "Ajay Sai Veerapaneni": "Ajay Veerapaneni",
};

/**
 * Resolves a name as it appears on the workbook's "Handicap Summary"
 * sheet to the corresponding mapped member name, applying known aliases
 * first. Used only for reconciliation lookups.
 */
export function resolveHandicapSummaryAlias(name: string): string {
  const trimmed = name.trim();
  return HANDICAP_SUMMARY_NAME_ALIASES[trimmed] ?? trimmed;
}

/** Case/whitespace-insensitive display-name match against `members.displayName`. */
export function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
