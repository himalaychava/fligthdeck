/**
 * Upload Job Queue
 * ────────────────
 * Provides a simple in-memory background job runner for large file uploads.
 *
 * Flow:
 *   1. POST /api/admin/upload/csp     — saves raw bytes to disk, enqueues job, returns { jobId }
 *   2. GET  /api/admin/upload/csp/progress/:jobId — SSE stream, sends progress events until done
 *
 * The job runs in a setImmediate loop so it never blocks the event loop for
 * more than one tick at a time, keeping the server responsive during processing.
 *
 * Jobs are kept for 10 minutes then purged.
 */
import path from "node:path";
import * as XLSX from "xlsx";
import { notifyDataUploaded } from "./reportScheduler";
import { getExcelFilePath } from "./demoDataPaths";
import fs from "node:fs";
import { readXlsxRowsStreaming } from "./xlsxStreamReader";
import { recordUpload } from "./uploadHistory";
import {
  readColumnMappings,
  saveColumnMapping,
  mergeCspCases,
  readCspData,
  clearCspData,
  recordCspUpload,
  type CspCase,
  type ColumnMapping,
} from "./dataIngestionService";
import { getJsonMirrorPath } from "./demoDataPaths";
import type { ExcelRawPayload } from "@/demo-integration/dataAdapters";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobProgress {
  jobId: string;
  status: JobStatus;
  phase: string;         // human-readable current step
  processed: number;     // rows processed so far
  total: number;         // total rows in file (0 until parsed)
  added: number;
  skipped: number;
  error?: string;
  result?: { rows: number; merge: { added: number; skipped: number }; headers: string[] };
  /** For the upload report: rows with a case number, and their open-date span. */
  casesInFile?: number;
  openDateFrom?: string;
  openDateTo?: string;
  startedAt: string;
  finishedAt?: string;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const jobs = new Map<string, JobProgress>();

/** Auto-purge jobs older than 10 minutes */
function purgeOldJobs() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (new Date(job.startedAt).getTime() < cutoff) jobs.delete(id);
  }
}

function makeJobId(): string {
  return `csp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getJob(jobId: string): JobProgress | null {
  return jobs.get(jobId) ?? null;
}

// ─── Temp file helpers ────────────────────────────────────────────────────────

function tempDir(): string {
  return path.join(path.dirname(getExcelFilePath()), "uploads_tmp");
}

export function saveTempFile(buffer: Uint8Array, ext: string): string {
  const dir = tempDir();
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `upload-${Date.now()}.${ext}`);
  fs.writeFileSync(p, buffer);
  return p;
}

function deleteTempFile(p: string) {
  try { fs.unlinkSync(p); } catch { /* ignore */ }
}

// ─── CSV fast-path parser ─────────────────────────────────────────────────────

/**
 * Parse a CSV buffer into rows without using the xlsx library.
 * Handles quoted fields and \r\n line endings.
 * ~10-20× faster than XLSX.read() for plain CSV.
 */
export function parseCsvBuffer(buffer: Buffer): Record<string, unknown>[] {
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  function splitLine(line: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  const headers = splitLine(lines[0]);
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = splitLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => { row[h.trim()] = (vals[idx] ?? "").trim(); });
    rows.push(row);
  }
  return rows;
}

// ─── Chunked processing ───────────────────────────────────────────────────────

const CHUNK_SIZE = 2000; // rows processed per tick (raised from 500 — CSV is cheap)

/**
 * Process rows in CHUNK_SIZE batches, yielding to the event loop between
 * chunks so SSE and other requests stay responsive.
 */
function processInChunks(
  job: JobProgress,
  rows: Record<string, unknown>[],
  effectiveMapping: ColumnMapping,
  fileName?: string
): Promise<void> {
  return new Promise((resolve) => {
    const m = (field: string): string => effectiveMapping[field] ?? field;
    const uploadedAt = new Date().toISOString();
    const allCases: CspCase[] = [];
    let cursor = 0;

    // ── Date normalisation ────────────────────────────────────────────────────
    // Accepts: "Jan 27, 2026" | "27-Jan-2026" | "2026-01-27" | Excel serial
    // Always returns: "YYYY-MM-DD" or "" if unparseable
    const MONTH_ABBR: Record<string, number> = {
      jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
    };
    function excelSerialToIso(serial: number): string {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    function parseDateToIso(raw: string): string {
      if (!raw) return "";
      // Already ISO YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      // Excel serial number stored as a plain number string
      const serial = parseFloat(raw);
      if (!isNaN(serial) && serial > 1000 && !/[a-zA-Z]/.test(raw)) {
        return excelSerialToIso(serial);
      }
      // "Jan 27, 2026" or "January 27, 2026"
      const longMatch = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
      if (longMatch) {
        const mo = MONTH_ABBR[longMatch[1].slice(0, 3).toLowerCase()];
        if (mo) {
          const dd = longMatch[2].padStart(2, "0");
          const mm = String(mo).padStart(2, "0");
          return `${longMatch[3]}-${mm}-${dd}`;
        }
      }
      // "27-Jan-2026" or "27/Jan/2026"
      const shortMatch = raw.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/);
      if (shortMatch) {
        const mo = MONTH_ABBR[shortMatch[2].toLowerCase()];
        if (mo) {
          const dd = shortMatch[1].padStart(2, "0");
          const mm = String(mo).padStart(2, "0");
          return `${shortMatch[3]}-${mm}-${dd}`;
        }
      }
      // "DD/MM/YYYY" or "MM/DD/YYYY" — assume DD/MM/YYYY (most common in IBM CSP data)
      const dmyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmyMatch) {
        const dd = dmyMatch[1].padStart(2, "0");
        const mm = dmyMatch[2].padStart(2, "0");
        return `${dmyMatch[3]}-${mm}-${dd}`;
      }
      // Fallback: try native Date parse
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return "";
    }

    function tick() {
      const chunk = rows.slice(cursor, cursor + CHUNK_SIZE);
      for (const r of chunk) {
        const caseNumber = String(r[m("caseNumber")] ?? r["Case Number"] ?? "").trim();
        if (!caseNumber) continue;
        allCases.push({
          caseNumber,
          cmrNumber:       String(r[m("cmrNumber")]       ?? r["CMR Number"]       ?? "").trim(),
          customerName:    String(r[m("customerName")]    ?? r["Customer Name"]    ?? "").trim(),
          productName:     String(r[m("productName")]     ?? r["Ut 30 Name"]       ?? "").trim(),
          // Secondary name column — only populated once the admin maps it; older
          // batches keep "" and the lifecycle matcher falls back to productName.
          productNameAlt:  String(r[m("productNameAlt")]  ?? r["Product"]          ?? "").trim(),
          priority:        String(r[m("priority")]        ?? r["Priority"]         ?? "").trim(),
          initialSeverity: String(r[m("initialSeverity")] ?? r["Initial Severity"] ?? "").trim(),
          currentSeverity: String(r[m("currentSeverity")] ?? r["Current Severity"] ?? "").trim(),
          maxSeverity:     String(r[m("maxSeverity")]     ?? r["Max Severity"]     ?? "").trim(),
          status:          String(r[m("status")]          ?? r["Status"]           ?? "").trim(),
          openDate:        parseDateToIso(String(r[m("openDate")]  ?? r["Open Date"]  ?? "").trim()),
          closeDate:       parseDateToIso(String(r[m("closeDate")] ?? r["Close Date"] ?? "").trim()),
          summary:         String(r[m("summary")]         ?? r["Summary"]          ?? "").trim(),
          concept:         "",
          hwSwSaas:        String(r[m("hwSwSaas")]        ?? r["HW/SW/SaaS"]       ?? "").trim(),
          division:        String(r[m("division")] ?? r["Division"] ?? r["division"] ?? r["Division Name"] ?? r["Business Division"] ?? r["Div"] ?? "").trim(),
          segment:         String(r[m("segment")]  ?? r["Segment"]  ?? r["segment"]  ?? r["Segment Name"]  ?? r["Market Segment"]   ?? r["Seg"] ?? "").trim(),
          productVersion:  String(r[m("productVersion")] ?? r["Product Version"] ?? r["Version"] ?? "").trim(),
          uploadedAt,
        });
      }
      cursor += CHUNK_SIZE;
      job.processed = Math.min(cursor, rows.length);

      if (cursor < rows.length) {
        // Yield to event loop then continue
        setImmediate(tick);
      } else {
        // All rows parsed — merge into store
        job.phase = "Merging into data store…";
        setImmediate(() => {
          const opened = allCases
            .map((c) => c.openDate)
            .filter(Boolean)
            .sort();
          job.casesInFile = allCases.length;
          job.openDateFrom = opened[0] ?? "";
          job.openDateTo = opened[opened.length - 1] ?? "";
          const mergeResult = mergeCspCases(allCases, fileName);
          job.added   = mergeResult.added;
          job.skipped = mergeResult.skipped;
          // Generate / update filtered insights Excel — non-fatal if it fails
          try {
            job.phase = "Generating filtered insights export…";
            updateFilteredInsightsExcel(allCases);
          } catch { /* non-fatal */ }
          resolve();
        });
      }
    }

    setImmediate(tick);
  });
}

// ─── Main enqueue function ────────────────────────────────────────────────────

/**
 * Wipe all existing CSP data then write the new file.
 * Called when the admin uploads a fresh CSP export (clear-and-replace).
 */


/**
 * Enqueue a CSP upload job. Returns the jobId immediately.
 * The actual processing runs in the background via setImmediate.
 * Pass `clearFirst: true` to wipe existing data before merging.
 */
export function enqueueCspJob(
  tempFilePath: string,
  fileExt: string,
  mapping: ColumnMapping,
  clearFirst = false,
  fileName = "",
  uploadedBy = ""
): string {
  purgeOldJobs();
  const jobId = makeJobId();
  const job: JobProgress = {
    jobId,
    status: "queued",
    phase: "Queued — waiting to start…",
    processed: 0,
    total: 0,
    added: 0,
    skipped: 0,
    startedAt: new Date().toISOString(),
  };
  jobs.set(jobId, job);

  const recordCsp = (status: "success" | "failed", rowsInFile: number, error?: string) =>
    recordUpload({
      kind: "csp",
      fileName,
      uploadedAt: job.startedAt,
      uploadedBy: uploadedBy || "Admin",
      status,
      durationMs: Date.now() - Date.parse(job.startedAt),
      error,
      csp:
        status === "success"
          ? {
              mode: clearFirst ? "Replace all" : "Append",
              rowsInFile,
              casesInFile: job.casesInFile ?? 0,
              added: job.added,
              skipped: job.skipped,
              openDateFrom: job.openDateFrom ?? "",
              openDateTo: job.openDateTo ?? "",
            }
          : undefined,
    });

  // Start async — don't await
  setImmediate(async () => {
    try {
      job.status = "running";
      job.phase = "Reading uploaded file…";

      const buffer = fs.readFileSync(tempFilePath);
      deleteTempFile(tempFilePath);

      // Choose parser based on file extension — CSV fast path avoids xlsx entirely
      job.phase = fileExt === "csv" ? "Parsing CSV…" : "Parsing spreadsheet…";
      await new Promise<void>((r) => setImmediate(r));

      let rows: Record<string, unknown>[];
      if (fileExt === "csv") {
        rows = parseCsvBuffer(buffer);
      } else {
        // Use streaming parser — safe for 700MB+ sheet XML that xlsx library can't handle
        job.phase = "Parsing spreadsheet (streaming)…";
        const result = await readXlsxRowsStreaming(buffer);
        rows = result.rows;
      }

      if (rows.length === 0) {
        job.status = "error";
        job.error = "File contains no data rows";
        job.finishedAt = new Date().toISOString();
        recordCsp("failed", 0, job.error);
        return;
      }

      // Clear-and-replace mode — wipe store before ingesting
      if (clearFirst) {
        clearCspData();
      }

      job.total = rows.length;
      job.phase = `Processing ${rows.length.toLocaleString()} rows…`;

      // Save mapping if provided
      if (Object.keys(mapping).length > 0) {
        saveColumnMapping("csp", mapping);
      }
      const savedMapping = readColumnMappings().csp ?? {};
      const effectiveMapping = Object.keys(mapping).length > 0 ? mapping : savedMapping;

      await processInChunks(job, rows, effectiveMapping, fileName);

      if (fileName) {
        recordCspUpload(fileName, uploadedBy);
      }

      job.status = "done";
      job.phase = "Complete";
      // New case data landed — let the scheduler refresh the affected reports.
      // Fired on COMPLETION rather than on upload, because a large CSP file can
      // take longer to ingest than the scheduler's debounce window, and a run
      // started mid-ingest would read half the cases.
      notifyDataUploaded("csp");
      job.result = {
        rows: rows.length,
        merge: { added: job.added, skipped: job.skipped },
        headers: Object.keys(rows[0]),
      };
      job.finishedAt = new Date().toISOString();
      recordCsp("success", rows.length);
    } catch (e) {
      deleteTempFile(tempFilePath);
      job.status = "error";
      job.error = e instanceof Error ? e.message : "Processing failed";
      job.finishedAt = new Date().toISOString();
      recordCsp("failed", 0, job.error);
    }
  });

  return jobId;
}

// ─── Filtered Insights Excel generator ───────────────────────────────────────

/**
 * After each CSP upload, update csp_filtered_insights.xlsx in the data folder.
 *
 * Rules:
 *  - Only Software or SaaS cases (hwSwSaas === "Software" or "SaaS")
 *  - Only cases whose CMR number matches a known client in the workbook
 *  - One sheet per calendar month (named "Mon YYYY", e.g. "Jun 2026")
 *  - Re-uploading the same month replaces that sheet
 *  - All other months' sheets are preserved
 *
 * Columns in each sheet:
 *   Client Name | CMR Number | Case Number | Product (Ut 30 Name) |
 *   Priority | Initial Sev | Current Sev | Max Sev | Status |
 *   Open Date | Close Date | HW/SW/SaaS | Summary
 */
function updateFilteredInsightsExcel(newCases: CspCase[]): void {
  const dataFolder = path.dirname(getExcelFilePath());
  const outPath    = path.join(dataFolder, "csp_filtered_insights.xlsx");

  // ── 1. Build CMR → client_name lookup from workbook JSON mirror ──────────────
  const cmrToClient = new Map<string, string>(); // normalised CMR → client name
  try {
    const jsonPath = getJsonMirrorPath();
    if (fs.existsSync(jsonPath)) {
      const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Partial<ExcelRawPayload>;
      const rows = (raw.ClientOverview ?? []) as Record<string, unknown>[];
      for (const r of rows) {
        const cmr  = String(r.cmr_number ?? "").trim();
        const name = String(r.client_name ?? "").trim();
        if (cmr && name) {
          cmrToClient.set(cmr.replace(/^0+/, "") || cmr, name);
        }
      }
    }
  } catch { /* proceed without client name lookup */ }

  const normCmr = (c: string) => c.replace(/^0+/, "") || c;

  // ── 2. Filter: Software only + known CMR ─────────────────────────────────────
  const softwareCases = newCases.filter((c) => {
    const hw = (c.hwSwSaas ?? "").toLowerCase();
    if (hw !== "software" && hw !== "saas") return false;
    if (!c.caseNumber || !c.cmrNumber) return false;
    // Only keep cases whose CMR is in the workbook
    if (cmrToClient.size > 0 && !cmrToClient.has(normCmr(c.cmrNumber))) return false;
    return true;
  });

  // ── 3. Group by month of openDate ────────────────────────────────────────────
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function excelSerialToDate(serial: number): Date {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  }

  function formatDate(d: string): string {
    if (!d) return "";
    if (/^\d{4}-\d{2}/.test(d)) return d; // already YYYY-MM-DD
    const serial = parseFloat(d);
    if (!isNaN(serial) && serial > 1000) return excelSerialToDate(serial).toISOString().slice(0, 10);
    return d;
  }

  function getSheetName(openDate: string): string {
    if (!openDate) return "Unknown";

    // Try YYYY-MM-DD or ISO format first
    if (/^\d{4}-\d{2}/.test(openDate)) {
      const d = new Date(openDate);
      if (!isNaN(d.getTime())) return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    }

    // Excel serial number (days since 1899-12-30) — stored as plain number string
    const serial = parseFloat(openDate);
    if (!isNaN(serial) && serial > 1000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }

    // Try generic date parse as last resort
    const fallback = new Date(openDate);
    if (!isNaN(fallback.getTime())) {
      return `${MONTH_NAMES[fallback.getMonth()]} ${fallback.getFullYear()}`;
    }

    return "Unknown";
  }

  const byMonth = new Map<string, CspCase[]>();
  for (const c of softwareCases) {
    const sheet = getSheetName(c.openDate);
    if (!byMonth.has(sheet)) byMonth.set(sheet, []);
    byMonth.get(sheet)!.push(c);
  }

  if (byMonth.size === 0) return; // nothing to write

  // ── 4. Load existing workbook (if any) so we preserve other months ───────────
  let wb: XLSX.WorkBook;
  if (fs.existsSync(outPath)) {
    try {
      wb = XLSX.read(fs.readFileSync(outPath), { type: "buffer" });
    } catch {
      wb = XLSX.utils.book_new();
    }
  } else {
    wb = XLSX.utils.book_new();
  }

  // ── 5. Write / replace each new month's sheet ────────────────────────────────
  for (const [sheetName, cases] of byMonth) {
    const sheetRows = cases.map((c) => ({
      "Client Name":    cmrToClient.get(normCmr(c.cmrNumber)) ?? c.customerName ?? "",
      "CMR Number":     c.cmrNumber,
      "Case Number":    c.caseNumber,
      "Ut 30 Name":     c.productName,
      "Priority":       c.priority,
      "Initial Sev":    c.initialSeverity,
      "Current Sev":    c.currentSeverity,
      "Max Sev":        c.maxSeverity,
      "Status":         c.status,
      "Open Date":      formatDate(c.openDate),
      "Close Date":     formatDate(c.closeDate),
      "HW/SW/SaaS":     c.hwSwSaas,
      "Division":       c.division ?? "",
      "Segment":        c.segment ?? "",
      "Summary":        c.summary,
    }));

    const ws = XLSX.utils.json_to_sheet(sheetRows);

    // Set column widths for readability
    ws["!cols"] = [
      { wch: 30 }, // Client Name
      { wch: 14 }, // CMR Number
      { wch: 16 }, // Case Number
      { wch: 35 }, // Ut 30 Name
      { wch: 10 }, // Priority
      { wch: 12 }, // Initial Sev
      { wch: 12 }, // Current Sev
      { wch: 10 }, // Max Sev
      { wch: 22 }, // Status
      { wch: 12 }, // Open Date
      { wch: 12 }, // Close Date
      { wch: 12 }, // HW/SW/SaaS
      { wch: 20 }, // Division
      { wch: 20 }, // Segment
      { wch: 60 }, // Summary
    ];

    // Replace sheet if it already exists, otherwise append
    if (wb.SheetNames.includes(sheetName)) {
      wb.Sheets[sheetName] = ws;
    } else {
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
  }

  // ── 6. Sort sheets chronologically ───────────────────────────────────────────
  wb.SheetNames.sort((a, b) => {
    const toDate = (s: string) => {
      const [mon, yr] = s.split(" ");
      const m = MONTH_NAMES.indexOf(mon);
      return m >= 0 ? new Date(parseInt(yr, 10), m) : new Date(0);
    };
    return toDate(a).getTime() - toDate(b).getTime();
  });

  // ── 7. Write to disk ──────────────────────────────────────────────────────────
  fs.mkdirSync(dataFolder, { recursive: true });
  XLSX.writeFile(wb, outPath);
}
