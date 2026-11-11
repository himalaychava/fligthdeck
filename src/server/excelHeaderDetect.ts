/**
 * Excel header-row detection
 * ──────────────────────────
 * Finds the real header row in an export that does not start with one.
 *
 * ── Why ──
 * The Clarizen export opens with banner rows — a title, "Generated on behalf
 * of…", a blank, the view name, another blank, "879 Customer results" — and the
 * actual column names sit on row 8. Parsing from row 1 reads that banner as the
 * column names, finds no "Customer Name" anywhere, and filters every row away.
 *
 * The failure was silent: zero rows imported, HTTP 200, "Upload successful".
 * Nothing changed and nobody was told. Detecting the header removes the manual
 * step of deleting the banner before every upload, and failing loudly when no
 * header can be found removes the silent-success case entirely.
 */
import * as XLSX from "xlsx";

/** How far in to look before giving up. Banners are short; 20 is generous. */
const MAX_SCAN_ROWS = 20;

/** Minimum column names that must match before a row is accepted as the header. */
const MIN_MATCHES = 3;

/**
 * Column names that identify a Clarizen export.
 *
 * Matching is case- and whitespace-insensitive, and a row needs only
 * MIN_MATCHES of these — so a renamed or dropped column does not stop
 * detection, which matters because the export's columns do change.
 */
export const CLARIZEN_HEADER_TOKENS = [
  "line of business",
  "business unit",
  "geo",
  "market old",
  "country",
  "customer segment",
  "industry",
  "global buying group",
  "customer name",
  "customer number",
  "engagement status",
  "delivery type",
  "ibm work number.",
  "acv",
  "owner",
  "product code (utl30)",
];

function normalise(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export interface HeaderDetection {
  /** 0-based index of the header row within the sheet. */
  headerRow: number;
  /** How many known column names that row matched. */
  matches: number;
  /** The header values as found, for diagnostics. */
  headers: string[];
}

/**
 * Locate the header row in a sheet.
 *
 * Scores every row in the scan window and takes the best, rather than the first
 * row to clear the threshold: a banner row occasionally contains one or two
 * matching words, and the true header always scores far higher.
 */
export function detectHeaderRow(
  sheet: XLSX.WorkSheet,
  tokens: string[] = CLARIZEN_HEADER_TOKENS,
): HeaderDetection | null {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: "",
  });
  const wanted = new Set(tokens.map((t) => normalise(t)));

  let best: HeaderDetection | null = null;
  const limit = Math.min(grid.length, MAX_SCAN_ROWS);

  for (let i = 0; i < limit; i++) {
    const row = grid[i] ?? [];
    const cells = row.map(normalise).filter(Boolean);
    if (cells.length === 0) continue;

    const matches = cells.filter((c) => wanted.has(c)).length;
    if (matches >= MIN_MATCHES && (!best || matches > best.matches)) {
      best = { headerRow: i, matches, headers: row.map((c) => String(c ?? "").trim()) };
    }
  }

  return best;
}

export interface ParsedSheet {
  rows: Record<string, unknown>[];
  detection: HeaderDetection;
  sheetName: string;
}

/**
 * Parse a workbook into objects, starting from the detected header row.
 *
 * Returns null when no header can be found, so the caller can refuse the file
 * with a real message instead of importing nothing and claiming success.
 */
export function parseSheetWithDetectedHeader(
  workbook: XLSX.WorkBook,
  tokens: string[] = CLARIZEN_HEADER_TOKENS,
): ParsedSheet | null {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const detection = detectHeaderRow(sheet, tokens);
    if (!detection) continue;

    // `range` makes XLSX treat the detected row as the header and read
    // everything below it as data.
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: detection.headerRow,
      defval: "",
    });
    return { rows, detection, sheetName };
  }
  return null;
}
