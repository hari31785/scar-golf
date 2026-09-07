/**
 * CLI: SCAR historical workbook import — dry-run + reconciliation +
 * (guarded) partial commit.
 *
 * Usage:
 *   npm run import:history -- --dry-run
 *   npm run import:history -- --commit --i-have-reviewed-the-dry-run
 *
 * PARTIAL IMPORT DESIGN
 *
 * Not every workbook player currently resolves to a `public.members`
 * row (some are intentionally deferred — see member-mapping.ts). This
 * script is designed to safely import ONLY resolved players:
 *
 *   - Unresolved sheets are skipped without error and clearly reported
 *     (never a hard failure, never a blocking gate condition).
 *   - Their historical rows are left completely untouched in the
 *     workbook and simply re-parsed (and re-skipped) on every future
 *     run, until a matching member exists.
 *   - Real rounds get a deterministic `sourceRef` (workbook + sheet +
 *     row) and `played_rounds.source_ref` has a UNIQUE index, so the
 *     insert step uses `onConflictDoNothing` — safe to re-run any
 *     number of times, and safe to run again later after more members
 *     are added: only the NEW resolved players' NEW rows get inserted,
 *     existing rows are left alone (no duplication).
 *
 * IMPORT SAFETY
 *
 * `--commit` mode is fully implemented below (`commitImport`), but this
 * script will only actually invoke it when BOTH `--commit` AND the
 * explicit `--i-have-reviewed-the-dry-run` flag are passed together.
 * This is a deliberate two-flag guard so a plain `--commit` invocation
 * (e.g. muscle memory, tab-completion, or a copy-pasted dry-run command
 * with the flag swapped) can never silently write to the database.
 */
import path from "node:path";
import { scriptDb } from "@/db/script-client";
import { members } from "@/db/schema/members";
import { playedRounds, type NewPlayedRound } from "@/db/schema/rounds";
import { readScarWorkbook } from "@/lib/import/read-workbook";
import {
  parseWorksheetRows,
  findDuplicateSourceRefs,
  type ParsedRealRound,
} from "@/lib/import/scar-workbook-import";
import {
  SHEET_TO_MEMBER_NAME,
  namesMatch,
  resolveHandicapSummaryAlias,
} from "@/lib/import/member-mapping";
import { reconcilePlayer } from "@/lib/import/reconcile";
import { getMaxHandicapForScript } from "@/lib/import/max-handicap-script";

const WORKBOOK_PATH = path.resolve(
  process.cwd(),
  "import-data/Scar handicap calculator and historic scores.xlsx"
);

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

type PlayerReport = {
  sheetName: string;
  mappedName: string;
  memberId: string | null;
  totalCandidateRows: number;
  realCount: number;
  syntheticPaddingCount: number;
  ignoredCount: number;
  ambiguousCount: number;
  ambiguousDetails: { rowIndex: number; reason: string }[];
  earliest: Date | null;
  latest: Date | null;
  realRounds: ParsedRealRound[];
};

async function commitImport(
  resolved: PlayerReport[]
): Promise<{ inserted: number; skippedExisting: number }> {
  const rowsToInsert: NewPlayedRound[] = resolved.flatMap((r) =>
    r.realRounds.map(
      (round): NewPlayedRound => ({
        memberId: r.memberId!,
        playedAt: round.playedAt,
        courseName: round.courseName,
        courseCity: round.courseCity,
        grossScore: round.grossScore,
        courseRating: round.courseRating,
        slope: round.slope,
        source: "HISTORICAL_IMPORT",
        importedAt: new Date(),
        sourceRef: round.sourceRef,
      })
    )
  );

  if (rowsToInsert.length === 0) {
    return { inserted: 0, skippedExisting: 0 };
  }

  // onConflictDoNothing on the unique source_ref index makes this safe
  // to re-run: rows already imported (from a prior partial run) are
  // silently left alone, never duplicated or overwritten.
  const before = await scriptDb.$count(playedRounds);
  await scriptDb
    .insert(playedRounds)
    .values(rowsToInsert)
    .onConflictDoNothing({ target: playedRounds.sourceRef });
  const after = await scriptDb.$count(playedRounds);

  const inserted = after - before;
  return { inserted, skippedExisting: rowsToInsert.length - inserted };
}

async function main() {
  const args = process.argv.slice(2);
  const isCommitRequested = args.includes("--commit");
  const hasReviewedFlag = args.includes("--i-have-reviewed-the-dry-run");
  const willActuallyCommit = isCommitRequested && hasReviewedFlag;

  console.log("=".repeat(78));
  console.log(
    "SCAR HISTORICAL WORKBOOK IMPORT —",
    willActuallyCommit ? "COMMIT MODE" : "DRY RUN"
  );
  console.log("=".repeat(78));
  console.log(`Workbook: ${WORKBOOK_PATH}`);

  const workbook = await readScarWorkbook(WORKBOOK_PATH);
  console.log(
    `Workbook read OK. Sheets found: ${Object.keys(workbook.rowsBySheet).length}/${Object.keys(SHEET_TO_MEMBER_NAME).length} expected player sheets.`
  );
  if (workbook.missingSheets.length > 0) {
    console.log("⚠️  Missing sheets in workbook:", workbook.missingSheets.join(", "));
  }

  const dbMembers = await scriptDb
    .select({ id: members.id, displayName: members.displayName, status: members.status })
    .from(members);

  const maxHandicap = await getMaxHandicapForScript();

  const reports: PlayerReport[] = [];
  let totalReal = 0;
  let totalPadding = 0;
  let totalIgnored = 0;
  let totalAmbiguous = 0;

  for (const [sheetName, mappedName] of Object.entries(SHEET_TO_MEMBER_NAME)) {
    const rows = workbook.rowsBySheet[sheetName];
    if (!rows) continue; // reported above as a missing sheet

    const parsed = parseWorksheetRows(workbook.workbookName, sheetName, rows);
    const matchedMember = dbMembers.find((m) => namesMatch(m.displayName, mappedName));

    const dates = parsed.real.map((r) => r.playedAt.getTime());
    reports.push({
      sheetName,
      mappedName,
      memberId: matchedMember?.id ?? null,
      totalCandidateRows: parsed.totalCandidateRows,
      realCount: parsed.real.length,
      syntheticPaddingCount: parsed.syntheticPaddingCount,
      ignoredCount: parsed.ignoredCount,
      ambiguousCount: parsed.ambiguous.length,
      ambiguousDetails: parsed.ambiguous.map((a) => ({ rowIndex: a.row.rowIndex, reason: a.reason })),
      earliest: dates.length ? new Date(Math.min(...dates)) : null,
      latest: dates.length ? new Date(Math.max(...dates)) : null,
      realRounds: parsed.real,
    });

    totalReal += parsed.real.length;
    totalPadding += parsed.syntheticPaddingCount;
    totalIgnored += parsed.ignoredCount;
    totalAmbiguous += parsed.ambiguous.length;
  }

  const resolved = reports.filter((r) => r.memberId !== null);
  const skipped = reports.filter((r) => r.memberId === null);
  const realRoundsImportableNow = resolved.reduce((n, r) => n + r.realCount, 0);
  const realRoundsDeferred = skipped.reduce((n, r) => n + r.realCount, 0);

  console.log("\n" + "-".repeat(78));
  console.log("PER-PLAYER DRY-RUN COUNTS");
  console.log("-".repeat(78));
  for (const r of reports) {
    const statusLabel = r.memberId
      ? `RESOLVED (member id ${r.memberId})`
      : "SKIPPED — no matching member yet, historical rows deferred";
    console.log(`\n${r.sheetName} → ${r.mappedName}  [${statusLabel}]`);
    console.log(`  total candidate rows:     ${r.totalCandidateRows}`);
    console.log(`  real rounds:              ${r.realCount}`);
    console.log(`  synthetic padding rows:   ${r.syntheticPaddingCount}`);
    console.log(`  ignored (blank) rows:     ${r.ignoredCount}`);
    console.log(`  ambiguous rows:           ${r.ambiguousCount}`);
    if (r.ambiguousDetails.length > 0) {
      for (const a of r.ambiguousDetails) {
        console.log(`    - row ${a.rowIndex}: ${a.reason}`);
      }
    }
    console.log(`  earliest real round:      ${fmtDate(r.earliest)}`);
    console.log(`  latest real round:        ${fmtDate(r.latest)}`);
  }

  console.log("\n" + "-".repeat(78));
  console.log("RESOLVED vs SKIPPED PLAYERS");
  console.log("-".repeat(78));
  console.log(
    `Resolved (${resolved.length}): ${resolved.map((r) => r.mappedName).join(", ") || "none"}`
  );
  console.log(
    `Skipped (${skipped.length}), deferred until added via Admin → Members: ${
      skipped.map((r) => r.mappedName).join(", ") || "none"
    }`
  );

  console.log("\n" + "-".repeat(78));
  console.log("WORKBOOK TOTALS");
  console.log("-".repeat(78));
  console.log(`  real rounds (total across workbook): ${totalReal}`);
  console.log(`  real rounds importable NOW (resolved players):  ${realRoundsImportableNow}`);
  console.log(`  real rounds DEFERRED (unresolved players):      ${realRoundsDeferred}`);
  console.log(`  synthetic padding rows excluded:     ${totalPadding}`);
  console.log(`  ignored rows:                        ${totalIgnored}`);
  console.log(`  ambiguous rows:                       ${totalAmbiguous}`);

  // Duplicate sourceRef safety check — across the whole workbook (not
  // just resolved players), since this is a structural sanity check on
  // our own ref-generation, independent of which players are resolved.
  const allReal = reports.flatMap((r) => r.realRounds);
  const duplicateRefs = findDuplicateSourceRefs(allReal);
  if (duplicateRefs.length > 0) {
    console.log("\n⚠️  DUPLICATE sourceRef VALUES DETECTED:", duplicateRefs);
  }

  console.log("\n" + "=".repeat(78));
  console.log("HANDICAP RECONCILIATION (resolved members only)");
  console.log("=".repeat(78));
  console.log(
    "Player".padEnd(20) +
      "Actual".padEnd(8) +
      "Pad".padEnd(6) +
      "RawAvg".padEnd(9) +
      "NewHCP".padEnd(8) +
      "WbHCP".padEnd(8) +
      "Match?"
  );

  for (const r of resolved) {
    const wb = workbook.handicapSummary.find((h) =>
      namesMatch(resolveHandicapSummaryAlias(h.displayName), r.mappedName)
    );
    const recon = reconcilePlayer({
      sheetName: r.sheetName,
      memberDisplayName: r.mappedName,
      realRounds: r.realRounds,
      workbookHandicapIndex: wb?.handicapIndex ?? null,
      workbookRoundedHandicap: wb?.roundedHandicap ?? null,
      maxHandicap,
    });
    const matchLabel = recon.match === null ? "N/A" : recon.match ? "MATCH" : "DIFFERENCE";
    console.log(
      r.mappedName.padEnd(20) +
        String(recon.actualRoundsParsed).padEnd(8) +
        String(recon.engineResult.paddingRoundsAdded.length).padEnd(6) +
        recon.engineResult.rawAverageLowest8.toFixed(2).padEnd(9) +
        String(recon.engineResult.finalHandicap).padEnd(8) +
        String(recon.workbookRoundedHandicap ?? "—").padEnd(8) +
        matchLabel
    );
    if (recon.match === false) {
      console.log(`    ↳ ${recon.explanation}`);
    }
  }

  if (skipped.length > 0) {
    console.log(
      `\n(Skipped players' rows remain fully parsed/deferred — not shown in reconciliation until a matching member exists.)`
    );
  }

  // Gate conditions only ever consider RESOLVED players — an unresolved
  // sheet is an expected, reported deferral, never a blocking failure.
  const resolvedAmbiguous = resolved.reduce((n, r) => n + r.ambiguousCount, 0);
  const resolvedReal = resolved.flatMap((r) => r.realRounds);
  const resolvedDuplicateRefs = findDuplicateSourceRefs(resolvedReal);

  const gateFailures: string[] = [];
  if (resolvedAmbiguous > 0) gateFailures.push(`${resolvedAmbiguous} ambiguous row(s) among resolved players`);
  if (resolvedDuplicateRefs.length > 0)
    gateFailures.push(`${resolvedDuplicateRefs.length} duplicate sourceRef(s) among resolved players`);

  console.log("\n" + "=".repeat(78));
  if (gateFailures.length > 0) {
    console.log("❌ PARTIAL IMPORT NOT RECOMMENDED — blocking issue(s) among resolved players:");
    for (const g of gateFailures) console.log(`  - ${g}`);
  } else {
    console.log(
      `✅ Dry-run + reconciliation checks passed for all ${resolved.length} resolved player(s) — safe to commit a partial import.`
    );
    console.log(
      `   (${skipped.length} player(s) remain deferred and untouched: ${skipped.map((r) => r.mappedName).join(", ") || "none"}.)`
    );
  }
  console.log("=".repeat(78));

  if (isCommitRequested && !hasReviewedFlag) {
    console.log(
      "\n⚠️  --commit was passed without --i-have-reviewed-the-dry-run — refusing to write."
    );
    console.log(
      "   Review the report above, then re-run with both flags to actually commit:"
    );
    console.log(
      "     npm run import:history -- --commit --i-have-reviewed-the-dry-run"
    );
    process.exitCode = 1;
    process.exit(1);
  }

  if (!willActuallyCommit) {
    process.exit(0);
  }

  if (gateFailures.length > 0) {
    console.log("\n❌ Refusing to commit — blocking issues present (see above).");
    process.exit(1);
  }

  console.log("\nCommitting resolved players' real rounds...");
  const { inserted, skippedExisting } = await commitImport(resolved);
  console.log(`✅ Inserted ${inserted} new played_rounds row(s).`);
  console.log(`   Skipped ${skippedExisting} row(s) already present (idempotent no-op).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
