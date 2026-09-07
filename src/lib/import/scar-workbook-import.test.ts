import { describe, expect, it } from "vitest";
import {
  classifyWorkbookRow,
  parseWorksheetRows,
  buildSourceRef,
  normalizeExcelDate,
  findDuplicateSourceRefs,
  type RawWorkbookRow,
} from "./scar-workbook-import";
import { SHEET_TO_MEMBER_NAME, namesMatch } from "./member-mapping";

function row(overrides: Partial<RawWorkbookRow> = {}): RawWorkbookRow {
  return {
    sheetName: "Sri",
    rowIndex: 3,
    date: new Date("2024-05-25T00:00:00.000Z"),
    course: "Eagle Pointe Golf Club",
    score: 101,
    rating: 73.2,
    slope: 139,
    city: "Bloomington, IN",
    ...overrides,
  };
}

describe("classifyWorkbookRow", () => {
  it("A: classifies a normal real row (date + course + valid numbers) as REAL", () => {
    const result = classifyWorkbookRow(row());
    expect(result.classification).toBe("REAL");
  });

  it("B: classifies a synthetic padding row (no date/course, duplicated numbers) as SYNTHETIC_PADDING", () => {
    const result = classifyWorkbookRow(
      row({ date: null, course: null, city: null })
    );
    expect(result.classification).toBe("SYNTHETIC_PADDING");
  });

  it("C: classifies a fully blank row as IGNORED", () => {
    const result = classifyWorkbookRow(
      row({ date: null, course: null, score: null, rating: null, slope: null, city: null })
    );
    expect(result.classification).toBe("IGNORED");
  });

  it("D: classifies a row with a date but no course as AMBIGUOUS (never guesses)", () => {
    const result = classifyWorkbookRow(row({ course: null }));
    expect(result.classification).toBe("AMBIGUOUS");
  });

  it("D2: classifies a row with a course but no date as AMBIGUOUS", () => {
    const result = classifyWorkbookRow(row({ date: null }));
    expect(result.classification).toBe("AMBIGUOUS");
  });

  it("D3: classifies a row with date+course but missing rating as AMBIGUOUS", () => {
    const result = classifyWorkbookRow(row({ rating: null }));
    expect(result.classification).toBe("AMBIGUOUS");
  });

  it("D4: classifies a row with a nonsensical score (e.g. 9999) as AMBIGUOUS rather than importing garbage", () => {
    const result = classifyWorkbookRow(row({ score: 9999 }));
    expect(result.classification).toBe("AMBIGUOUS");
  });

  it("D5: classifies a row with a non-numeric string in a numeric column as AMBIGUOUS", () => {
    const result = classifyWorkbookRow(row({ rating: "N/A" }));
    expect(result.classification).toBe("AMBIGUOUS");
  });

  it("accepts numeric-string values for score/rating/slope", () => {
    const result = classifyWorkbookRow(
      row({ score: "101", rating: "73.2", slope: "139" })
    );
    expect(result.classification).toBe("REAL");
  });
});

describe("normalizeExcelDate — Excel date handling", () => {
  it("E: passes through a native JS Date unchanged", () => {
    const d = new Date("2020-07-26T00:00:00.000Z");
    expect(normalizeExcelDate(d)).toEqual(d);
  });

  it("E2: converts an Excel serial date number correctly", () => {
    // Excel serial 44003 == 2020-06-21 (serial 0 == 1899-12-30).
    const result = normalizeExcelDate(44003);
    expect(result).not.toBeNull();
    expect(result!.toISOString().slice(0, 10)).toBe("2020-06-21");
  });

  it("E3: returns null for blank values, never invents a date", () => {
    expect(normalizeExcelDate(null)).toBeNull();
    expect(normalizeExcelDate(undefined)).toBeNull();
    expect(normalizeExcelDate("")).toBeNull();
  });

  it("E4: returns null for an invalid date string", () => {
    expect(normalizeExcelDate("not-a-date")).toBeNull();
  });
});

describe("buildSourceRef — deterministic traceability", () => {
  it("F: produces the same ref for the same inputs", () => {
    const a = buildSourceRef("workbook.xlsx", "Sri", 3);
    const b = buildSourceRef("workbook.xlsx", "Sri", 3);
    expect(a).toBe(b);
  });

  it("F2: produces different refs for different rows/sheets", () => {
    const a = buildSourceRef("workbook.xlsx", "Sri", 3);
    const b = buildSourceRef("workbook.xlsx", "Sri", 4);
    const c = buildSourceRef("workbook.xlsx", "CTR", 3);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("F3: encodes workbook/sheet/row for readability", () => {
    expect(buildSourceRef("wb.xlsx", "Hari", 27)).toBe(
      "historical-import:wb.xlsx:Hari:r27"
    );
  });
});

describe("parseWorksheetRows — full sheet parsing", () => {
  it("G: never puts synthetic padding rows into the real rounds list", () => {
    const rows: RawWorkbookRow[] = [
      row({ rowIndex: 3 }),
      row({ rowIndex: 4, date: null, course: null, city: null }), // padding
      row({ rowIndex: 5, date: null, course: null, city: null }), // padding
    ];
    const result = parseWorksheetRows("wb.xlsx", "Sri", rows);
    expect(result.real).toHaveLength(1);
    expect(result.syntheticPaddingCount).toBe(2);
    // Defensive: absolutely no padding-shaped data leaked into `real`.
    for (const r of result.real) {
      expect(r.courseName).toBeTruthy();
    }
  });

  it("H: separates real, padding, ignored, and ambiguous rows independently", () => {
    const rows: RawWorkbookRow[] = [
      row({ rowIndex: 3 }), // real
      row({ rowIndex: 4, date: null, course: null, city: null }), // padding
      row({
        rowIndex: 5,
        date: null,
        course: null,
        score: null,
        rating: null,
        slope: null,
        city: null,
      }), // blank/ignored
      row({ rowIndex: 6, course: null }), // ambiguous (date but no course)
    ];
    const result = parseWorksheetRows("wb.xlsx", "Sri", rows);
    expect(result.real).toHaveLength(1);
    expect(result.syntheticPaddingCount).toBe(1);
    expect(result.ignoredCount).toBe(1);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.totalCandidateRows).toBe(4);
  });

  it("I: attaches a deterministic sourceRef to every real round", () => {
    const rows: RawWorkbookRow[] = [row({ rowIndex: 10 })];
    const result = parseWorksheetRows("wb.xlsx", "Sri", rows);
    expect(result.real[0].sourceRef).toBe("historical-import:wb.xlsx:Sri:r10");
  });

  it("preserves gross score, rating, slope, course, and city on real rounds", () => {
    const rows: RawWorkbookRow[] = [
      row({
        rowIndex: 3,
        score: 101,
        rating: 73.2,
        slope: 139,
        course: "Eagle Pointe Golf Club",
        city: "Bloomington, IN",
      }),
    ];
    const result = parseWorksheetRows("wb.xlsx", "Sri", rows);
    expect(result.real[0]).toMatchObject({
      grossScore: 101,
      courseRating: 73.2,
      slope: 139,
      courseName: "Eagle Pointe Golf Club",
      courseCity: "Bloomington, IN",
    });
  });
});

describe("findDuplicateSourceRefs — idempotency safety net", () => {
  it("J: returns empty when all refs are unique", () => {
    const rows: RawWorkbookRow[] = [row({ rowIndex: 3 }), row({ rowIndex: 4 })];
    const result = parseWorksheetRows("wb.xlsx", "Sri", rows);
    expect(findDuplicateSourceRefs(result.real)).toEqual([]);
  });

  it("J2: detects a duplicate sourceRef if one is somehow produced twice", () => {
    const real = [
      {
        sourceSheetName: "Sri",
        playedAt: new Date(),
        courseName: "A",
        grossScore: 90,
        courseRating: 70,
        slope: 120,
        sourceRef: "historical-import:wb.xlsx:Sri:r3",
      },
      {
        sourceSheetName: "Sri",
        playedAt: new Date(),
        courseName: "B",
        grossScore: 91,
        courseRating: 70,
        slope: 120,
        sourceRef: "historical-import:wb.xlsx:Sri:r3", // duplicate on purpose
      },
    ];
    expect(findDuplicateSourceRefs(real)).toEqual([
      "historical-import:wb.xlsx:Sri:r3",
    ]);
  });
});

describe("member sheet mapping", () => {
  it("K: maps every known player sheet to an explicit full member name", () => {
    expect(SHEET_TO_MEMBER_NAME.Sri).toBe("Srikanth Mamidala");
    expect(SHEET_TO_MEMBER_NAME.CTR).toBe("Chandra Teja Reddy");
    expect(SHEET_TO_MEMBER_NAME.Adi).toBe("Adithya Bommaraju");
    expect(SHEET_TO_MEMBER_NAME.Rahul).toBe("Rahul Gollapudi");
    expect(SHEET_TO_MEMBER_NAME.Geo).toBe("George Thomas");
    expect(SHEET_TO_MEMBER_NAME.Deepu).toBe("Deepak Bommaraju");
    expect(SHEET_TO_MEMBER_NAME.Ajay).toBe("Ajay Veerapaneni");
    expect(SHEET_TO_MEMBER_NAME.Sashi).toBe("Sashi Ravipati");
    expect(SHEET_TO_MEMBER_NAME.Hari).toBe("Hari Kurada");
    expect(SHEET_TO_MEMBER_NAME.Zach).toBe("Zachary Paradise");
  });

  it("K2: namesMatch is case/whitespace-insensitive but does not fuzzy match different names", () => {
    expect(namesMatch("Hari Kurada", "  hari kurada ")).toBe(true);
    expect(namesMatch("Hari Kurada", "Hari K")).toBe(false);
  });
});
