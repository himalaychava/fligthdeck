/**
 * Upload History
 * ──────────────
 * A record of every Clarizen and CSP upload: who, when, which file, and what
 * it did. Shown in Admin → Upload History, where each one can be viewed or
 * downloaded as an Excel report.
 *
 * Storage: {dataDir}/upload_history/
 *   index.json        — one summary line per upload, newest first
 *   <id>.json         — the full record for one upload
 *
 * The 100 most recent uploads of each kind are kept. CSP uploads made before
 * this existed come from csp_upload_history.json and carry no detail.
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { getExcelFilePath } from "./demoDataPaths";
import { readCspUploadHistory, type ClarizenCustomer } from "./dataIngestionService";
import type { EndCustomerSummary } from "./endCustomerRules";

export type UploadKind = "clarizen" | "csp";

export interface UploadSummary {
  id: string;
  kind: UploadKind;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  status: "success" | "failed";
  /** One line for the history table. */
  headline: string;
  /** Recorded before upload reports existed — summary only. */
  legacy?: boolean;
}

export interface ContractLine {
  workOrder: string;
  contractName: string;
  customerName: string;
  customerNumber: string;
  acv: number | null;
  tcv: number | null;
  endDate: string;
}

export interface ContractChange {
  workOrder: string;
  contractName: string;
  customerName: string;
  field: string;
  before: string;
  after: string;
}

export interface ClarizenUploadDetails {
  rowsInFile: number;
  rowsStored: number;
  rowsDiscarded: number;
  headerRow: number | null;
  sheetName: string;
  newPages: { clientId: string; name: string; customerNumber: string }[];
  pagesAlreadyExisting: number;
  discarded: {
    customerName: string;
    rowCount: number;
    geo: string;
    country: string;
    reason: string;
  }[];
  endCustomers: EndCustomerSummary[];
  /** Compared with the previous upload; null when there was none. */
  changes: { added: ContractLine[]; removed: ContractLine[]; changed: ContractChange[] } | null;
}

export interface CspUploadDetails {
  mode: "Append" | "Replace all";
  rowsInFile: number;
  casesInFile: number;
  added: number;
  skipped: number;
  openDateFrom: string;
  openDateTo: string;
}

export interface UploadRecord extends UploadSummary {
  durationMs: number | null;
  error?: string;
  /** E.g. for an entry rebuilt from saved data after the fact. */
  note?: string;
  clarizen?: ClarizenUploadDetails;
  csp?: CspUploadDetails;
}

const KEEP_PER_KIND = 100;
const ID_PATTERN = /^(clarizen|csp)-\d+-[a-z0-9]+$/;

function historyDir(): string {
  return path.join(path.dirname(getExcelFilePath()), "upload_history");
}

function indexPath(): string {
  return path.join(historyDir(), "index.json");
}

function writeAtomic(p: string, value: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), "utf-8");
  fs.renameSync(tmp, p);
}

function readIndex(): UploadSummary[] {
  try {
    const raw = JSON.parse(fs.readFileSync(indexPath(), "utf-8"));
    return Array.isArray(raw) ? (raw as UploadSummary[]) : [];
  } catch {
    return [];
  }
}

function headlineOf(r: Omit<UploadRecord, "id" | "headline">): string {
  if (r.status === "failed") return `Failed: ${r.error ?? "unknown error"}`;
  if (r.clarizen) {
    const c = r.clarizen;
    const parts = [
      `${c.rowsStored.toLocaleString()} rows stored`,
      `${c.newPages.length} new page(s)`,
      `${c.rowsDiscarded} discarded`,
    ];
    if (c.changes) {
      parts.push(
        `contracts +${c.changes.added.length} / −${c.changes.removed.length} / ${c.changes.changed.length} changed`,
      );
    }
    return parts.join(" · ");
  }
  if (r.csp) {
    return `${r.csp.added.toLocaleString()} new cases · ${r.csp.skipped.toLocaleString()} duplicates · ${r.csp.mode}`;
  }
  return "";
}

/** Save one upload. Never throws: history must not break an upload. */
export function recordUpload(r: Omit<UploadRecord, "id" | "headline">): void {
  try {
    const id = `${r.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record: UploadRecord = { ...r, id, headline: headlineOf(r) };
    writeAtomic(path.join(historyDir(), `${id}.json`), record);

    const summary: UploadSummary = {
      id,
      kind: r.kind,
      fileName: r.fileName,
      uploadedAt: r.uploadedAt,
      uploadedBy: r.uploadedBy,
      status: r.status,
      headline: record.headline,
    };
    const index = [summary, ...readIndex()];
    const kept: UploadSummary[] = [];
    const count: Record<string, number> = {};
    for (const s of index) {
      count[s.kind] = (count[s.kind] ?? 0) + 1;
      if (count[s.kind] <= KEEP_PER_KIND) kept.push(s);
      else fs.rmSync(path.join(historyDir(), `${s.id}.json`), { force: true });
    }
    writeAtomic(indexPath(), kept);
  } catch (e) {
    console.error("[upload-history] could not record upload:", e);
  }
}

/** CSP uploads from before this existed, minus any that also have a full record. */
function legacyCspSummaries(detailed: UploadSummary[]): UploadSummary[] {
  const csp = detailed.filter((s) => s.kind === "csp");
  return readCspUploadHistory()
    .filter(
      (l) =>
        !csp.some(
          (s) =>
            s.fileName === l.fileName &&
            Math.abs(Date.parse(s.uploadedAt) - Date.parse(l.uploadedAt)) < 15 * 60 * 1000,
        ),
    )
    .map((l) => ({
      id: `legacy-csp-${l.id}`,
      kind: "csp" as const,
      fileName: l.fileName,
      uploadedAt: l.uploadedAt,
      uploadedBy: l.uploadedBy,
      status: "success" as const,
      headline: "Recorded before upload reports existed",
      legacy: true,
    }));
}

export function listUploads(): UploadSummary[] {
  const detailed = readIndex();
  return [...detailed, ...legacyCspSummaries(detailed)].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt),
  );
}

export function getUpload(id: string): UploadRecord | null {
  if (id.startsWith("legacy-csp-")) {
    const s = legacyCspSummaries(readIndex()).find((x) => x.id === id);
    return s ? { ...s, durationMs: null } : null;
  }
  if (!ID_PATTERN.test(id)) return null;
  try {
    return JSON.parse(
      fs.readFileSync(path.join(historyDir(), `${id}.json`), "utf-8"),
    ) as UploadRecord;
  } catch {
    return null;
  }
}

// ── Clarizen: what changed since the previous upload ─────────────────────────

const text = (v: unknown): string => String(v ?? "").trim();

function num(v: unknown): number | null {
  const s = text(v);
  return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
}

/** Clarizen dates arrive as Excel serial numbers. */
function isoDate(v: unknown): string {
  const s = text(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const serial = Number(s);
  if (!Number.isFinite(serial) || serial <= 1000) return s;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** One line per work order; a work order spans several rows, one per product. */
function contractLines(rows: ClarizenCustomer[]): Map<string, ContractLine> {
  const out = new Map<string, ContractLine>();
  for (const r of rows) {
    const workOrder = text(r["IBM Work Number."] ?? r["IBM Work Number"]);
    const contractName = text(r["Name"]);
    const key = workOrder || `__${contractName}`;
    if (key === "__") continue;
    const existing = out.get(key);
    const line: ContractLine = existing ?? {
      workOrder,
      contractName,
      customerName: text(r.customerName),
      customerNumber: text(r.customerNumber),
      acv: null,
      tcv: null,
      endDate: "",
    };
    line.acv ??= num(r["ACV"]);
    line.tcv ??= num(r["Work Number TCV (USD)"]);
    line.endDate ||= isoDate(r["Work Number End Date"]);
    out.set(key, line);
  }
  return out;
}

export function diffClarizen(
  previous: ClarizenCustomer[],
  next: ClarizenCustomer[],
): ClarizenUploadDetails["changes"] {
  if (previous.length === 0) return null;
  const before = contractLines(previous);
  const after = contractLines(next);
  const added = [...after].filter(([k]) => !before.has(k)).map(([, v]) => v);
  const removed = [...before].filter(([k]) => !after.has(k)).map(([, v]) => v);
  const changed: ContractChange[] = [];
  const show = (v: number | null) => (v === null ? "" : String(v));
  for (const [k, a] of after) {
    const b = before.get(k);
    if (!b) continue;
    const fields: [string, string, string][] = [
      ["Customer Number", b.customerNumber, a.customerNumber],
      ["ACV", show(b.acv), show(a.acv)],
      ["TCV", show(b.tcv), show(a.tcv)],
      ["End date", b.endDate, a.endDate],
    ];
    for (const [field, x, y] of fields) {
      if (x !== y) {
        changed.push({
          workOrder: a.workOrder,
          contractName: a.contractName,
          customerName: a.customerName,
          field,
          before: x,
          after: y,
        });
      }
    }
  }
  return { added, removed, changed };
}

// ── Excel report ─────────────────────────────────────────────────────────────

function addSheet(
  wb: XLSX.WorkBook,
  name: string,
  rows: Record<string, unknown>[],
  widths: number[],
): void {
  const sheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Note: "None" }]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, sheet, name);
}

function contractRows(lines: ContractLine[]): Record<string, unknown>[] {
  return lines.map((l) => ({
    "Work order": l.workOrder,
    Contract: l.contractName,
    Customer: l.customerName,
    "Customer Number": l.customerNumber,
    ACV: l.acv,
    TCV: l.tcv,
    "End date": l.endDate,
  }));
}

export function buildUploadReport(r: UploadRecord): Buffer {
  const wb = XLSX.utils.book_new();
  const summary: [string, unknown][] = [
    ["Upload", r.kind === "clarizen" ? "Clarizen" : "CSP"],
    ["File", r.fileName],
    ["Uploaded at", r.uploadedAt],
    ["Uploaded by", r.uploadedBy],
    ["Result", r.status === "success" ? "Success" : "Failed"],
    ["Summary", r.headline],
  ];
  if (r.durationMs !== null)
    summary.push(["Duration (seconds)", Math.round(r.durationMs / 100) / 10]);
  if (r.error) summary.push(["Error", r.error]);
  if (r.note) summary.push(["Note", r.note]);
  const c = r.clarizen;
  if (c) {
    summary.push(
      ["Sheet / header row", `${c.sheetName} / row ${c.headerRow ?? "?"}`],
      ["Rows in file", c.rowsInFile],
      ["Rows stored", c.rowsStored],
      ["Rows discarded (no customer number)", c.rowsDiscarded],
      ["New customer pages", c.newPages.length],
      ["Customers already in FlightDeck", c.pagesAlreadyExisting],
    );
    for (const e of c.endCustomers) {
      summary.push([`${e.holder}: contracts filed under end customers`, e.assigned]);
    }
    if (c.changes) {
      summary.push(
        ["Contracts added since previous upload", c.changes.added.length],
        ["Contracts removed since previous upload", c.changes.removed.length],
        ["Contract field changes since previous upload", c.changes.changed.length],
      );
    } else {
      summary.push(["Changes since previous upload", "No previous upload to compare with"]);
    }
  }
  const s = r.csp;
  if (s) {
    summary.push(
      ["Mode", s.mode],
      ["Rows in file", s.rowsInFile],
      ["Cases in file (with a case number)", s.casesInFile],
      ["New cases added", s.added],
      ["Duplicates skipped", s.skipped],
      ["Case open dates in file", s.openDateFrom ? `${s.openDateFrom} to ${s.openDateTo}` : ""],
    );
  }
  if (r.legacy)
    summary.push(["Note", "Recorded before upload reports existed; no further detail."]);
  addSheet(
    wb,
    "Summary",
    summary.map(([Item, Value]) => ({ Item, Value })),
    [48, 80],
  );

  if (c) {
    addSheet(
      wb,
      "New pages",
      c.newPages.map((p) => ({
        "Page ID": p.clientId,
        Name: p.name,
        "Customer Number": p.customerNumber,
      })),
      [44, 44, 18],
    );
    addSheet(
      wb,
      "Discarded rows",
      c.discarded.map((d) => ({
        Customer: d.customerName,
        Rows: d.rowCount,
        Geo: d.geo,
        Country: d.country,
        Reason: d.reason,
      })),
      [44, 8, 12, 24, 40],
    );
    addSheet(
      wb,
      "End customers",
      c.endCustomers.flatMap((e) => [
        ...e.endCustomers.map((x) => ({
          Holder: e.holder,
          "End customer": x.name,
          "Customer Number": x.customerNumber,
          Contracts: x.contracts,
          Note: "",
        })),
        ...e.keptOnHolder.map((k) => ({
          Holder: e.holder,
          "End customer": "",
          "Customer Number": "",
          Contracts: "",
          Note: `${k.workOrder}: left on holder (${k.reason})`,
        })),
      ]),
      [32, 32, 18, 10, 60],
    );
    if (c.changes) {
      const widths = [16, 50, 36, 16, 12, 12, 12];
      addSheet(wb, "Contracts added", contractRows(c.changes.added), widths);
      addSheet(wb, "Contracts removed", contractRows(c.changes.removed), widths);
      addSheet(
        wb,
        "Contracts changed",
        c.changes.changed.map((x) => ({
          "Work order": x.workOrder,
          Contract: x.contractName,
          Customer: x.customerName,
          Field: x.field,
          Before: x.before,
          After: x.after,
        })),
        [16, 50, 36, 18, 16, 16],
      );
    }
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
