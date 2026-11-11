/**
 * Executive Account Summary — the facts.
 *
 * Every figure the summary can mention, computed exactly from the saved report
 * and the customer's contracts.
 *
 * ── Why the numbers are computed and not left to Bob ──
 * The summary is the first thing a seller reads before a customer
 * conversation, and it is mostly counts. A language model asked to count will
 * sometimes be wrong, and a wrong figure here reaches the customer with nothing
 * in between to catch it. So arithmetic is done here, and Bob is handed the
 * answers as facts to phrase — it chooses what to say and how, never what the
 * numbers are.
 *
 * Each field is nullable where "absent" and "zero" mean different things, so a
 * customer with no case data can be described as having none rather than as
 * having zero of everything.
 */
import { getContractsForClient } from "./caseDataReader";
import { getClientGeoMarket } from "./geoMarketService";
import type { CaseAnalysis } from "./aiInsightsService";
import type { StoredReport } from "./reportStore";
import type { OpportunityRulesResult } from "./opportunityRules";

export interface SummaryFacts {
  clientId: string;
  clientName: string;

  /**
   * Geography from Clarizen. Empty string when Clarizen has no row for this
   * customer — never inferred, per the decision to stop deriving geo/market.
   */
  geo: string;

  /** False when the customer has no CSP cases at all — not zero, absent. */
  hasCaseData: boolean;

  // ── Case-derived. All null when hasCaseData is false. ──
  totalCases: number | null;
  sev1Cases: number | null;
  ecProductCount: number | null;
  /** The actual EC product names, for the narrative's bulleted list. */
  ecProductNames: string[];

  /**
   * Products already past end of support, and products reaching it within the
   * next 12 months. DISTINCT PRODUCT NAMES, not product-version rows — a
   * product running three unsupported versions is one product to a seller,
   * though it is three rows in the Insights upgrades table.
   */
  eosExpiredProducts: string[];
  eosExpiringSoonProducts: string[];
  nonEcProductCount: number | null;
  ecUpgradeCount: number | null;
  /**
   * DISTINCT Non-EC products past or nearing end of support — the Expertise
   * Connect & Migration opportunity. Products, not product-version rows, so it
   * agrees with the end-of-support line in the paragraph above the tiles.
   */
  nonEcUpgradeCount: number | null;
  /**
   * Sales opportunity rules as saved by the last batch run — read, never
   * recalculated here. Null when the report predates the rules or has no cases.
   */
  opportunityRules: OpportunityRulesResult | null;
  /** Product carrying the most Sev2 cases; null when no Sev2 exists. */
  maxSev2: { productName: string; count: number } | null;
  /** Date range of the cases the report was built from. */
  caseWindow: { earliest: string; latest: string } | null;

  // ── Contract-derived. Always present; counts may legitimately be zero. ──
  contractCount: number;
  activeContractCount: number;
  /** Earliest contract yet to expire. */
  nextExpiry: { workOrderNumber: string; endDate: string } | null;
  /** Contracts whose end date has passed. */
  expired: { workOrderNumber: string; endDate: string }[];
  /** Contracts with no end date recorded, so neither active nor expired. */
  undatedContractCount: number;
}

/**
 * Distinct product names at a given lifecycle status.
 *
 * upgradeCandidates holds one row per (product, version), so a product with
 * several unsupported versions appears more than once. Deduplicated by name
 * and sorted so the same data always produces the same list.
 */
function distinctProductsByStatus(
  analysis: CaseAnalysis | null,
  status: "Expired" | "Expiring Soon",
): string[] {
  if (!analysis) return [];
  const names = new Set(
    analysis.upgradeCandidates
      .filter((u) => u.lifecycleStatus === status)
      .map((u) => u.productName.trim())
      .filter(Boolean),
  );
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Today, as YYYY-MM-DD, so "expired" does not flip mid-day. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Product with the most Sev2 cases.
 *
 * Ties break on product name so identical data always names the same product;
 * without that, two products on equal counts would swap between runs on array
 * order alone.
 */
function maxSev2Product(analysis: CaseAnalysis): SummaryFacts["maxSev2"] {
  const ranked = analysis.productStats
    .filter((s) => s.sev2Cases > 0)
    .sort((a, b) => b.sev2Cases - a.sev2Cases || a.productName.localeCompare(b.productName));
  if (ranked.length === 0) return null;
  return { productName: ranked[0].productName, count: ranked[0].sev2Cases };
}

/**
 * Gather every fact for one customer.
 *
 * `report` may be null — a customer with no case data still has contracts, and
 * still deserves a summary saying so.
 */
export function collectSummaryFacts(
  clientId: string,
  clientName: string,
  report: StoredReport | null,
): SummaryFacts {
  const analysis = report?.analysis ?? null;

  const contracts = getContractsForClient(clientId);
  const cutoff = today();
  const dated = contracts.filter((c) => c.endDate);
  const expired = dated
    .filter((c) => c.endDate < cutoff)
    .map((c) => ({ workOrderNumber: c.workOrderNumber, endDate: c.endDate }))
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || a.workOrderNumber.localeCompare(b.workOrderNumber));
  const upcoming = dated
    .filter((c) => c.endDate >= cutoff)
    .map((c) => ({ workOrderNumber: c.workOrderNumber, endDate: c.endDate }))
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || a.workOrderNumber.localeCompare(b.workOrderNumber));

  return {
    clientId,
    clientName,
    geo: getClientGeoMarket(clientId).geo,
    hasCaseData: !!analysis,

    totalCases: analysis ? analysis.totalCases : null,
    sev1Cases: analysis ? analysis.sev1Cases : null,
    ecProductCount: analysis ? analysis.ecProducts.length : null,
    ecProductNames: analysis ? [...analysis.ecProducts] : [],
    eosExpiredProducts: distinctProductsByStatus(analysis, "Expired"),
    eosExpiringSoonProducts: distinctProductsByStatus(analysis, "Expiring Soon"),
    nonEcProductCount: analysis ? analysis.nonEcProducts.length : null,
    ecUpgradeCount: analysis ? analysis.upgradeCandidates.filter((u) => u.isEC).length : null,
    nonEcUpgradeCount: analysis
      ? new Set(analysis.upgradeCandidates.filter((u) => !u.isEC).map((u) => u.productName.trim())).size
      : null,
    opportunityRules: analysis ? (report?.opportunityRules ?? null) : null,
    maxSev2: analysis ? maxSev2Product(analysis) : null,
    caseWindow:
      analysis && report?.dataRange
        ? { earliest: report.dataRange.earliest, latest: report.dataRange.latest }
        : null,

    contractCount: contracts.length,
    activeContractCount: upcoming.length,
    nextExpiry: upcoming[0] ?? null,
    expired,
    undatedContractCount: contracts.length - dated.length,
  };
}

/**
 * The computed summary, as bullet lines.
 *
 * Used two ways: as the fallback before a customer's first AI summary exists or
 * when Bob fails, and as the fact sheet handed to Bob. Writing it once means
 * the fallback can never disagree with what the AI was told.
 */
export function factsToBullets(f: SummaryFacts): string[] {
  const out: string[] = [];

  if (!f.hasCaseData) {
    out.push("No cases raised for this customer, hence no case-related insights available");
  } else {
    out.push(`${f.totalCases} support cases in the reporting window`);
    out.push(
      f.sev1Cases === 0
        ? "No Sev1 cases raised — no critical escalations on record"
        : `${f.sev1Cases} Sev1 cases raised`,
    );
    out.push(`${f.ecProductCount} EC products and ${f.nonEcProductCount} Non-EC products under support`);
    out.push(
      f.ecUpgradeCount === 0
        ? "No EC upgrade opportunities — EC products are on current versions"
        : `${f.ecUpgradeCount} upgrade opportunities across EC products`,
    );
    out.push(
      f.nonEcUpgradeCount === 0
        ? "No Non-EC upgrade opportunities — all products on up-to-date versions"
        : `${f.nonEcUpgradeCount} upgrade opportunities across Non-EC products`,
    );
    out.push(
      f.maxSev2
        ? `${f.maxSev2.productName} carries the most Sev2 cases (${f.maxSev2.count})`
        : "No Sev2 cases recorded against any product",
    );
  }

  if (f.contractCount === 0) {
    out.push("No active contracts, hence no expansion possibility at this time");
  } else {
    out.push(`${f.contractCount} contracts on record, ${f.activeContractCount} still active`);
    out.push(
      f.nextExpiry
        ? `Earliest expiry: ${f.nextExpiry.workOrderNumber} on ${f.nextExpiry.endDate}`
        : "No contract end dates recorded, so no renewal date can be identified",
    );
    if (f.expired.length > 0) {
      out.push(
        `${f.expired.length} already expired: ${f.expired.map((c) => c.workOrderNumber).join(", ")}`,
      );
    }
  }

  return out;
}
