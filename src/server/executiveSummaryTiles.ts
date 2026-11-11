/**
 * Executive Account Summary — tile schema.
 *
 * Tiles in three groups (Products, Support Activity, Opportunities), built
 * from SummaryFacts. This module owns
 * everything that must be IDENTICAL for the same data — which tiles exist,
 * their numbers, their color state, their icon — so none of that varies
 * between customers or between runs for arbitrary reasons.
 *
 * The one thing Bob supplies is the caption: a short line of context under each
 * number ("All current", "Needs attention") or, for an empty tile, the message
 * that replaces the number entirely. Bob never originates a number — every
 * value here is read straight from SummaryFacts, which is computed exactly.
 * See executiveSummaryAi.ts for why.
 */
import type { SummaryFacts } from "./executiveSummaryFacts";
import type { OpportunityProduct } from "./opportunityRules";
import { OPPORTUNITY_RULES } from "@/constants/opportunityRules";

/**
 * Contracts deliberately has no tile group — contract facts are carried by the
 * descriptive summary above the grid instead, so they are stated once rather
 * than in two places that could disagree.
 */
export type TileGroup = "products" | "support" | "opportunities";
/** "none": the data was checked and nothing qualified — muted, no number, no "No data" tag. */
export type TileState = "risk" | "warning" | "positive" | "neutral" | "empty" | "none";

/** Icon names, matched against @carbon/icons-react on the client. */
export type TileIcon =
  | "Api"
  | "Application"
  | "Upgrade"
  | "WarningFilled"
  | "WarningAlt"
  | "CheckmarkFilled"
  | "Renew"
  | "CalendarHeatMap"
  | "WarningAltFilled"
  | "ServiceDesk"
  | "Collaborate";

export interface TileSpec {
  key: string;
  group: TileGroup;
  label: string;
  icon: TileIcon;
  /** The headline. Null means empty — render the caption in its place. */
  value: string | null;
  /** Small line under the value, e.g. a product name or a work order id. */
  secondary: string | null;
  /** Names listed under the value — the client shows up to three, then "+N more". */
  items?: string[];
  /** Deterministic — never set by Bob, so color coding cannot vary by run. */
  state: TileState;
  /** Bob-authored short line. Never contains a digit — see the AI module. */
  caption: string;
}

export const GROUP_LABELS: Record<TileGroup, string> = {
  products: "Products",
  support: "Support Activity",
  opportunities: "Opportunities",
};

/** Default captions used before a customer's first AI run, or if Bob fails. */
const DEFAULT_CAPTIONS: Record<string, string> = {
  ecProducts: "Supported footprint",
  nonEcProducts: "Supported footprint",
  ecUpgrades: "Review recommended",
  ecUpgradesNone: "All current",
  nonEcUpgrades: "Non-EC products past or nearing end of support",
  nonEcUpgradesNone: "All up to date",
  sev1: "Needs attention",
  sev1None: "No escalations",
  maxSev2: "Highest case volume",
  maxSev2None: "No Sev2 activity",
  noCaseData: "No cases raised for this customer",
};

/**
 * One sales-opportunity tile. Reads the rule result saved by the batch run —
 * nothing is calculated here.
 */
function opportunityTile(
  facts: SummaryFacts,
  bobCaptions: Record<string, string> | null,
  spec: { key: string; label: string; icon: TileIcon; rule: string },
  pick: (r: NonNullable<SummaryFacts["opportunityRules"]>) => OpportunityProduct[],
): TileSpec {
  const base = { key: spec.key, group: "opportunities" as const, label: spec.label, icon: spec.icon };
  if (!facts.hasCaseData) {
    return {
      ...base, value: null, secondary: null, state: "empty",
      caption: caption(bobCaptions, "noCaseData"),
    };
  }
  const rules = facts.opportunityRules;
  if (!rules) {
    // Report saved before the rules existed — say so rather than imply "none".
    return {
      ...base, value: null, secondary: null, state: "empty",
      caption: "Not calculated yet — re-run reports to show this",
    };
  }
  const products = pick(rules);
  if (products.length === 0) {
    return { ...base, value: null, secondary: null, state: "none", caption: "No opportunity identified" };
  }
  const { fullWindow, monthsAvailable, lookbackMonths } = rules.window;
  return {
    ...base,
    value: String(products.length),
    secondary: spec.rule,
    items: products.map((p) => p.productName),
    state: "warning",
    caption: fullWindow
      ? `Last ${lookbackMonths} months of CSP data`
      : `Only ${monthsAvailable} months of CSP data available`,
  };
}

function caption(bob: Record<string, string> | null, key: string): string {
  return bob?.[key]?.trim() || DEFAULT_CAPTIONS[key] || "";
}

/**
 * Build all nine tiles.
 *
 * `bobCaptions` is null for the fully deterministic fallback (before the first
 * AI run, or when Bob's output failed validation) — DEFAULT_CAPTIONS stands in,
 * so a tile is never blank while still never showing a fabricated number.
 */
export function buildTiles(facts: SummaryFacts, bobCaptions: Record<string, string> | null): TileSpec[] {
  const tiles: TileSpec[] = [];

  // ── Products ────────────────────────────────────────────────────────────
  if (facts.hasCaseData) {
    tiles.push({
      key: "ecProducts", group: "products", label: "EC Products", icon: "Api",
      value: String(facts.ecProductCount), secondary: null, state: "neutral",
      caption: caption(bobCaptions, "ecProducts"),
    });
    tiles.push({
      key: "nonEcProducts", group: "products", label: "Non-EC Products", icon: "Application",
      value: String(facts.nonEcProductCount), secondary: null, state: "neutral",
      caption: caption(bobCaptions, "nonEcProducts"),
    });
    tiles.push({
      key: "ecUpgrades", group: "products", label: "EC Upgrade Opportunities", icon: "Upgrade",
      value: String(facts.ecUpgradeCount), secondary: null,
      state: (facts.ecUpgradeCount ?? 0) > 0 ? "warning" : "positive",
      caption: caption(bobCaptions, (facts.ecUpgradeCount ?? 0) > 0 ? "ecUpgrades" : "ecUpgradesNone"),
    });
  } else {
    for (const [key, label, icon] of [
      ["ecProducts", "EC Products", "Api"],
      ["nonEcProducts", "Non-EC Products", "Application"],
      ["ecUpgrades", "EC Upgrade Opportunities", "Upgrade"],
    ] as const) {
      tiles.push({
        key, group: "products", label, icon, value: null, secondary: null, state: "empty",
        caption: caption(bobCaptions, `${key}Empty`) || caption(bobCaptions, "noCaseData"),
      });
    }
  }

  // ── Support Activity ────────────────────────────────────────────────────
  if (facts.hasCaseData) {
    tiles.push({
      key: "sev1", group: "support", label: "Sev1 Cases Raised", icon: "WarningFilled",
      value: String(facts.sev1Cases), secondary: null,
      state: (facts.sev1Cases ?? 0) > 0 ? "risk" : "positive",
      caption: caption(bobCaptions, (facts.sev1Cases ?? 0) > 0 ? "sev1" : "sev1None"),
    });
    tiles.push({
      key: "maxSev2", group: "support", label: "Highest Sev2 Volume", icon: "WarningAlt",
      value: facts.maxSev2 ? String(facts.maxSev2.count) : null,
      secondary: facts.maxSev2?.productName ?? null,
      state: facts.maxSev2 ? "warning" : "positive",
      caption: caption(bobCaptions, facts.maxSev2 ? "maxSev2" : "maxSev2None"),
    });
  } else {
    tiles.push({
      key: "sev1", group: "support", label: "Sev1 Cases Raised", icon: "WarningFilled",
      value: null, secondary: null, state: "empty",
      caption: caption(bobCaptions, "sev1Empty") || caption(bobCaptions, "noCaseData"),
    });
    tiles.push({
      key: "maxSev2", group: "support", label: "Highest Sev2 Volume", icon: "WarningAlt",
      value: null, secondary: null, state: "empty",
      caption: caption(bobCaptions, "maxSev2Empty") || caption(bobCaptions, "noCaseData"),
    });
  }

  // ── Opportunities ───────────────────────────────────────────────────────
  // Sales rules, Non-EC products only (constants/opportunityRules.ts).
  tiles.push(
    opportunityTile(
      facts, bobCaptions,
      {
        key: "oppEssentialManagement", label: "Essential Management Opportunity", icon: "ServiceDesk",
        rule: `Non-EC products with more than ${OPPORTUNITY_RULES.essentialManagementSev1Above} Sev1 cases`,
      },
      (r) => r.essentialManagement,
    ),
    opportunityTile(
      facts, bobCaptions,
      {
        key: "oppExpertiseConnect", label: "Expertise Connect Opportunity", icon: "Collaborate",
        rule: `Non-EC products with more than ${OPPORTUNITY_RULES.expertiseConnectCasesAbove} cases`,
      },
      (r) => r.expertiseConnect,
    ),
  );
  // Out of support (or soon) — the Expertise Connect & Expert Labs Migration
  // opportunity. Same upgrade data as before; distinct Non-EC products.
  tiles.push(
    facts.hasCaseData
      ? {
          key: "nonEcUpgrades", group: "opportunities", label: "EC & Migration Opportunity", icon: "Upgrade",
          value: String(facts.nonEcUpgradeCount), secondary: null,
          state: (facts.nonEcUpgradeCount ?? 0) > 0 ? "warning" : "positive",
          caption: caption(bobCaptions, (facts.nonEcUpgradeCount ?? 0) > 0 ? "nonEcUpgrades" : "nonEcUpgradesNone"),
        }
      : {
          key: "nonEcUpgrades", group: "opportunities", label: "EC & Migration Opportunity", icon: "Upgrade",
          value: null, secondary: null, state: "empty",
          caption: caption(bobCaptions, "nonEcUpgradesEmpty") || caption(bobCaptions, "noCaseData"),
        },
  );

  return tiles;
}

/** Every caption key buildTiles can ask for — the contract for the Bob prompt. */
export const CAPTION_KEYS = [
  "ecProducts", "nonEcProducts",
  "ecUpgrades", "ecUpgradesNone", "nonEcUpgrades", "nonEcUpgradesNone",
  "sev1", "sev1None", "maxSev2", "maxSev2None",
  "noCaseData",
] as const;
