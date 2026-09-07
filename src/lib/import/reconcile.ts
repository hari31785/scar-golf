/**
 * Reconciliation between our new handicap engine and the workbook's own
 * (spreadsheet-formula) computed handicap, for one player. Pure —
 * depends only on the handicap engine and plain data, so it's unit
 * testable without a workbook or DB.
 */
import {
  calculateHandicap,
  type ActualRound,
  type HandicapCalculationResult,
} from "@/lib/handicap/calculate";
import type { ParsedRealRound } from "./scar-workbook-import";

export type ReconciliationEntry = {
  sheetName: string;
  memberDisplayName: string;
  actualRoundsParsed: number;
  earliestRealRound: Date | null;
  latestRealRound: Date | null;
  engineResult: HandicapCalculationResult;
  workbookHandicapIndex: number | null;
  workbookRoundedHandicap: number | null;
  match: boolean | null; // null when workbook value unavailable
  explanation: string;
};

function toActualRounds(rounds: ParsedRealRound[]): ActualRound[] {
  return rounds.map((r, i) => ({
    id: r.sourceRef ?? `${r.sourceSheetName}-${i}`,
    playedAt: r.playedAt,
    grossScore: r.grossScore,
    courseRating: r.courseRating,
    slope: r.slope,
  }));
}

export function reconcilePlayer(params: {
  sheetName: string;
  memberDisplayName: string;
  realRounds: ParsedRealRound[];
  workbookHandicapIndex: number | null;
  workbookRoundedHandicap: number | null;
  maxHandicap?: number;
}): ReconciliationEntry {
  const {
    sheetName,
    memberDisplayName,
    realRounds,
    workbookHandicapIndex,
    workbookRoundedHandicap,
    maxHandicap,
  } = params;

  const actualRounds = toActualRounds(realRounds);
  const engineResult = calculateHandicap(actualRounds, { maxHandicap });

  const dates = realRounds.map((r) => r.playedAt.getTime());
  const earliestRealRound = dates.length ? new Date(Math.min(...dates)) : null;
  const latestRealRound = dates.length ? new Date(Math.max(...dates)) : null;

  let match: boolean | null = null;
  let explanation: string;

  if (workbookRoundedHandicap === null) {
    explanation =
      "No workbook handicap value available for this player — cannot compare (likely a name-matching gap, e.g. the workbook uses a fuller/different name than our member mapping).";
  } else if (engineResult.finalHandicap === workbookRoundedHandicap) {
    match = true;
    explanation = "Matches the workbook's rounded/capped handicap exactly.";
  } else if (engineResult.roundedHandicap === workbookRoundedHandicap) {
    match = false;
    explanation = `Our uncapped rounded handicap (${engineResult.roundedHandicap}) matches the workbook's value exactly — the difference is solely because our engine applies the configured max-handicap cap (${engineResult.maxHandicap}) and the old spreadsheet did not apply any cap.`;
  } else {
    match = false;
    const paddingNote =
      engineResult.paddingRoundsAdded.length > 0
        ? ` Our engine added ${engineResult.paddingRoundsAdded.length} padding round(s) copying the highest-gross real round; the old spreadsheet's fixed padding rows sometimes duplicated a mismatched rating/slope for the same padded score, which can shift the result.`
        : "";
    const historicNote =
      " The workbook also splits rounds across a fixed 'current 20' window and a separate 'Historic Scores' section; our engine instead selects the true most-recent 20 by played date across all real rounds, which can differ from the spreadsheet's manually-curated window if it wasn't kept perfectly up to date.";
    explanation = `Our final handicap (${engineResult.finalHandicap}) differs from the workbook's (${workbookRoundedHandicap}).${paddingNote}${historicNote}`;
  }

  return {
    sheetName,
    memberDisplayName,
    actualRoundsParsed: realRounds.length,
    earliestRealRound,
    latestRealRound,
    engineResult,
    workbookHandicapIndex,
    workbookRoundedHandicap,
    match,
    explanation,
  };
}
