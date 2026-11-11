/**
 * Sales opportunity rules — the calculation.
 *
 * THE one implementation. The Executive Account Summary's Opportunities tiles
 * read its saved result, and a consolidated opportunity report must call this
 * same function rather than re-deriving the rules, so both always name the
 * same products. Thresholds live in constants/opportunityRules.ts.
 *
 * ── Input ──
 * The customer's saved report analysis, i.e. the same Software + SaaS cases the
 * Insights page shows, with service categories (Essential Management Service)
 * already kept out of the product breakdown. Nothing is re-read from CSP.
 *
 * ── When it runs ──
 * During the Run Reports batch only; the result is saved with the report and
 * read back unchanged on page view.
 *
 * ── The window ──
 * Counted back from the newest case in the whole CSP export, not from today
 * and not from this customer's own last case. Today would silently drop the
 * weeks between the export and the run; a per-customer anchor would judge a
 * customer whose last case was years ago on that old activity.
 */
import { OPPORTUNITY_RULES } from "@/constants/opportunityRules";
import { isSev1 } from "./caseDataReader";
import type { CaseAnalysis } from "./aiInsightsService";

export interface OpportunityProduct {
  productName: string;
  /** Cases in the window, all severities. */
  totalCases: number;
  /** Sev1 cases in the window — Priority, Initial, Current or Max Severity equals 1. */
  sev1Cases: number;
}

export interface OpportunityRulesResult {
  window: {
    /** First and last open dates included, YYYY-MM-DD. */
    start: string;
    end: string;
    lookbackMonths: number;
    /** Oldest case in the CSP export. */
    dataStart: string;
    /** False when the CSP export does not reach back to `start`. */
    fullWindow: boolean;
    /** Whole months of CSP data inside the window — equals lookbackMonths when full. */
    monthsAvailable: number;
  };
  /** Thresholds applied, recorded so a saved result explains itself. */
  thresholds: {
    essentialManagementSev1Above: number;
    expertiseConnectCasesAbove: number;
  };
  /** Non-EC products with more Sev1 cases than the threshold. Most Sev1 first. */
  essentialManagement: OpportunityProduct[];
  /** Non-EC products with more cases than the threshold. Most cases first. */
  expertiseConnect: OpportunityProduct[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function wholeMonthsBetween(fromIso: string, toIso: string): number {
  const days = (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000;
  return Math.max(0, Math.floor((days + 1) / 30.44));
}

/**
 * Apply the opportunity rules to one customer's analysis.
 *
 * `csp` is the date span of the whole CSP export — taken once per batch run,
 * so every customer in the run is judged over the same window.
 */
export function calculateOpportunityRules(
  analysis: CaseAnalysis,
  csp: { earliest: string; latest: string },
): OpportunityRulesResult {
  const months = OPPORTUNITY_RULES.lookbackMonths;
  const end = csp.latest;
  // A 12-month window ending 31 Aug 2026 starts 1 Sep 2025.
  const start = addDays(addMonths(end, -months), 1);
  const fullWindow = csp.earliest <= start;

  // Non-EC by the same classification the Insights page shows.
  const nonEc = new Set(analysis.nonEcProducts);

  const byProduct = new Map<string, OpportunityProduct>();
  for (const c of [...analysis.openCases, ...analysis.closedCases]) {
    if (!nonEc.has(c.productName)) continue;
    const opened = String(c.openDate ?? "").slice(0, 10);
    if (!ISO_DATE.test(opened) || opened < start || opened > end) continue;
    let p = byProduct.get(c.productName);
    if (!p) {
      p = { productName: c.productName, totalCases: 0, sev1Cases: 0 };
      byProduct.set(c.productName, p);
    }
    p.totalCases++;
    if (isSev1(c)) p.sev1Cases++;
  }
  const products = [...byProduct.values()];

  return {
    window: {
      start,
      end,
      lookbackMonths: months,
      dataStart: csp.earliest,
      fullWindow,
      monthsAvailable: fullWindow ? months : wholeMonthsBetween(csp.earliest, end),
    },
    thresholds: {
      essentialManagementSev1Above: OPPORTUNITY_RULES.essentialManagementSev1Above,
      expertiseConnectCasesAbove: OPPORTUNITY_RULES.expertiseConnectCasesAbove,
    },
    essentialManagement: products
      .filter((p) => p.sev1Cases > OPPORTUNITY_RULES.essentialManagementSev1Above)
      .sort((a, b) => b.sev1Cases - a.sev1Cases || a.productName.localeCompare(b.productName)),
    expertiseConnect: products
      .filter((p) => p.totalCases > OPPORTUNITY_RULES.expertiseConnectCasesAbove)
      .sort((a, b) => b.totalCases - a.totalCases || a.productName.localeCompare(b.productName)),
  };
}
