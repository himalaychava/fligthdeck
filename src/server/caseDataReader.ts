/**
 * Case Data Reader — isolated data layer for CSP case exports.
 *
 * Single data source: public/data/csp_data.json — written by the Admin upload flow.
 * If the file doesn't exist or is empty, functions return empty arrays gracefully.
 *
 * CMR → client_id mapping comes from the Excel workbook ClientOverview sheet
 * (or its JSON mirror).
 *
 * To swap the data source in future (e.g. live Salesforce API), only this
 * file needs to change — the insight logic layer is untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { isExcelBackendAvailable, readWorkbookPayload } from "./excelWorkbook";
import { getJsonMirrorPath, getExcelFilePath } from "./demoDataPaths";
import type { ExcelRawPayload } from "@/demo-integration/dataAdapters";
import type { CspCase, ClarizenCustomer } from "./dataIngestionService";
import { readClarizenMaster, getOccProductName, readCspCasesForCmr } from "./dataIngestionService";
import { isHiddenHolderPage } from "./endCustomerRules";

export interface SupportCase {
  caseNumber: string;
  customerName: string;
  cmrNumber: string;
  productName: string;
  /** Secondary CSP product name column ("Product"); "" on batches uploaded before it was mapped. */
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
  hwSwSaas: string;   // "Software" | "Hardware" | "SaaS" | ""
  division: string;
  segment: string;
  productVersion: string;
}

/** Returns true if the case qualifies as Sev1 by any severity field = "1". */
export function isSev1(c: SupportCase): boolean {
  return ["1"].some(
    (v) =>
      c.priority === v ||
      c.initialSeverity === v ||
      c.currentSeverity === v ||
      c.maxSeverity === v
  );
}



/** Path to the uploaded CSP JSON written by the Admin upload flow */
function getUploadedCspPath(): string {
  return path.join(path.dirname(getExcelFilePath()), "csp_data.json");
}

/** Returns true if the uploaded CSP JSON exists and has at least one record */
function hasUploadedCspData(): boolean {
  try {
    const legacy = getUploadedCspPath();
    if (fs.existsSync(legacy)) return true;
    const dir = path.join(path.dirname(getExcelFilePath()), "csp");
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
      return files.length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

/** Load all cases from the uploaded CSP JSON */
function loadCasesFromUploadedJson(): SupportCase[] {
  try {
    const p = getUploadedCspPath();
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as CspCase[];
    return raw.map((c) => ({
      caseNumber:      c.caseNumber,
      customerName:    c.customerName,
      cmrNumber:       c.cmrNumber,
      productName:     c.productName,
      productNameAlt:  c.productNameAlt ?? "",
      priority:        c.priority,
      initialSeverity: c.initialSeverity,
      currentSeverity: c.currentSeverity,
      maxSeverity:     c.maxSeverity,
      status:          c.status,
      openDate:        c.openDate,
      closeDate:       c.closeDate,
      summary:         c.summary,
      concept:         c.concept,
      hwSwSaas:        c.hwSwSaas ?? "",
      division:        c.division ?? "",
      segment:         c.segment ?? "",
      productVersion:  c.productVersion ?? "",
    }));
  } catch {
    return [];
  }
}

/**
 * Read client overview rows without throwing — tries Excel first, then JSON mirror.
 * Returns empty array if neither is available.
 */
/**
 * Memoised ClientOverview.
 *
 * Reading it parses the ENTIRE 21-sheet workbook. That is acceptable once per
 * request and ruinous in a loop: the report batch calls getCasesForClient for
 * every client, so without this a 950-client run re-parses the workbook 950
 * times and starves the event loop — the server stops answering requests
 * altogether, which is exactly what a background job must not do.
 *
 * Keyed on the workbook's size and mtime, so any write (writeWorkbookPayload
 * touches the file) invalidates it automatically. No explicit invalidation to
 * forget.
 */
let overviewMemo: { token: string; rows: Record<string, unknown>[] } | null = null;

function workbookToken(): string {
  try {
    const st = fs.statSync(getExcelFilePath());
    return `${st.size}:${Math.floor(st.mtimeMs)}`;
  } catch {
    return "absent";
  }
}

/** Overview minus hidden holder pages, recomputed only when the workbook or Clarizen changes. */
let visibleMemo: {
  rows: Record<string, unknown>[];
  clarizen: ClarizenCustomer[];
  visible: Record<string, unknown>[];
} | null = null;

export function safeReadClientOverview(): Record<string, unknown>[] {
  const token = workbookToken();
  if (!overviewMemo || overviewMemo.token !== token) {
    overviewMemo = { token, rows: readClientOverviewUncached() };
  }
  // A holder page whose contracts all moved to end customers (endCustomerRules)
  // is hidden everywhere. It depends on the Clarizen upload as well, so the
  // filtered list is cached against both — this runs once per client lookup.
  const clarizen = readClarizenMaster();
  if (!visibleMemo || visibleMemo.rows !== overviewMemo.rows || visibleMemo.clarizen !== clarizen) {
    visibleMemo = {
      rows: overviewMemo.rows,
      clarizen,
      visible: overviewMemo.rows.filter((r) => !isHiddenHolderPage(r.cmr_number)),
    };
  }
  return visibleMemo.visible;
}

function readClientOverviewUncached(): Record<string, unknown>[] {
  // Try Excel workbook first
  if (isExcelBackendAvailable()) {
    try {
      const payload = readWorkbookPayload();
      return (payload.ClientOverview ?? []) as Record<string, unknown>[];
    } catch { /* fall through to JSON */ }
  }
  // Try JSON mirror
  try {
    const jsonPath = getJsonMirrorPath();
    if (fs.existsSync(jsonPath)) {
      const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Partial<ExcelRawPayload>;
      return (raw.ClientOverview ?? []) as Record<string, unknown>[];
    }
  } catch { /* ignore */ }
  return [];
}

/** Load all cases from csp_data.json — the only data source. */
export function loadAllCases(): SupportCase[] {
  return loadCasesFromUploadedJson();
}

/** Strip leading zeros for CMR number comparison — Salesforce pads to 10 chars, Excel stores short form. */
function normaliseCmr(cmr: string): string {
  return cmr.trim().replace(/^0+/, "") || cmr.trim(); // keep original if all zeros
}

export interface CaseDateFilter {
  openFrom?:  string; // YYYY-MM-DD inclusive
  openTo?:    string; // YYYY-MM-DD inclusive
  closeFrom?: string;
  closeTo?:   string;
  /** Comma-separated list of types to include, e.g. "Software,SaaS". Empty string = all types. */
  hwSwSaas?:  string;
}

/** Return true if an ISO date string (YYYY-MM-DD) falls within [from, to] (both inclusive, both optional). */
function inDateRange(dateStr: string, from: string | undefined, to: string | undefined): boolean {
  if (!dateStr) {
    // No date on the case — only exclude if a specific range was requested
    if (from || to) return false;
    return true;
  }
  if (from && dateStr < from) return false;
  if (to   && dateStr > to)   return false;
  return true;
}

/** Get cases for a specific Control Plane clientId by matching CMR numbers, with optional date filtering. */
export function getCasesForClient(clientId: string, dateFilter?: CaseDateFilter): SupportCase[] {
  const overview = safeReadClientOverview();
  const clientRow = overview.find((r) => String(r.client_id).trim() === clientId);
  if (!clientRow) return [];

  const clientCmr = String(clientRow.cmr_number ?? "").trim();
  if (!clientCmr) return [];

  const rawCases = readCspCasesForCmr(clientCmr);
  const supportCases: SupportCase[] = rawCases.map((c) => ({
    caseNumber:      c.caseNumber,
    customerName:    c.customerName,
    cmrNumber:       c.cmrNumber,
    productName:     c.productName,
    productNameAlt:  c.productNameAlt ?? "",
    priority:        c.priority,
    initialSeverity: c.initialSeverity,
    currentSeverity: c.currentSeverity,
    maxSeverity:     c.maxSeverity,
    status:          c.status,
    openDate:        c.openDate,
    closeDate:       c.closeDate,
    summary:         c.summary,
    concept:         c.concept,
    hwSwSaas:        c.hwSwSaas ?? "",
    division:        c.division ?? "",
    segment:         c.segment ?? "",
    productVersion:  c.productVersion ?? "",
  }));

  return supportCases.filter((c) => {
    if (dateFilter?.openFrom || dateFilter?.openTo) {
      if (!inDateRange(c.openDate, dateFilter.openFrom, dateFilter.openTo)) return false;
    }
    if (dateFilter?.closeFrom || dateFilter?.closeTo) {
      if (!inDateRange(c.closeDate, dateFilter.closeFrom, dateFilter.closeTo)) return false;
    }
    if (dateFilter?.hwSwSaas) {
      // hwSwSaas can be a comma-separated list: e.g. "Software,SaaS"
      // A case passes if its hwSwSaas value matches ANY entry in the list.
      const allowed = dateFilter.hwSwSaas.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
      if (allowed.length > 0 && !allowed.includes(c.hwSwSaas.toLowerCase())) return false;
    }
    return true;
  });
}

/**
 * Return the CMR / Customer Number stored in ClientOverview for a given client_id.
 * This is the canonical "customer ID" shown in the Insights UI and used for
 * CSP case filtering and Clarizen product look-ups.
 */
export function getClientCmrNumber(clientId: string): string {
  const overview = safeReadClientOverview();
  const clientRow = overview.find((r) => String(r.client_id).trim() === clientId);
  return String(clientRow?.cmr_number ?? "").trim();
}

/**
 * Get EC product names for a client using the 3-step pipeline:
 *   1. Find the client's CMR number (= Clarizen Customer Number) from ClientOverview
 *   2. Look up all Clarizen rows for that customer — extract Product Code (UTL30) values
 *      (same customer number can have MULTIPLE rows for different UTL30 codes — take the union)
 *   3. Translate each UTL30 code → readable name via OCC data (SWS L30 Code → SWS L30 Desc)
 *
 * Falls back to empty array if any step yields nothing (gracefully degrades).
 */
/**
 * One EC/EM engagement — a single Clarizen row for the client, carrying the
 * project-level detail that {@link getEcProductsForClient} deliberately collapses
 * away. A client commonly has several engagements for the SAME product (same
 * UTL30 code, different work orders), so these are NOT deduplicated by product.
 */
export interface EcEngagement {
  /** Readable product name via OCC lookup; falls back to the raw UTL30 code. */
  productName: string;
  /** Clarizen "Name" — the project name. */
  projectName: string;
  /** Clarizen "IBM Work Number." (note the trailing period in the source data). */
  workOrderNumber: string;
  /** Clarizen "Product Code (UTL30)". */
  utl30Code: string;
}

/**
 * One contract for a client — a Clarizen work order.
 *
 * Distinct from {@link EcEngagement}, which Insights uses: that is
 * PRODUCT-scoped (one entry per UTL30 code, so a work order covering three
 * products yields three rows) and carries no dates or value. A contract is
 * WORK-ORDER-scoped — one row per contract, whatever products sit under it.
 * Both resolve their source rows through {@link getClarizenRowsForClient}, so
 * they always agree on which contracts belong to a customer.
 */
export interface Contract {
  /** Clarizen "IBM Work Number." — acts as the contract ID. */
  workOrderNumber: string;
  projectName: string;
  /** ISO YYYY-MM-DD, or "" when Clarizen has no date. */
  startDate: string;
  endDate: string;
  /** Annual contract value; null when absent. */
  acv: number | null;
  /** Total contract value, Clarizen "Work Number TCV (USD)"; null when absent. */
  tcv: number | null;
  /**
   * Clarizen "Owner" — the commercial/administrative role (utilisation, budget
   * and renewal tracking), NOT a technical one.
   *
   * null means Clarizen has no value, which is what makes the field editable in
   * the UI. A populated value locks the field read-only, so the nullability
   * here is load-bearing rather than cosmetic — do not collapse it to "".
   */
  owner: string | null;
  /** Holder that signed for the end customer, e.g. "Saudi Business Machines (SBM)"; null when held directly. */
  contractedThrough: string | null;
  /**
   * Clarizen "Primary Technical Account Manager", shown as Project Manager.
   * Same commercial/administrative role as Owner, and same null-means-editable
   * contract. Only ~59% populated, so blanks are common and expected.
   *
   * Distinct from a Delivery Consultant, who does the hands-on technical work
   * and is always maintained manually — never sourced from Clarizen.
   */
  primaryTam: string | null;
}

/**
 * Clarizen writes dates as Excel serial numbers (e.g. 46113 → 2026-04-01),
 * not date strings. Accepts an already-ISO value too, in case a future export
 * changes format.
 */
function clarizenDateToIso(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const serial = Number(s);
  if (!Number.isFinite(serial) || serial <= 1000) return "";
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
    .toISOString()
    .slice(0, 10);
}

/**
 * All contracts for a client, one per work order.
 *
 * A customer commonly holds several contracts, and each work order can appear
 * on multiple Clarizen rows (one per product), so rows are collapsed by work
 * order number. Where a field is blank on one row but present on another for
 * the same work order, the populated value wins — Owner and Primary TAM in
 * particular are inconsistently filled across a work order's rows.
 */
export function getContractsForClient(clientId: string): Contract[] {
  const byWorkOrder = new Map<string, Contract>();

  for (const row of getClarizenRowsForClient(clientId)) {
    // The source header carries a trailing period; accept the clean spelling
    // too in case a future export drops it.
    const workOrderNumber = String(
      row["IBM Work Number."] ?? row["IBM Work Number"] ?? "",
    ).trim();
    const projectName = String(row["Name"] ?? "").trim();
    if (!workOrderNumber && !projectName) continue;

    const key = workOrderNumber || `__no-wo__${projectName}`;
    const num = (v: unknown): number | null => {
      const s = String(v ?? "").trim();
      return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
    };
    // Blank stays null rather than "" — null is what makes the field editable.
    const text = (v: unknown): string | null => {
      const s = String(v ?? "").trim();
      return s === "" ? null : s;
    };

    const acv = num(row["ACV"]);
    const tcv = num(row["Work Number TCV (USD)"]);

    const existing = byWorkOrder.get(key);
    if (!existing) {
      byWorkOrder.set(key, {
        workOrderNumber,
        projectName,
        startDate: clarizenDateToIso(row["Work Number Start Date"]),
        endDate: clarizenDateToIso(row["Work Number End Date"]),
        acv,
        tcv,
        owner: text(row["Owner"]),
        primaryTam: text(row["Primary Technical Account Manager"]),
        contractedThrough: text(row.contractedThrough),
      });
      continue;
    }
    // Fill gaps from sibling rows of the same work order.
    if (!existing.projectName && projectName) existing.projectName = projectName;
    if (!existing.startDate) existing.startDate = clarizenDateToIso(row["Work Number Start Date"]);
    if (!existing.endDate) existing.endDate = clarizenDateToIso(row["Work Number End Date"]);
    if (existing.acv === null && acv !== null) existing.acv = acv;
    if (existing.tcv === null && tcv !== null) existing.tcv = tcv;
    if (existing.owner === null) existing.owner = text(row["Owner"]);
    if (existing.primaryTam === null) {
      existing.primaryTam = text(row["Primary Technical Account Manager"]);
    }
    if (existing.contractedThrough === null) existing.contractedThrough = text(row.contractedThrough);
  }

  // Most recent contract first; undated contracts sort last.
  return [...byWorkOrder.values()].sort((a, b) => {
    if (a.startDate && b.startDate) return b.startDate.localeCompare(a.startDate);
    if (a.startDate) return -1;
    if (b.startDate) return 1;
    return a.workOrderNumber.localeCompare(b.workOrderNumber);
  });
}

/**
 * THE single entry point for "which Clarizen rows belong to this client".
 *
 * Every Clarizen-derived view — EC products, EC engagements (Insights) and
 * contracts (Contract tab) — resolves its rows through here, so all of them
 * group by customer identically and cannot drift apart. When this moves to
 * Db2, this is the one function that changes.
 *
 * Matching tolerates the zero-padding difference between ClientOverview's
 * cmr_number and Clarizen's Customer Number.
 */
export function getClarizenRowsForClient(clientId: string): ClarizenCustomer[] {
  const overview = safeReadClientOverview();
  const clientRow = overview.find((r) => String(r.client_id).trim() === clientId);
  if (!clientRow) return [];

  const cmr = String(clientRow.cmr_number ?? "").trim();
  if (!cmr) return [];

  const normCmr = cmr.replace(/^0+/, "") || cmr;
  return readClarizenMaster().filter((c) => {
    const n = String(c.customerNumber ?? "").trim();
    return n === cmr || n.replace(/^0+/, "") === normCmr;
  });
}

/**
 * Structured EC/EM engagement rows for a client — same customer-matching
 * pipeline as {@link getEcProductsForClient}, but preserving one entry per
 * Clarizen row instead of reducing to a set of distinct product names.
 */
export function getEcEngagementsForClient(clientId: string): EcEngagement[] {
  const clarizenRows = getClarizenRowsForClient(clientId);

  const engagements: EcEngagement[] = [];
  for (const row of clarizenRows) {
    const utl30Code = String(row["Product Code (UTL30)"] ?? "").trim();
    // The source Excel header carries a trailing period ("IBM Work Number.");
    // accept the clean spelling too in case a future export drops it.
    const workOrderNumber = String(
      row["IBM Work Number."] ?? row["IBM Work Number"] ?? "",
    ).trim();
    const projectName = String(row["Name"] ?? "").trim();
    if (!utl30Code && !workOrderNumber && !projectName) continue;
    engagements.push({
      productName: (utl30Code && getOccProductName(utl30Code)) || utl30Code || "—",
      projectName,
      workOrderNumber,
      utl30Code,
    });
  }

  // Group by product so the UI can merge the product cell across its projects.
  engagements.sort(
    (a, b) =>
      a.productName.localeCompare(b.productName) ||
      a.projectName.localeCompare(b.projectName),
  );
  return engagements;
}

/** One EC product: Clarizen's code, plus the name the OCC catalog gives it. */
export interface EcProductEntry {
  /** Clarizen "Product Code (UTL30)" — the stable identity for this product. */
  code: string;
  /** OCC catalog name, or the raw code when the catalog has no entry for it. */
  name: string;
  /** True when the OCC catalog resolved the code to a real product name. */
  resolved: boolean;
}

/**
 * EC products for a client, carrying their UTL30 code.
 *
 * A sibling of {@link getEcProductsForClient} rather than a replacement: that
 * function feeds Insights and its behaviour is deliberately untouched. This one
 * exists because anything that STORES per-product state needs an identity that
 * survives a rename, and the code is the only stable one — an OCC catalog
 * upload can change the name for the same code.
 *
 * Unlike the name-only version, a code the catalog cannot resolve is still
 * returned, showing the raw code as its name. Dropping it would hide a product
 * the customer genuinely has; surfacing it lets someone give it a proper name.
 */
export function getEcProductEntriesForClient(clientId: string): EcProductEntry[] {
  const codes = new Set<string>();
  for (const row of getClarizenRowsForClient(clientId)) {
    const code = String(row["Product Code (UTL30)"] ?? "").trim();
    if (code) codes.add(code);
  }

  return [...codes].map((code) => {
    const name = getOccProductName(code);
    return { code, name: name ?? code, resolved: name !== null };
  });
}

export function getEcProductsForClient(clientId: string): string[] {
  // Steps 1+2: find all Clarizen rows for this customer → collect UTL30 codes
  const clarizenRows = getClarizenRowsForClient(clientId);
  if (clarizenRows.length === 0) return [];

  // Collect all distinct UTL30 codes across all Clarizen rows for this customer
  const utl30Codes = new Set<string>();
  for (const row of clarizenRows) {
    const code = String(row["Product Code (UTL30)"] ?? "").trim();
    if (code) utl30Codes.add(code);
  }

  if (utl30Codes.size === 0) return [];

  // Step 3: translate UTL30 codes → readable product names via OCC lookup
  const productNames: string[] = [];
  for (const code of utl30Codes) {
    const name = getOccProductName(code);
    if (name) productNames.push(name);
  }

  // If OCC not yet uploaded, fall back to raw UTL30 codes so insights still work
  if (productNames.length === 0) {
    return [...utl30Codes];
  }

  return productNames;
}

/**
 * Roll-up of a client's ACTIVE contracts, for the Client Overview summary.
 *
 * Every figure here is derived from the same Clarizen rows the Contract page
 * renders, so the two can never disagree.
 */
export interface ContractSummary {
  /** Sum of TCV across active contracts. 0 when there are none. */
  totalTcv: number;
  /** How many contracts are currently active. */
  activeCount: number;
  /** Earliest end date among active contracts, ISO; "" when there are none. */
  earliestRenewal: string;
  /** Holders that signed this customer's contracts on its behalf, e.g. SBM. Empty when held directly. */
  contractedThrough: string[];
}

/**
 * Summarise a client's live contractual position.
 *
 * A contract counts as active while its end date has not passed. Two edge
 * cases are decided deliberately:
 *
 *  - A contract that has not STARTED yet still counts. A renewal signed for
 *    next quarter is a live commitment, and dropping it would make an account
 *    look emptier than it is right before a renewal — exactly when the number
 *    is being looked at.
 *  - A BLANK end date does not count. With no end there is no renewal date to
 *    contribute, and in this data a missing end date is far more often an
 *    incomplete row than a genuinely open-ended contract.
 *
 * Expired contracts contribute nothing at all, so where a customer has renewed
 * onto a new work order only the current one is counted — which is the whole
 * point of the roll-up.
 */
export function getContractSummaryForClient(clientId: string): ContractSummary {
  const today = new Date().toISOString().slice(0, 10);
  const contracts = getContractsForClient(clientId);
  const contractedThrough = [
    ...new Set(contracts.map((c) => c.contractedThrough).filter((h): h is string => !!h)),
  ];
  const active = contracts.filter(
    (c) => c.endDate !== "" && c.endDate >= today,
  );

  let totalTcv = 0;
  let earliestRenewal = "";

  for (const c of active) {
    // A null TCV contributes nothing rather than breaking the sum. Every active
    // contract currently carries one, so this is a guard, not a common path.
    if (c.tcv !== null) totalTcv += c.tcv;
    // ISO dates compare correctly as strings.
    if (!earliestRenewal || c.endDate < earliestRenewal) earliestRenewal = c.endDate;
  }

  return { totalTcv, activeCount: active.length, earliestRenewal, contractedThrough };
}
