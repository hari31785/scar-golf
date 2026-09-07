/**
 * exceljs-based I/O layer for reading the real SCAR historical
 * workbook off disk. Kept separate from scar-workbook-import.ts so the
 * classification/parsing logic there stays pure and unit-testable
 * without touching the filesystem or the exceljs library.
 *
 * Not tagged "server-only" — this must also run from plain Node/tsx
 * scripts (see scripts/import-history.ts), which the "server-only"
 * guard would break (see src/db/script-client.ts for the same pattern
 * applied to the DB client).
 */
import ExcelJS from "exceljs";
import path from "node:path";
import type { RawWorkbookRow } from "./scar-workbook-import";
import { PLAYER_SHEET_NAMES } from "./member-mapping";

export type WorkbookHandicapSummaryEntry = {
  displayName: string;
  /** The raw (unrounded) "Handicap Index" formula result. */
  handicapIndex: number | null;
  /** The ROUNDUP'd whole-number handicap column. */
  roundedHandicap: number | null;
};

export type ReadWorkbookResult = {
  workbookName: string;
  /** Raw candidate rows per player sheet, keyed by sheet name. */
  rowsBySheet: Record<string, RawWorkbookRow[]>;
  /** Sheets requested that were not found in the workbook. */
  missingSheets: string[];
  /** The workbook's own "Handicap Summary" sheet, parsed for reconciliation. */
  handicapSummary: WorkbookHandicapSummaryEntry[];
};

/** Resolves a possibly-formula exceljs cell value down to a plain primitive. */
function cellPrimitive(value: unknown): unknown {
  if (value && typeof value === "object" && "result" in value) {
    return (value as { result: unknown }).result;
  }
  return value;
}

function rowValues(
  row: ExcelJS.Row
): [unknown, unknown, unknown, unknown, unknown, unknown, unknown] {
  // Column order confirmed by inspection: Date, Course, Score, Rating,
  // Slope, Differential (ignored — we recompute it ourselves), City.
  return [
    cellPrimitive(row.getCell(1).value),
    cellPrimitive(row.getCell(2).value),
    cellPrimitive(row.getCell(3).value),
    cellPrimitive(row.getCell(4).value),
    cellPrimitive(row.getCell(5).value),
    cellPrimitive(row.getCell(6).value),
    cellPrimitive(row.getCell(7).value),
  ];
}

function isHeaderRow(colA: unknown): boolean {
  return typeof colA === "string" && colA.trim() === "Date";
}

function isSectionLabelRow(colA: unknown): boolean {
  return typeof colA === "string" && colA.trim() === "Historic Scores";
}

/** Extracts candidate rows (everything except row 1, header rows, and section-label rows) from one player sheet. */
function extractSheetRows(sheetName: string, sheet: ExcelJS.Worksheet): RawWorkbookRow[] {
  const out: RawWorkbookRow[] = [];
  const maxRow = sheet.rowCount;
  for (let r = 2; r <= maxRow; r++) {
    // Row 1 (the "Handicap" summary formula row) is always skipped.
    const row = sheet.getRow(r);
    const [date, course, score, rating, slope, , city] = rowValues(row);

    if (isHeaderRow(date)) continue; // repeated column-header row
    if (isSectionLabelRow(date)) continue; // "Historic Scores" label row

    out.push({
      sheetName,
      rowIndex: r,
      date,
      course,
      score,
      rating,
      slope,
      city,
    });
  }
  return out;
}

/** Parses the "Handicap Summary" sheet for cross-checking against our engine's output. */
function extractHandicapSummary(
  workbook: ExcelJS.Workbook
): WorkbookHandicapSummaryEntry[] {
  const sheet = workbook.getWorksheet("Handicap Summary");
  if (!sheet) return [];

  const out: WorkbookHandicapSummaryEntry[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = cellPrimitive(row.getCell(1).value);
    const handicapIndexRaw = cellPrimitive(row.getCell(2).value);
    const roundedRaw = cellPrimitive(row.getCell(3).value);
    if (typeof name !== "string" || name.trim().length === 0) continue;

    out.push({
      displayName: name.trim(),
      handicapIndex:
        typeof handicapIndexRaw === "number" ? handicapIndexRaw : null,
      roundedHandicap: typeof roundedRaw === "number" ? roundedRaw : null,
    });
  }
  return out;
}

/**
 * Reads the real SCAR historical workbook off disk and extracts raw
 * candidate rows for every known player sheet, plus the workbook's own
 * "Handicap Summary" sheet for reconciliation. Does no classification —
 * see `parseWorksheetRows` in scar-workbook-import.ts for that.
 */
export async function readScarWorkbook(
  filePath: string
): Promise<ReadWorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const rowsBySheet: Record<string, RawWorkbookRow[]> = {};
  const missingSheets: string[] = [];

  for (const sheetName of PLAYER_SHEET_NAMES) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      missingSheets.push(sheetName);
      continue;
    }
    rowsBySheet[sheetName] = extractSheetRows(sheetName, sheet);
  }

  return {
    workbookName: path.basename(filePath),
    rowsBySheet,
    missingSheets,
    handicapSummary: extractHandicapSummary(workbook),
  };
}
