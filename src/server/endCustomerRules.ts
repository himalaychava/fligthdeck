/**
 * End-customer filing for reseller-held Clarizen contracts.
 *
 * Clarizen now carries the end customer next to the contract holder:
 *   "Customer Name" + first "Customer Number"   → the contract holder
 *   "Customer"      + second "Customer Number"  → the end customer
 *
 * Both number columns share one header, so they are told apart by POSITION:
 * the first is the holder (unchanged — every customer keeps working as
 * before), the second the end customer. A later rename of the second column
 * to "End Customer Number" is recognised too.
 *
 * For holders listed in constants/endCustomerRules.ts, a contract is filed
 * under its end customer at upload time: `customerNumber` / `customerName`
 * become the end customer's, and the holder is kept on the row as
 * `holderCustomerNumber`, `holderCustomerName` and `contractedThrough`.
 * Everything downstream — contracts, EC products, Geo/Market, onboarding, CSP
 * cases — already keys off `customerNumber`, so it follows with no change.
 *
 * A holder page whose contracts have all moved is hidden.
 */
import * as XLSX from "xlsx";
import {
  END_CUSTOMER_DISPLAY_NAMES,
  END_CUSTOMER_HOLDER_RULES,
  type EndCustomerHolderRule,
} from "@/constants/endCustomerRules";
import { readClarizenMaster, type ClarizenCustomer } from "./dataIngestionService";

// ── Rule data (swap these two for Db2 queries when the data moves) ───────────

function getHolderRules(): readonly EndCustomerHolderRule[] {
  return END_CUSTOMER_HOLDER_RULES;
}

function getDisplayName(customerNumber: string): string | null {
  const n = normNumber(customerNumber);
  return (
    END_CUSTOMER_DISPLAY_NAMES.find((d) => normNumber(d.customerNumber) === n)?.displayName ?? null
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const text = (v: unknown): string => String(v ?? "").trim();

/** Customer numbers compare without leading zeros, as everywhere else. */
function normNumber(v: unknown): string {
  const s = text(v);
  return s.replace(/^0+/, "") || s;
}

const loose = (v: unknown): string =>
  text(v)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// ── Reading the end-customer columns ─────────────────────────────────────────

export interface EndCustomerColumns {
  name: number | null;
  number: number | null;
}

function cellText(sheet: XLSX.WorkSheet, r: number, c: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
  return text(cell?.v ?? cell?.w);
}

/**
 * Find the end-customer columns in the header row, by position.
 * Old dumps without them return nulls, which leaves every row as it is.
 */
export function findEndCustomerColumns(
  sheet: XLSX.WorkSheet,
  headerRow: number,
): EndCustomerColumns {
  const ref = sheet["!ref"];
  if (!ref) return { name: null, number: null };
  const range = XLSX.utils.decode_range(ref);
  const numberCols: number[] = [];
  let named: number | null = null;
  let endNumber: number | null = null;
  let endName: number | null = null;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const h = cellText(sheet, headerRow, c).toLowerCase();
    if (h === "customer number") numberCols.push(c);
    else if (h === "end customer number") endNumber ??= c;
    else if (h === "end customer" || h === "end customer name") endName ??= c;
    else if (h === "customer") named ??= c;
  }
  return { name: endName ?? named, number: endNumber ?? numberCols[1] ?? null };
}

/** The end-customer fields for one parsed row (SheetJS records each row's sheet position). */
export function readEndCustomer(
  sheet: XLSX.WorkSheet,
  cols: EndCustomerColumns,
  row: object,
): { endCustomerName: string; endCustomerNumber: string } {
  const r = (row as { __rowNum__?: number }).__rowNum__;
  if (r === undefined) return { endCustomerName: "", endCustomerNumber: "" };
  return {
    endCustomerName: cols.name === null ? "" : cellText(sheet, r, cols.name),
    endCustomerNumber: cols.number === null ? "" : cellText(sheet, r, cols.number),
  };
}

// ── Applying the rule at upload ──────────────────────────────────────────────

export interface EndCustomerSummary {
  holder: string;
  /** Contracts now filed under their end customer. */
  assigned: number;
  endCustomers: { customerNumber: string; name: string; contracts: number }[];
  /** Holder rows that stayed on the holder page, and why. */
  keptOnHolder: { workOrder: string; reason: string }[];
  /** End customers with no display name yet — they show Clarizen's "Customer" value. */
  unnamed: { customerNumber: string; name: string }[];
}

function workOrderOf(c: ClarizenCustomer): string {
  return text(c["IBM Work Number."] ?? c["IBM Work Number"]);
}

/**
 * File reseller-held rows under their end customer, in place.
 *
 * A row moves only when BOTH the holder's customer number and its name match
 * a rule, and the row carries an end-customer number different from the
 * holder's. Anything else stays where it is and is reported.
 */
export function applyEndCustomerRules(customers: ClarizenCustomer[]): EndCustomerSummary[] {
  const summaries: EndCustomerSummary[] = [];
  for (const rule of getHolderRules()) {
    const holderNo = normNumber(rule.holderCustomerNumber);
    const holderName = loose(rule.holderNameContains);
    const summary: EndCustomerSummary = {
      holder: rule.holderDisplayName,
      assigned: 0,
      endCustomers: [],
      keptOnHolder: [],
      unnamed: [],
    };
    const ends = new Map<string, { customerNumber: string; name: string; contracts: number }>();

    for (const c of customers) {
      const numberMatches = normNumber(c.customerNumber) === holderNo;
      const nameMatches = loose(c.customerName).includes(holderName);
      if (!numberMatches && !nameMatches) continue;
      if (!numberMatches || !nameMatches) {
        summary.keptOnHolder.push({
          workOrder: workOrderOf(c),
          reason: numberMatches
            ? `Customer Number matches but Customer Name is "${text(c.customerName)}"`
            : `Customer Name matches but Customer Number is ${text(c.customerNumber) || "blank"}`,
        });
        continue;
      }

      const endNo = text(c.endCustomerNumber);
      if (!endNo || normNumber(endNo) === holderNo) {
        summary.keptOnHolder.push({
          workOrder: workOrderOf(c),
          reason: endNo ? "End customer number is the holder's own" : "No end customer number",
        });
        continue;
      }

      const display = getDisplayName(endNo);
      const endName = display ?? (text(c.endCustomerName) || endNo);
      c.holderCustomerNumber = text(c.customerNumber);
      c.holderCustomerName = text(c.customerName);
      c.contractedThrough = rule.holderDisplayName;
      c.customerNumber = endNo;
      c.customerName = endName;
      summary.assigned++;

      const key = normNumber(endNo);
      const e = ends.get(key) ?? { customerNumber: endNo, name: endName, contracts: 0 };
      e.contracts++;
      ends.set(key, e);
      if (!display && !summary.unnamed.some((u) => normNumber(u.customerNumber) === key)) {
        summary.unnamed.push({ customerNumber: endNo, name: endName });
      }
    }

    summary.endCustomers = [...ends.values()];
    if (summary.assigned > 0 || summary.keptOnHolder.length > 0) summaries.push(summary);
  }
  return summaries;
}

// ── Hiding a holder page whose contracts have all moved ──────────────────────

let hiddenMemo: { source: ClarizenCustomer[]; hidden: Set<string> } | null = null;

function hiddenHolderNumbers(): Set<string> {
  const rows = readClarizenMaster();
  if (hiddenMemo && hiddenMemo.source === rows) return hiddenMemo.hidden;
  const hidden = new Set<string>();
  for (const rule of getHolderRules()) {
    const n = normNumber(rule.holderCustomerNumber);
    const stillFiled = rows.some((r) => normNumber(r.customerNumber) === n);
    const moved = rows.some((r) => normNumber(r.holderCustomerNumber) === n);
    if (moved && !stillFiled) hidden.add(n);
  }
  hiddenMemo = { source: rows, hidden };
  return hidden;
}

/** A holder page with no contracts left after its rows moved to end customers. */
export function isHiddenHolderPage(customerNumber: unknown): boolean {
  const n = normNumber(customerNumber);
  return n !== "" && hiddenHolderNumbers().has(n);
}
