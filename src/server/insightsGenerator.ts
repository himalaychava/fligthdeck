/**
 * Insights Generator
 * ──────────────────
 * One client → one complete insights report.
 *
 * Extracted from the GET /api/demo/insights/:clientId handler so that the live
 * page and the batch runner produce *identical* reports. Two implementations
 * would drift, and a report the batch wrote would stop matching what a live
 * regenerate produces.
 *
 * Nothing is summarised or dropped at save time: the stored report holds the
 * full CaseAnalysis and the full aiInsights map, exactly as the Insights page
 * receives them.
 */
import {
  getCasesForClient,
  getEcProductsForClient,
  getEcEngagementsForClient,
  getClientCmrNumber,
  type CaseDateFilter,
} from "./caseDataReader";
import { analyseCases, generateAllInsights } from "./aiInsightsService";
import type { DataRange } from "./insightsCacheService";
import type { StoredReport } from "./reportStore";
import { clientSourceFingerprint } from "./reportFingerprint";
import { collectSummaryFacts } from "./executiveSummaryFacts";
import { generateExecutiveSummaryCaptions } from "./executiveSummaryAi";
import { generateNarrative } from "./executiveSummaryNarrative";
import { calculateOpportunityRules } from "./opportunityRules";
import { safeReadClientOverview } from "./caseDataReader";

/** Why a client produced no report. Distinguishes "skip" from "fail". */
export type NoDataReason = "no-cases" | "no-software-cases";

export type GenerateOutcome =
  /** A full report, or a contract-only one when `contractOnly` is set. */
  | { ok: true; report: StoredReport; contractOnly?: boolean }
  | { ok: false; skipped: true; reason: NoDataReason }
  | { ok: false; skipped: false; error: string };

export interface GenerateOptions {
  /** Who or what triggered generation — recorded on the report. */
  generatedBy?: string;
  /** Skip the Bob CLI calls. Used by batch runs configured for speed. */
  skipAi?: boolean;
  /** Date filter, as the live endpoint accepts. Batch runs pass none. */
  dateFilter?: CaseDateFilter;
  /**
   * Write the Executive Account Summary into the report. Only batch runs set
   * this — the summary is generated once per run, never on page view.
   */
  withExecutiveSummary?: boolean;
  /**
   * Produce a contract-only report for a customer with no cases, instead of
   * reporting them as skipped. Such a customer still has contracts and still
   * needs a summary saying there are no cases.
   */
  allowNoCaseData?: boolean;
  /**
   * Open-date span of the whole CSP export. When given, the sales opportunity
   * rules are calculated and saved with the report. Only batch runs pass it —
   * the rules are never calculated on page view.
   */
  cspDateRange?: { earliest: string; latest: string };
}

/**
 * Build the complete report for one client.
 *
 * Returns a discriminated result rather than throwing, because the batch runner
 * must tell "this client has no case data" (expected, skip) apart from "this
 * client blew up" (a failure worth reporting) and carry on either way.
 */
/** Display name for a client that has no cases to take one from. */
function clientNameFor(clientId: string): string {
  const row = safeReadClientOverview().find(
    (r) => String(r.client_id ?? "").trim() === clientId,
  );
  return String(row?.client_name ?? "").trim() || clientId;
}

export async function generateReportForClient(
  clientId: string,
  opts: GenerateOptions = {},
): Promise<GenerateOutcome> {
  try {
    const dateFilter: CaseDateFilter = opts.dateFilter ?? {
      // Default matches the live endpoint: Software + SaaS.
      hwSwSaas: "Software,SaaS",
    };

    let cases = getCasesForClient(clientId, dateFilter);
    let usedFilter: CaseDateFilter = { ...dateFilter };

    // Same fallback as the live endpoint: if a client's cases predate the
    // hwSwSaas backfill, the column is blank and filtering on it hides
    // everything. Fall back to all cases only in that specific situation.
    if (cases.length === 0) {
      const allCases = getCasesForClient(clientId, { ...dateFilter, hwSwSaas: undefined });
      const hasBlankHwSw = allCases.some((c) => !c.hwSwSaas || c.hwSwSaas.trim() === "");
      if (hasBlankHwSw) {
        usedFilter = { ...dateFilter, hwSwSaas: undefined };
        cases = allCases;
      } else if (allCases.length > 0) {
        if (!opts.allowNoCaseData) {
          return { ok: false, skipped: true, reason: "no-software-cases" };
        }
        return { ok: true, ...(await contractOnlyReport(clientId, opts)) };
      }
    }

    if (cases.length === 0) {
      if (!opts.allowNoCaseData) {
        return { ok: false, skipped: true, reason: "no-cases" };
      }
      return { ok: true, ...(await contractOnlyReport(clientId, opts)) };
    }

    const openDates = cases.map((c) => c.openDate).filter(Boolean).sort();
    const dataRange: DataRange = {
      earliest: openDates[0] ?? "",
      latest: openDates[openDates.length - 1] ?? "",
      totalCases: cases.length,
    };

    const ecProducts = getEcProductsForClient(clientId);
    const clientName = cases[0]?.customerName ?? clientId;
    const customerId = getClientCmrNumber(clientId);
    const ecEngagements = getEcEngagementsForClient(clientId);

    const analysis = analyseCases(cases, clientName, ecProducts, customerId, ecEngagements);

    // The AI sections are the expensive half — six Bob CLI processes per
    // client. skipAi produces a structurally complete report with those
    // sections marked unavailable, which the UI already renders correctly
    // because that is what it shows when Bob fails.
    const aiInsights = opts.skipAi
      ? ({
          summary: { type: "summary", aiText: null, aiAvailable: false, raw: null },
          sev1: { type: "sev1", aiText: null, aiAvailable: false, raw: null },
          status: { type: "status", aiText: null, aiAvailable: false, raw: null },
          painPoints: { type: "painPoints", aiText: null, aiAvailable: false, raw: null },
          opportunity: { type: "opportunity", aiText: null, aiAvailable: false, raw: null },
          keywords: { type: "keywords", aiText: null, aiAvailable: false, raw: null },
        } as StoredReport["aiInsights"])
      : await generateAllInsights(analysis);

    const hasFilter = !!(
      usedFilter.openFrom ||
      usedFilter.openTo ||
      usedFilter.closeFrom ||
      usedFilter.closeTo ||
      usedFilter.hwSwSaas
    );

    const report: StoredReport = {
      clientId,
      hasCaseData: true,
      savedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      dateFilter: hasFilter ? usedFilter : undefined,
      dataRange,
      analysis,
      aiInsights,
      // Stamped so a later run can tell whether the underlying data moved.
      sourceFingerprint: clientSourceFingerprint(clientId),
      aiIncluded: !opts.skipAi,
    } as StoredReport;

    if (opts.cspDateRange) {
      report.opportunityRules = calculateOpportunityRules(analysis, opts.cspDateRange);
    }

    if (opts.withExecutiveSummary) {
      const facts = collectSummaryFacts(clientId, analysis.clientName || clientId, report);
      // Captions and narrative are generated together, in the same run, so the
      // paragraph and the tiles beneath it always describe the same snapshot.
      const [gen, narrative] = await Promise.all([
        generateExecutiveSummaryCaptions(facts),
        generateNarrative(facts),
      ]);
      report.executiveSummary = {
        captions: gen.captions,
        narrative,
        aiGenerated: gen.aiGenerated,
        generatedAt: gen.generatedAt,
      };
    }

    return { ok: true, report };
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : String(e) };
  }
}


/**
 * A report for a customer with no CSP cases.
 *
 * Carries no analysis — there is nothing to analyse — but still holds the
 * Executive Account Summary, which can speak to contracts and say plainly that
 * no cases exist. Without this, 385 customers would show an empty panel.
 */
async function contractOnlyReport(
  clientId: string,
  opts: GenerateOptions,
): Promise<{ report: StoredReport; contractOnly: true }> {
  const report = {
    clientId,
    hasCaseData: false,
    savedAt: new Date().toISOString(),
    generatedBy: opts.generatedBy,
    sourceFingerprint: clientSourceFingerprint(clientId),
    aiIncluded: !opts.skipAi,
  } as unknown as StoredReport;

  if (opts.withExecutiveSummary) {
    const facts = collectSummaryFacts(clientId, clientNameFor(clientId), null);
    const [gen, narrative] = await Promise.all([
      generateExecutiveSummaryCaptions(facts),
      generateNarrative(facts),
    ]);
    report.executiveSummary = {
      captions: gen.captions,
      narrative,
      aiGenerated: gen.aiGenerated,
      generatedAt: gen.generatedAt,
    };
  }

  return { report, contractOnly: true };
}
