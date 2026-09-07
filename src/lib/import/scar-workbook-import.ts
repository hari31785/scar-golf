/**
 * Pure classification/parsing logic for the SCAR historical Excel
 * workbook import.
 *
 * This module is intentionally framework/DB-free (no `@/db`,
 * `drizzle-orm`, or Node `fs` imports) so it can be unit tested in
 * isolation and reasoned about independently of how the workbook is
 * actually read off disk (see src/lib/import/read-workbook.ts for the
 * exceljs-based I/O layer that produces `RawWorkbookRow[]` for this
 * module to classify).
 *
 * WORKBOOK SHAPE (confirmed by direct inspection of the real source
 * file — see import-data/):
 *
 *   Row 1: a "Handicap" summary row (spreadsheet formulas only) — never
 *          a candidate data row.
 *   Row 2: column headers ("Date","Course","Score","Rating","Slope",
 *          "Differential","City") — never a candidate data row.
 *   Rows 3..N: the spreadsheet's fixed calculation window. Real rounds
 *          have Date + Course populated. Once a player has fewer than
 *          20 real rounds, the remaining rows in this window are
 *          SYNTHETIC PADDING — Date and Course are blank, but
 *          Score/Rating/Slope duplicate an earlier row (almost always
 *          that player's highest gross score) so the old spreadsheet's
 *          fixed SMALL()/AVERAGE() formulas always had 20 rows to read.
 *   A "Historic Scores" label row + its own header row, followed by
 *          additional real rounds (older rounds that fall outside the
 *          spreadsheet's fixed current-20 window) — real rounds here
 *          follow the same Date+Course pattern.
 *   Trailing blank rows — ignored.
 *
 * Synthetic padding rows must NEVER become `played_rounds` — our own
 * handicap engine (src/lib/handicap/calculate.ts) recomputes padding
 * itself, in memory only, at calculation time.
 */

/** One candidate row read from a player's sheet, before classification. */
export type RawWorkbookRow = {
  /** The sheet name (e.g. "Sri"), identifying the player. */
  sheetName: string;
  /** 1-based row number within the sheet, for traceability. */
  rowIndex: number;
  /** Raw "Date" cell value — a Date, an Excel serial number, or blank. */
  date: unknown;
  /** Raw "Course" cell value. */
  course: unknown;
  /** Raw "Score" cell value. */
  score: unknown;
  /** Raw "Rating" cell value. */
  rating: unknown;
  /** Raw "Slope" cell value. */
  slope: unknown;
  /** Raw "City" cell value (optional column). */
  city: unknown;
};

export type RowClassification =
  | "REAL"
  | "SYNTHETIC_PADDING"
  | "IGNORED"
  | "AMBIGUOUS";

export type ClassifiedRow = {
  classification: RowClassification;
  row: RawWorkbookRow;
  reason: string;
};

/** A single real played round, parsed and ready to insert into `played_rounds`. */
export type ParsedRealRound = {
  /** The player sheet this row came from; resolved to a member elsewhere. */
  sourceSheetName: string;
  playedAt: Date;
  courseName: string;
  courseCity?: string;
  grossScore: number;
  courseRating: number;
  slope: number;
  /** Deterministic traceability reference — see `buildSourceRef`. */
  sourceRef: string;
};

export type SheetParseResult = {
  sheetName: string;
  totalCandidateRows: number;
  real: ParsedRealRound[];
  syntheticPaddingCount: number;
  ignoredCount: number;
  ambiguous: { row: RawWorkbookRow; reason: string }[];
};

export type ParsedWorkbookResult = {
  sheets: SheetParseResult[];
};

/** True for null/undefined/whitespace-only-string values. */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

/**
 * Parses a value that should be a finite number. Accepts real numbers
 * and numeric strings (e.g. "72.7"); rejects NaN/Infinity/blank/objects.
 */
export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Excel's date system epoch: serial 0 == 1899-12-30 (accounting for the leap-year bug). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/**
 * Safely normalizes a raw "Date" cell value into a JS `Date`, or `null`
 * if the value is blank/invalid. Handles the two shapes we actually see:
 *  - a native JS `Date` (what exceljs gives us for date-formatted cells)
 *  - a numeric Excel serial date (fallback, in case a cell wasn't
 *    formatted as a date)
 * Never guesses/invents a date for blank values.
 */
export function normalizeExcelDate(value: unknown): Date | null {
  if (isBlank(value)) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = EXCEL_EPOCH_MS + value * 24 * 60 * 60 * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Deterministic, idempotency-friendly traceability reference for a
 * workbook row. Stable across re-reads of the same workbook file since
 * it only depends on the workbook's display name, sheet name, and Excel
 * row number — never on parsed content.
 */
export function buildSourceRef(
  workbookName: string,
  sheetName: string,
  rowIndex: number
): string {
  return `historical-import:${workbookName}:${sheetName}:r${rowIndex}`;
}

/**
 * Classifies a single candidate row as REAL, SYNTHETIC_PADDING, IGNORED,
 * or AMBIGUOUS. Pure function — never reads a file, never throws for
 * "normal" bad data (ambiguous rows are reported, not thrown).
 */
export function classifyWorkbookRow(row: RawWorkbookRow): ClassifiedRow {
  const date = normalizeExcelDate(row.date);
  const course = isBlank(row.course) ? null : String(row.course).trim();
  const score = toFiniteNumber(row.score);
  const rating = toFiniteNumber(row.rating);
  const slope = toFiniteNumber(row.slope);

  const hasAnySignal =
    date !== null ||
    course !== null ||
    score !== null ||
    rating !== null ||
    slope !== null;

  if (!hasAnySignal) {
    return { classification: "IGNORED", row, reason: "Blank row" };
  }

  const hasCoreNumbers = score !== null && rating !== null && slope !== null;
  const hasDateAndCourse = date !== null && course !== null;
  const hasNoDateAndNoCourse = date === null && course === null;

  // Reject non-sane numeric ranges outright as ambiguous rather than
  // silently importing garbage (e.g. a stray label or typo).
  const numbersInSaneRange =
    !hasCoreNumbers ||
    (score! > 0 &&
      score! < 250 &&
      rating! > 40 &&
      rating! < 90 &&
      slope! >= 55 &&
      slope! <= 155);

  if (hasDateAndCourse && hasCoreNumbers && numbersInSaneRange) {
    return {
      classification: "REAL",
      row,
      reason: "Has a played date, course, and valid score/rating/slope",
    };
  }

  if (hasNoDateAndNoCourse && hasCoreNumbers && numbersInSaneRange) {
    return {
      classification: "SYNTHETIC_PADDING",
      row,
      reason:
        "No date/course but has score/rating/slope — matches the spreadsheet's synthetic padding pattern",
    };
  }

  // Anything else is a genuine mismatch we should not guess about.
  const reasonParts: string[] = [];
  if (date === null && course !== null) reasonParts.push("has a course but no valid date");
  if (date !== null && course === null) reasonParts.push("has a date but no course");
  if (!hasCoreNumbers) reasonParts.push("missing or invalid score/rating/slope");
  if (hasCoreNumbers && !numbersInSaneRange)
    reasonParts.push("score/rating/slope outside a sane range");

  return {
    classification: "AMBIGUOUS",
    row,
    reason:
      reasonParts.length > 0
        ? `Ambiguous: ${reasonParts.join("; ")}`
        : "Ambiguous: does not match the REAL or SYNTHETIC_PADDING pattern",
  };
}

/**
 * Classifies and parses every candidate row for a single player sheet.
 * Pure function — takes already-extracted raw rows (see
 * src/lib/import/read-workbook.ts for the I/O layer that produces
 * these) and never touches a file or the network.
 */
export function parseWorksheetRows(
  workbookName: string,
  sheetName: string,
  rows: RawWorkbookRow[]
): SheetParseResult {
  const result: SheetParseResult = {
    sheetName,
    totalCandidateRows: rows.length,
    real: [],
    syntheticPaddingCount: 0,
    ignoredCount: 0,
    ambiguous: [],
  };

  for (const row of rows) {
    const classified = classifyWorkbookRow(row);
    switch (classified.classification) {
      case "REAL": {
        const date = normalizeExcelDate(row.date)!;
        const course = String(row.course).trim();
        const city = isBlank(row.city) ? undefined : String(row.city).trim();
        result.real.push({
          sourceSheetName: sheetName,
          playedAt: date,
          courseName: course,
          courseCity: city,
          grossScore: toFiniteNumber(row.score)!,
          courseRating: toFiniteNumber(row.rating)!,
          slope: toFiniteNumber(row.slope)!,
          sourceRef: buildSourceRef(workbookName, sheetName, row.rowIndex),
        });
        break;
      }
      case "SYNTHETIC_PADDING":
        result.syntheticPaddingCount += 1;
        break;
      case "IGNORED":
        result.ignoredCount += 1;
        break;
      case "AMBIGUOUS":
        result.ambiguous.push({ row, reason: classified.reason });
        break;
    }
  }

  return result;
}

/**
 * Detects duplicate `sourceRef` values across an already-parsed set of
 * real rounds. Should always be empty in practice (refs are derived
 * from unique sheet+row pairs) — this is a defensive safety check
 * required before any real DB write.
 */
export function findDuplicateSourceRefs(rounds: ParsedRealRound[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const r of rounds) {
    if (seen.has(r.sourceRef)) {
      duplicates.add(r.sourceRef);
    } else {
      seen.add(r.sourceRef);
    }
  }
  return [...duplicates];
}
