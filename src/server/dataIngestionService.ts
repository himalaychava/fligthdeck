/**
 * Data Ingestion Service
 * ──────────────────────
 * Handles persistent storage for:
 *   - Clarizen customer master records  → public/data/clarizen_master.json
 *   - CSP (Salesforce) case data        → public/data/csp_data.json
 *   - Column mapping config             → public/data/column_mappings.json
 *
 * All paths resolve relative to the data directory (same folder as the
 * Excel workbook so they move together on any deployment).
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";
import {
  cspDataFingerprint,
  lifecycleConfigFingerprint,
  readDiskCache,
  writeDiskCache,
} from "./dataFingerprint";

// ─── Path helpers ─────────────────────────────────────────────────────────────

function dataDir(): string {
  return path.dirname(getExcelFilePath());
}

function clarizenPath(): string {
  return path.join(dataDir(), "clarizen_master.json");
}

function cspPath(): string {
  return path.join(dataDir(), "csp_data.json");
}

function cspHistoryPath(): string {
  return path.join(dataDir(), "csp_upload_history.json");
}

function mappingsPath(): string {
  return path.join(dataDir(), "column_mappings.json");
}

function occPath(): string {
  return path.join(dataDir(), "occ_data.json");
}

function occMappingXlsxPath(): string {
  return path.join(dataDir(), "occ_product_mapping.xlsx");
}

function lifecyclePath(): string {
  return path.join(dataDir(), "lifecycle_data.json");
}

function lifecycleMappingsPath(): string {
  return path.join(dataDir(), "lifecycle_mappings.json");
}

function ensureDir(p: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClarizenCustomer {
  customerNumber: string; // unique key
  customerName: string;
  ecEmProducts: string[]; // comma-split list
  contractStart?: string;
  contractEnd?: string;
  [key: string]: unknown; // raw extra fields preserved
}

export interface CspCase {
  caseNumber: string; // unique dedup key
  cmrNumber: string;
  customerName: string;
  productName: string;
  /**
   * Secondary product name column from CSP ("Product"), which can differ from
   * productName ("Product Name") after an IBM product rename. Optional — only
   * present on batches uploaded after this column was added to the mapping, so
   * every consumer must tolerate "".
   */
  productNameAlt: string;
  priority: string;
  initialSeverity: string;
  currentSeverity: string;
  maxSeverity: string;
  status: string;
  openDate: string;
  closeDate: string;
  summary: string;
  concept: string;
  hwSwSaas: string; // "Software" | "Hardware" | "SaaS" | ""
  division: string;
  segment: string;
  productVersion: string;
  uploadedAt: string; // ISO timestamp of the upload batch that brought this row in
}

/** One row from the OCC product hierarchy table */
export interface OccProduct {
  /** SWS L30 Code — matches Clarizen "Product Code (UTL30)" */
  l30Code: string;
  /** SWS L30 Desc — human-readable product name */
  l30Desc: string;
  /** Preserves all raw columns from the upload */
  [key: string]: unknown;
}

/**
 * One Software row from the IBM Product Lifecycle Catalog.
 * Hardware rows are dropped at ingest time — see {@link replaceLifecycleData}.
 */
export interface LifecycleProduct {
  /** "IBM Product" — the catalog product name, primary match key. */
  productName: string;
  /** "VRM" — the version/release string, matched against CSP product version. */
  vrm: string;
  /** "PID" — captured for reference only; deliberately NOT used for matching. */
  pid: string;
  /** "Transition to Extended/Sustained, End of Support" — the standard EOS date (ISO or raw). */
  endOfSupport: string;
  /** "Completion of Extended, Sustained, Extension availability" — extended support end. */
  extendedEndOfSupport: string;
  /** "Lifecycle Policy" — support policy code (Enhanced / Standard / Continuous Delivery …). */
  lifecyclePolicy: string;
  /** "General Availability" — release date, contextual only. */
  generalAvailability: string;
  /** Preserves all raw columns from the upload. */
  [key: string]: unknown;
}

/** Saved column mapping for a given upload type */
export interface ColumnMapping {
  /** internal field name → uploaded column header */
  [internalField: string]: string;
}

export interface ColumnMappingsStore {
  clarizen?: ColumnMapping;
  csp?: ColumnMapping;
  occ?: ColumnMapping;
  lifecycle?: ColumnMapping;
}

/** Upload types that support an admin-configurable column mapping. */
export type UploadType = "clarizen" | "csp" | "occ" | "lifecycle";

// ─── Clarizen master data ────────────────────────────────────────────────────

/**
 * Memoised on the file's size+mtime, same rule as safeReadClientOverview.
 *
 * Every EC-product lookup for a client re-derives from this master list, so a
 * home-page load that sums the live product count across hundreds of clients
 * would otherwise re-read and re-parse this whole file once per client.
 * mergeClarizenCustomers rewrites the file on every upload, which changes its
 * mtime and invalidates this automatically.
 */
let clarizenMemo: { token: string; rows: ClarizenCustomer[] } | null = null;

function clarizenFileToken(): string {
  try {
    const st = fs.statSync(clarizenPath());
    return `${st.size}:${Math.floor(st.mtimeMs)}`;
  } catch {
    return "absent";
  }
}

export function readClarizenMaster(): ClarizenCustomer[] {
  const token = clarizenFileToken();
  if (clarizenMemo && clarizenMemo.token === token) return clarizenMemo.rows;
  let rows: ClarizenCustomer[] = [];
  try {
    const p = clarizenPath();
    if (fs.existsSync(p)) {
      rows = JSON.parse(fs.readFileSync(p, "utf-8")) as ClarizenCustomer[];
    }
  } catch {
    rows = [];
  }
  clarizenMemo = { token, rows };
  return rows;
}

/**
 * Replace the Clarizen master store with the incoming batch (clear-and-replace).
 * All rows are stored as-is — multiple rows per customer are preserved because
 * each row may have a different Product Code (UTL30).
 * Returns { added, updated } counts for display purposes.
 */
export function mergeClarizenCustomers(incoming: ClarizenCustomer[]): {
  added: number;
  updated: number;
} {
  const valid = incoming.filter((c) => c.customerNumber);
  ensureDir(clarizenPath());
  fs.writeFileSync(clarizenPath(), JSON.stringify(valid, null, 2), "utf-8");
  return { added: valid.length, updated: 0 };
}

export function getClarizenCustomerByNumber(customerNumber: string): ClarizenCustomer | null {
  return readClarizenMaster().find((c) => c.customerNumber === customerNumber) ?? null;
}

export function getClarizenCustomerByName(name: string): ClarizenCustomer | null {
  const n = name.toLowerCase().trim();
  return readClarizenMaster().find((c) => c.customerName.toLowerCase().trim() === n) ?? null;
}

// ─── CSP case data ────────────────────────────────────────────────────────────

function cspDir(): string {
  return path.join(dataDir(), "csp");
}

export function clearCspData(): void {
  try {
    const legacy = cspPath();
    if (fs.existsSync(legacy)) {
      fs.unlinkSync(legacy);
    }
  } catch {}
  try {
    const dir = cspDir();
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.endsWith(".json")) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
    }
  } catch {}
}

export function readCspData(): CspCase[] {
  const index = new Map<string, CspCase>();

  // 1. Read legacy single file if present
  try {
    const legacy = cspPath();
    if (fs.existsSync(legacy)) {
      const raw = JSON.parse(fs.readFileSync(legacy, "utf-8")) as CspCase[];
      if (Array.isArray(raw)) {
        for (const c of raw) {
          if (c.caseNumber && !index.has(c.caseNumber)) {
            index.set(c.caseNumber, c);
          }
        }
      }
    }
  } catch {}

  // 2. Read all per-file JSON files in public/data/csp/
  try {
    const dir = cspDir();
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as CspCase[];
          if (Array.isArray(raw)) {
            for (const c of raw) {
              if (c.caseNumber && !index.has(c.caseNumber)) {
                index.set(c.caseNumber, c);
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  return [...index.values()];
}

/** Fast, memory-efficient lookup of cases for a single CMR number across all uploaded JSON files */
/**
 * Batch case index — one pass instead of one pass per client.
 *
 * readCspCasesForCmr() re-reads and re-parses EVERY CSP file on each call
 * (~550MB across six files). That is tolerable for a single page view and
 * ruinous for a batch: 600 clients would mean 600 full parses.
 *
 * Priming builds a CMR → cases map in a single pass, restricted to the customer
 * numbers the caller cares about — typically ~7% of the 1.15M stored cases, so
 * the map stays small. readCspCasesForCmr() then answers from memory.
 *
 * The index is keyed by the CSP data fingerprint, so an upload during a run
 * invalidates it rather than serving stale cases. Always release it when the
 * batch finishes; holding it pins the cases in memory for the process lifetime.
 */
let primedCaseIndex: {
  fingerprint: string;
  byCmr: Map<string, CspCase[]>;
  /** Oldest and newest case open date across the WHOLE export, not just the indexed CMRs. */
  dateRange: { earliest: string; latest: string } | null;
} | null = null;

const normaliseCmr = (v: unknown): string => String(v ?? "").trim().replace(/^0+/, "");

/** Build the index for the given customer numbers. Returns how many cases it holds. */
export function primeCspCaseIndex(cmrs: string[], fingerprint: string): number {
  const wanted = new Set(cmrs.map(normaliseCmr).filter(Boolean));
  const byCmr = new Map<string, CspCase[]>();
  const seen = new Set<string>();
  let held = 0;
  let earliest = "";
  let latest = "";

  const ingest = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const c of rows as CspCase[]) {
      // Span of the whole export — taken in this same pass so the opportunity
      // rules' window costs no second read of ~550MB.
      const opened = String(c?.openDate ?? "").slice(0, 10);
      if (ISO_OPEN_DATE.test(opened)) {
        if (!earliest || opened < earliest) earliest = opened;
        if (opened > latest) latest = opened;
      }
      const key = normaliseCmr(c?.cmrNumber);
      if (!key || !wanted.has(key)) continue;
      if (!c.caseNumber || seen.has(c.caseNumber)) continue;
      seen.add(c.caseNumber);
      const bucket = byCmr.get(key);
      if (bucket) bucket.push(c);
      else byCmr.set(key, [c]);
      held++;
    }
  };

  try {
    const legacy = cspPath();
    if (fs.existsSync(legacy)) ingest(JSON.parse(fs.readFileSync(legacy, "utf-8")));
  } catch { /* a bad legacy file must not abort the index */ }

  try {
    const dir = cspDir();
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
        try {
          ingest(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
        } catch { /* skip unreadable file, keep the rest */ }
      }
    }
  } catch { /* no csp dir — index stays empty */ }

  primedCaseIndex = { fingerprint, byCmr, dateRange: latest ? { earliest, latest } : null };
  return held;
}

const ISO_OPEN_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Open-date span of the whole CSP export, from the primed index; null when none is primed. */
export function getPrimedCspDateRange(): { earliest: string; latest: string } | null {
  return primedCaseIndex?.dateRange ?? null;
}

/** Drop the index and let the cases be collected. */
export function releaseCspCaseIndex(): void {
  primedCaseIndex = null;
}

/** Whether an index is currently primed for this fingerprint. */
export function isCspCaseIndexPrimed(fingerprint: string): boolean {
  return primedCaseIndex !== null && primedCaseIndex.fingerprint === fingerprint;
}

export function readCspCasesForCmr(targetCmr: string): CspCase[] {
  if (!targetCmr) return [];
  const normTarget = targetCmr.trim().replace(/^0+/, "");
  if (!normTarget) return [];

  // Answer from the batch index when one is primed. A CMR absent from the map
  // genuinely has no cases — the index was built over every stored file — so
  // this returns [] rather than falling through to a full re-parse.
  if (primedCaseIndex) {
    return primedCaseIndex.byCmr.get(normTarget) ?? [];
  }

  const matched: CspCase[] = [];
  const seen = new Set<string>();

  // 1. Read legacy file if present
  try {
    const legacy = cspPath();
    if (fs.existsSync(legacy)) {
      const raw = JSON.parse(fs.readFileSync(legacy, "utf-8")) as CspCase[];
      if (Array.isArray(raw)) {
        for (const c of raw) {
          const cNorm = String(c.cmrNumber ?? "")
            .trim()
            .replace(/^0+/, "");
          if (cNorm === normTarget && c.caseNumber && !seen.has(c.caseNumber)) {
            seen.add(c.caseNumber);
            matched.push(c);
          }
        }
      }
    }
  } catch {}

  // 2. Read per-file JSONs in public/data/csp/
  try {
    const dir = cspDir();
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as CspCase[];
          if (Array.isArray(raw)) {
            for (const c of raw) {
              const cNorm = String(c.cmrNumber ?? "")
                .trim()
                .replace(/^0+/, "");
              if (cNorm === normTarget && c.caseNumber && !seen.has(c.caseNumber)) {
                seen.add(c.caseNumber);
                matched.push(c);
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  return matched;
}

/**
 * Save an uploaded batch of cases into a dedicated JSON file in public/data/csp/
 * named after the uploaded file (e.g. public/data/csp/Jan_2026_Cases.json).
 * Deduplicates against existing stored cases and patches missing fields.
 * Returns { added, skipped } counts.
 */
export function mergeCspCases(
  incoming: CspCase[],
  rawFileName?: string,
): { added: number; skipped: number } {
  const existing = readCspData();
  const index = new Map(existing.map((c) => [c.caseNumber, c]));
  let added = 0;
  let skipped = 0;
  const uploadedAt = new Date().toISOString();

  // Create clean filename slug (e.g. "CSP_Cases_Jan_2026.json")
  let targetFileName = `csp_upload_${Date.now()}.json`;
  if (rawFileName) {
    const baseName = path.basename(rawFileName).replace(/\.(csv|xlsx|xls)$/i, "");
    const safeSlug = baseName.replace(/[^a-zA-Z0-9_\-]/g, "_");
    if (safeSlug) targetFileName = `${safeSlug}.json`;
  }

  const batchCases: CspCase[] = [];

  for (const c of incoming) {
    if (!c.caseNumber) {
      skipped++;
      continue;
    }
    if (index.has(c.caseNumber)) {
      // Case already exists — patch fields that were previously missing or malformed
      const stored = index.get(c.caseNumber)!;
      if (!stored.hwSwSaas && c.hwSwSaas) stored.hwSwSaas = c.hwSwSaas;
      if (!stored.division && c.division) stored.division = c.division;
      if (!stored.segment && c.segment) stored.segment = c.segment;
      const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
      if (c.openDate && ISO_DATE.test(c.openDate) && !ISO_DATE.test(stored.openDate ?? "")) {
        stored.openDate = c.openDate;
      }
      if (c.closeDate && ISO_DATE.test(c.closeDate) && !ISO_DATE.test(stored.closeDate ?? "")) {
        stored.closeDate = c.closeDate;
      }
      skipped++;
      continue;
    }
    const newCase = { ...c, uploadedAt };
    index.set(c.caseNumber, newCase);
    batchCases.push(newCase);
    added++;
  }

  // Ensure public/data/csp directory exists
  const dir = cspDir();
  fs.mkdirSync(dir, { recursive: true });

  // If old legacy csp_data.json exists, remove it so all data is stored in public/data/csp/
  try {
    const legacy = cspPath();
    if (fs.existsSync(legacy)) {
      fs.unlinkSync(legacy);
    }
  } catch {}

  // Write the file's cases into its own dedicated JSON file under public/data/csp/
  const targetPath = path.join(dir, targetFileName);
  fs.writeFileSync(
    targetPath,
    JSON.stringify(batchCases.length > 0 ? batchCases : incoming),
    "utf-8",
  );

  return { added, skipped };
}

export function getCspCasesByCustomerNumber(customerNumber: string): CspCase[] {
  // CSP rows are linked by CMR number = Clarizen customerNumber
  return readCspData().filter((c) => c.cmrNumber === customerNumber);
}

// ─── OCC product data ─────────────────────────────────────────────────────────

/**
 * Memoised on the file's size+mtime, same rule as readClarizenMaster.
 *
 * getOccProductName runs for every product code of every client, so the
 * customer list alone would otherwise re-read and re-parse this file thousands
 * of times. replaceOccData rewrites the file, which invalidates this.
 */
let occMemo: { token: string; rows: OccProduct[]; nameByCode: Map<string, string> } | null = null;

function occIndex(): { rows: OccProduct[]; nameByCode: Map<string, string> } {
  let token = "absent";
  try {
    const st = fs.statSync(occPath());
    token = `${st.size}:${Math.floor(st.mtimeMs)}`;
  } catch {
    /* no OCC upload yet */
  }
  if (occMemo && occMemo.token === token) return occMemo;
  let rows: OccProduct[] = [];
  try {
    const p = occPath();
    if (fs.existsSync(p)) rows = JSON.parse(fs.readFileSync(p, "utf-8")) as OccProduct[];
  } catch {
    rows = [];
  }
  // First entry wins for a duplicated code, as the previous linear search did.
  const nameByCode = new Map<string, string>();
  for (const p of rows) {
    const code = String(p.l30Code ?? "").trim().toLowerCase();
    if (code && !nameByCode.has(code)) nameByCode.set(code, p.l30Desc);
  }
  occMemo = { token, rows, nameByCode };
  return occMemo;
}

export function readOccData(): OccProduct[] {
  return occIndex().rows;
}

/**
 * Replace the full OCC store with the incoming batch (clear-and-replace).
 * Also regenerates the occ_product_mapping.xlsx convenience file.
 * Returns { total } count.
 */
export function replaceOccData(incoming: OccProduct[]): { total: number } {
  ensureDir(occPath());
  fs.writeFileSync(occPath(), JSON.stringify(incoming), "utf-8");
  // Auto-generate the product mapping Excel
  generateOccMappingXlsx(incoming);
  return { total: incoming.length };
}

/** Build/overwrite the convenience occ_product_mapping.xlsx from current OCC data */
function generateOccMappingXlsx(products: OccProduct[]) {
  try {
    // Lazy-import xlsx here to avoid it pulling into non-server bundles
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx") as typeof import("xlsx");
    const rows = products.map((p) => ({
      "L30 Code (UTL30)": p.l30Code,
      "Product Name (OCC)": p.l30Desc,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "OCC Mapping");
    XLSX.writeFile(wb, occMappingXlsxPath());
  } catch {
    /* non-fatal */
  }
}

/**
 * Lookup OCC product name by Clarizen UTL30 code.
 * Case-insensitive exact match on l30Code.
 */
export function getOccProductName(l30Code: string): string | null {
  return occIndex().nameByCode.get(l30Code.trim().toLowerCase()) ?? null;
}

// ─── Product Lifecycle Catalog ────────────────────────────────────────────────

export function readLifecycleData(): LifecycleProduct[] {
  try {
    const p = lifecyclePath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, "utf-8")) as LifecycleProduct[];
  } catch {
    return [];
  }
}

/**
 * Replace the lifecycle catalog with the incoming batch (clear-and-replace).
 * Callers are expected to have already filtered to Software rows.
 */
export function replaceLifecycleData(incoming: LifecycleProduct[]): { total: number } {
  ensureDir(lifecyclePath());
  fs.writeFileSync(lifecyclePath(), JSON.stringify(incoming), "utf-8");
  return { total: incoming.length };
}

// ─── Manual product lifecycle mappings ────────────────────────────────────────

/**
 * An admin-configured CSP product name → lifecycle catalog product name mapping.
 * Used only for CSP products the automatic 3-layer matcher cannot resolve.
 *
 * One CSP product maps to ONE catalog entry — all license variants of a product
 * share the same End of Support date, so mapping every variant is unnecessary.
 */
export interface LifecycleMapping {
  /** CSP product name as it appears in case data (stored as entered). */
  cspProductName: string;
  /** Catalog "IBM Product" name to resolve it to. */
  catalogProductName: string;
  updatedAt: string;
  updatedBy: string;
}

export function readLifecycleMappings(): LifecycleMapping[] {
  try {
    const p = lifecycleMappingsPath();
    if (!fs.existsSync(p)) return [];
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as LifecycleMapping[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeLifecycleMappings(rows: LifecycleMapping[]): void {
  ensureDir(lifecycleMappingsPath());
  fs.writeFileSync(lifecycleMappingsPath(), JSON.stringify(rows, null, 2), "utf-8");
}

/**
 * Insert or update a mapping, keyed case-insensitively on the CSP product name.
 * Returns the full list so callers can respond with fresh state.
 */
export function saveLifecycleMapping(
  cspProductName: string,
  catalogProductName: string,
  updatedBy: string,
): LifecycleMapping[] {
  const csp = cspProductName.trim();
  const catalog = catalogProductName.trim();
  if (!csp || !catalog) return readLifecycleMappings();

  const rows = readLifecycleMappings();
  const key = csp.toLowerCase();
  const existing = rows.findIndex((r) => r.cspProductName.trim().toLowerCase() === key);
  const entry: LifecycleMapping = {
    cspProductName: csp,
    catalogProductName: catalog,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || "Admin",
  };
  if (existing >= 0) rows[existing] = entry;
  else rows.push(entry);

  rows.sort((a, b) => a.cspProductName.localeCompare(b.cspProductName));
  writeLifecycleMappings(rows);
  return rows;
}

export function deleteLifecycleMapping(cspProductName: string): LifecycleMapping[] {
  const key = cspProductName.trim().toLowerCase();
  const rows = readLifecycleMappings().filter((r) => r.cspProductName.trim().toLowerCase() !== key);
  writeLifecycleMappings(rows);
  return rows;
}

// ─── Column mappings store ────────────────────────────────────────────────────

export function readColumnMappings(): ColumnMappingsStore {
  try {
    const p = mappingsPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ColumnMappingsStore;
  } catch {
    return {};
  }
}

export function saveColumnMapping(type: UploadType, mapping: ColumnMapping): void {
  const store = readColumnMappings();
  store[type] = mapping;
  ensureDir(mappingsPath());
  fs.writeFileSync(mappingsPath(), JSON.stringify(store, null, 2), "utf-8");
}

// ─── Upload status summary & history ──────────────────────────────────────────

export interface CspUploadRecord {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
}

export function readCspUploadHistory(): CspUploadRecord[] {
  try {
    const p = cspHistoryPath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, "utf-8")) as CspUploadRecord[];
  } catch {
    return [];
  }
}

export function recordCspUpload(fileName: string, uploadedBy: string): void {
  try {
    const history = readCspUploadHistory();
    history.unshift({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fileName: fileName || "csp_data.csv",
      uploadedAt: new Date().toISOString(),
      uploadedBy: uploadedBy || "Admin",
    });
    const trimmed = history.slice(0, 100);
    ensureDir(cspHistoryPath());
    fs.writeFileSync(cspHistoryPath(), JSON.stringify(trimmed, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save CSP upload history:", e);
  }
}

export interface UploadStatus {
  clarizen: {
    customerCount: number;
    lastUpdated: string | null;
  };
  csp: {
    caseCount: number;
    lastUpdated: string | null;
    history: CspUploadRecord[];
  };
  occ: {
    productCount: number;
    lastUpdated: string | null;
  };
  lifecycle: {
    productCount: number;
    lastUpdated: string | null;
  };
  mappings: ColumnMappingsStore;
}

/**
 * Distinct CSP case count, cached on disk against the data fingerprint.
 *
 * The uncached path loads all ~1.15M cases (~580MB) into a Map purely to read
 * its size, which cost ~2s on every admin page load. The count only changes
 * when the underlying files do, so it is derived once per upload instead.
 */
function getCspCaseCount(): number {
  const fingerprint = cspDataFingerprint();
  const cached = readDiskCache<number>("csp_case_count", fingerprint);
  if (cached !== null) return cached;
  const count = readCspData().length;
  writeDiskCache("csp_case_count", fingerprint, count);
  return count;
}

/** Lifecycle catalog row count, cached the same way — the file is ~11MB. */
function getLifecycleProductCount(): number {
  const fingerprint = lifecycleConfigFingerprint();
  const cached = readDiskCache<number>("lifecycle_row_count", fingerprint);
  if (cached !== null) return cached;
  const count = readLifecycleData().length;
  writeDiskCache("lifecycle_row_count", fingerprint, count);
  return count;
}

export function getUploadStatus(): UploadStatus {
  const clarizenData = readClarizenMaster();
  const cspCaseCount = getCspCaseCount();
  const occData = readOccData();
  const lifecycleProductCount = getLifecycleProductCount();
  const mappings = readColumnMappings();
  const cspHistory = readCspUploadHistory();

  const clarizenStat = fs.existsSync(clarizenPath())
    ? new Date(fs.statSync(clarizenPath()).mtime).toISOString()
    : null;
  const cspStat = fs.existsSync(cspPath())
    ? new Date(fs.statSync(cspPath()).mtime).toISOString()
    : null;
  const occStat = fs.existsSync(occPath())
    ? new Date(fs.statSync(occPath()).mtime).toISOString()
    : null;
  const lifecycleStat = fs.existsSync(lifecyclePath())
    ? new Date(fs.statSync(lifecyclePath()).mtime).toISOString()
    : null;

  return {
    clarizen: { customerCount: clarizenData.length, lastUpdated: clarizenStat },
    csp: { caseCount: cspCaseCount, lastUpdated: cspStat, history: cspHistory },
    occ: { productCount: occData.length, lastUpdated: occStat },
    lifecycle: { productCount: lifecycleProductCount, lastUpdated: lifecycleStat },
    mappings,
  };
}
