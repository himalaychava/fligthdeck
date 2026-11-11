/**
 * Executive Account Summary — read path.
 *
 * Builds the tile array the frontend renders. Numbers come from `collectSummaryFacts`
 * every time — never from a stored value — so a tile can never show a number
 * that has drifted from the report it belongs to. Captions come from whatever
 * Bob wrote during the last batch run; before the first run, or if that run's
 * captions were rejected, `buildTiles` falls back to its own deterministic
 * defaults, so a tile is never blank and never shows a fabricated number.
 */
import { readReport } from "./reportStore";
import { safeReadClientOverview } from "./caseDataReader";
import { collectSummaryFacts } from "./executiveSummaryFacts";
import { buildTiles, GROUP_LABELS, type TileGroup, type TileSpec } from "./executiveSummaryTiles";
import { buildNarrativeTemplate, type NarrativeSummary } from "./executiveSummaryNarrative";

export interface ExecutiveSummaryResult {
  clientId: string;
  clientName: string;
  /** The descriptive paragraph above the tiles, plus its EC product bullets. */
  narrative: NarrativeSummary & {
    ecProductNames: string[];
    eosExpiredProducts: string[];
    eosExpiringSoonProducts: string[];
  };
  groups: { group: TileGroup; label: string; tiles: TileSpec[] }[];
  aiGenerated: boolean;
  generatedAt: string | null;
  reportGeneratedAt: string | null;
  hasSavedSummary: boolean;
}

function clientNameFor(clientId: string): string {
  const row = safeReadClientOverview().find(
    (r) => String(r.client_id ?? "").trim() === clientId,
  );
  return String(row?.client_name ?? "").trim() || clientId;
}

export async function buildExecutiveSummary(clientId: string): Promise<ExecutiveSummaryResult> {
  const report = await readReport(clientId);
  const clientName = report?.analysis?.clientName || clientNameFor(clientId);
  const facts = collectSummaryFacts(clientId, clientName, report);

  const saved = report?.executiveSummary;
  const hasSavedSummary = !!saved && Object.keys(saved.captions ?? {}).length > 0;
  const tiles = buildTiles(facts, hasSavedSummary ? saved!.captions : null);

  const order: TileGroup[] = ["products", "support", "opportunities"];
  const groups = order.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    tiles: tiles.filter((t) => t.group === group),
  }));

  // The paragraph falls back to the deterministic template when the run has not
  // written one yet, exactly as the tiles fall back to default captions — so a
  // customer never sees the section half-populated. Product names always come
  // from the facts, never from the saved copy, so they cannot drift.
  const savedNarrative = saved?.narrative;
  const narrative = {
    ...(savedNarrative ?? { ...buildNarrativeTemplate(facts), aiGenerated: false }),
    // Product names always come from the facts, never the saved copy, so the
    // lists under each bullet cannot drift from the tiles or from Insights.
    ecProductNames: facts.ecProductNames,
    eosExpiredProducts: facts.eosExpiredProducts,
    eosExpiringSoonProducts: facts.eosExpiringSoonProducts,
  };

  return {
    clientId,
    clientName,
    narrative,
    groups,
    aiGenerated: hasSavedSummary ? saved!.aiGenerated : false,
    generatedAt: hasSavedSummary ? saved!.generatedAt : null,
    reportGeneratedAt: report?.savedAt ?? null,
    hasSavedSummary,
  };
}
