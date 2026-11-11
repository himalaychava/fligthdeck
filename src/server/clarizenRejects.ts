/**
 * Clarizen Rejects
 * ────────────────
 * Rows the Clarizen upload refused, and why.
 *
 * ── Why this exists ──
 * A Clarizen row with no Customer Number cannot be stored: the customer number
 * is the key everything else joins on — CSP cases, geography, contracts. The
 * upload has always dropped those rows, but silently: the admin panel reported
 * success and never mentioned them.
 *
 * Worse, the dropped rows were still passed to onboarding, so a row too
 * incomplete to store was still good enough to CREATE A CLIENT PAGE. That is
 * where the "(tbd)" account came from — a client with no customer number, no
 * geography, no contracts, invisible to every non-admin and impossible to fix.
 *
 * Now the same filtered list feeds both steps, and what was dropped is recorded
 * here so somebody can act on it at source.
 *
 * Only the most recent upload is kept. These are a worklist for the current
 * file, not an audit log — the previous upload's rejects are noise once a new
 * file has been processed.
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";

/** One rejected customer, aggregated across however many rows it had. */
export interface RejectedCustomer {
  customerName: string;
  rowCount: number;
  geo: string;
  market: string;
  country: string;
  /** Machine-readable cause, so a future rule can be told apart from this one. */
  reason: "missing-customer-number";
}

export interface RejectReport {
  uploadedAt: string;
  uploadedBy: string;
  fileName: string;
  /** Rows in the uploaded file that carried a customer name. */
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  customers: RejectedCustomer[];
}

function rejectsPath(): string {
  return path.join(path.dirname(getExcelFilePath()), "clarizen_rejects.json");
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Group rejected rows by customer name.
 *
 * Aggregated rather than listed row by row: "IBM - Mgmt Assessments, 15 rows"
 * is actionable, fifteen near-identical lines are not.
 */
export function buildRejectReport(
  rejected: Record<string, unknown>[],
  meta: { totalRows: number; acceptedRows: number; uploadedBy: string; fileName: string },
): RejectReport {
  const byName = new Map<string, RejectedCustomer>();

  for (const row of rejected) {
    const name = text(row.customerName) || text(row["Customer Name"]) || "(no name)";
    const existing = byName.get(name);
    if (existing) {
      existing.rowCount++;
      // Keep the first non-empty value seen for each field — rows for one
      // customer agree, and a later blank should not erase an earlier value.
      existing.geo ||= text(row.Geo);
      existing.market ||= text(row["Market OLD"]);
      existing.country ||= text(row.Country);
      continue;
    }
    byName.set(name, {
      customerName: name,
      rowCount: 1,
      geo: text(row.Geo),
      market: text(row["Market OLD"]),
      country: text(row.Country),
      reason: "missing-customer-number",
    });
  }

  return {
    uploadedAt: new Date().toISOString(),
    uploadedBy: meta.uploadedBy || "unknown",
    fileName: meta.fileName,
    totalRows: meta.totalRows,
    acceptedRows: meta.acceptedRows,
    rejectedRows: rejected.length,
    customers: [...byName.values()].sort((a, b) => b.rowCount - a.rowCount || a.customerName.localeCompare(b.customerName)),
  };
}

export function writeRejectReport(report: RejectReport): void {
  try {
    const p = rejectsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(report, null, 2), "utf-8");
  } catch (e) {
    // Never fail an upload because the reject log could not be written.
    console.error("[clarizen-rejects] could not persist", e);
  }
}

export function readRejectReport(): RejectReport | null {
  try {
    const p = rejectsPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as RejectReport;
  } catch {
    return null;
  }
}
