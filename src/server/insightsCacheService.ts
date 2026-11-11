/**
 * Insights Cache Service
 * ──────────────────────
 * Persists generated insights for each client to disk so the page loads
 * instantly without re-calling Bob CLI every time.
 *
 * Storage: one JSON file per client at
 *   {dataDir}/insights_cache/{clientId}.json
 *
 * Schema: { savedAt, generatedBy, analysis, aiInsights }
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";
import type { CaseAnalysis, InsightResult, InsightType } from "./aiInsightsService";
import type { OpportunityRulesResult } from "./opportunityRules";

export interface DataRange {
  earliest: string; // YYYY-MM-DD — earliest openDate in the matched cases
  latest: string; // YYYY-MM-DD — latest openDate in the matched cases
  totalCases: number;
}

export interface SavedInsights {
  clientId: string;
  /** False for a contract-only report: the customer has no CSP cases. */
  hasCaseData: boolean;
  savedAt: string; // ISO timestamp
  generatedBy?: string; // email of user who triggered generation
  dateFilter?: {
    // the filter applied when generating (null = all data)
    openFrom?: string;
    openTo?: string;
    closeFrom?: string;
    closeTo?: string;
  };
  dataRange?: DataRange; // actual min/max openDate of the cases used
  analysis: CaseAnalysis;
  aiInsights: Record<InsightType, InsightResult>;

  /**
   * Fingerprint of the source data at generation time — see reportFingerprint.
   * Absent on reports written before batch generation existed; those are
   * treated as stale, which is the safe default.
   */
  sourceFingerprint?: string;

  /**
   * False when the report was generated with the AI sections skipped, so the
   * UI can offer a live regenerate instead of implying Bob had nothing to say.
   */
  aiIncluded?: boolean;

  /**
   * When the AI sections were produced, if they were carried over from an
   * earlier run rather than regenerated. Absent means "same as savedAt".
   */
  aiGeneratedAt?: string;

  /**
   * The Executive Account Summary, written during the batch run and read back
   * on page load. Generated once so every user sees identical wording until the
   * next run — regenerating on view would change it under people mid-call.
   */
  /**
   * Sales opportunity rules (server/opportunityRules.ts), calculated during the
   * batch run and read back unchanged. Absent on reports from before the rules
   * existed, and on contract-only reports, which have no cases to judge.
   */
  opportunityRules?: OpportunityRulesResult;

  executiveSummary?: {
    /** Bob's short per-tile caption text, keyed by CAPTION_KEYS. */
    captions: Record<string, string>;
    /**
     * The descriptive paragraph shown above the tiles. Sentences only — the
     * EC product list is rebuilt from the analysis at read time so the names
     * can never drift from the tiles beneath them.
     */
    narrative?: {
      intro: string;
      contracts: string;
      totals: string;
      endOfSupport: string;
      aiGenerated: boolean;
    };
    aiGenerated: boolean;
    generatedAt: string;
  };
}

function cacheDir(): string {
  return path.join(path.dirname(getExcelFilePath()), "insights_cache");
}

function cachePath(clientId: string): string {
  // Sanitise clientId so it's safe as a filename
  const safe = clientId.replace(/[^a-zA-Z0-9_\-]/g, "_");
  return path.join(cacheDir(), `${safe}.json`);
}

/**
 * Backfill fields added to CaseAnalysis after a file was written.
 *
 * Saved insights persist the ENTIRE analysis object, so a file written before
 * a field existed replays into the UI with that field undefined. That is not
 * hypothetical: `hiddenSupportedVersions` shipped without this guard and every
 * saved file predating it crashed the Insights page outright.
 *
 * Defaults here must match what the live path produces for "nothing to show",
 * so an old file degrades to an empty section rather than a broken one.
 */
export function backfillAnalysisShape(saved: SavedInsights): SavedInsights {
  const analysis = saved.analysis as SavedInsights["analysis"] | undefined;
  if (!analysis) return saved;

  analysis.upgradeCandidates = (analysis.upgradeCandidates ?? []).map((u) => ({
    ...u,
    hiddenSupportedVersions: u.hiddenSupportedVersions ?? [],
    isEC: u.isEC ?? false,
  }));
  analysis.unmappedProducts = (analysis.unmappedProducts ?? []).map((p) => ({
    ...p,
    matchedProductName: p.matchedProductName ?? "",
    alternativeProductName: p.alternativeProductName ?? "",
  }));
  analysis.ecEngagements = analysis.ecEngagements ?? [];
  analysis.serviceCategories = analysis.serviceCategories ?? [];

  return saved;
}

export function readSavedInsights(clientId: string): SavedInsights | null {
  try {
    const p = cachePath(clientId);
    if (!fs.existsSync(p)) return null;
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as SavedInsights;
    return backfillAnalysisShape(parsed);
  } catch {
    return null;
  }
}

export function writeSavedInsights(data: SavedInsights): void {
  const dir = cacheDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath(data.clientId), JSON.stringify(data), "utf-8");
}

export function deleteSavedInsights(clientId: string): void {
  try {
    fs.unlinkSync(cachePath(clientId));
  } catch {
    /* ignore */
  }
}
