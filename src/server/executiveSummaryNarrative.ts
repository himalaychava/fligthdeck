/**
 * Executive Account Summary — the descriptive bullets above the tiles.
 *
 * Four distinct points, each a single self-contained fact a seller can read at
 * a glance:
 *
 *   1. who the customer is and where
 *   2. their Expertise Connect footprint (with the product names listed beneath)
 *   3. their contract position
 *   4. their total product estate
 *
 * Contracts appear ONLY here — the contracts tile group was removed, so this
 * bullet is the single place contract facts are stated, including anything
 * already expired.
 *
 * ── Same rule as everywhere else here ──
 * Bob phrases; it does not count. Every figure comes from SummaryFacts, and the
 * validator rejects any bullet containing a number that is not one of those
 * figures. A rejection falls back to a deterministic template, which is plainer
 * but always correct. The EC product names are never written by Bob — the
 * frontend lists them straight from the facts, so they cannot drift from the
 * tiles beneath.
 *
 * ── Empty data ──
 * Absent geo, zero contracts and zero products each get their own sentence
 * rather than a blank or half-filled template, in both the AI and fallback
 * paths.
 */
import { runBobCLI } from "./aiInsightsService";
import type { SummaryFacts } from "./executiveSummaryFacts";

export interface NarrativeSummary {
  /** "<Client> is an active subscription customer in <Geo> region with Expertise Connect service for <X> products." */
  intro: string;
  /** "There are <X> active contracts, with earliest expiry for <code> on <date>." */
  contracts: string;
  /** "Overall the customer has <X+Y> IBM products, of which <Y> are Non-EC products." */
  totals: string;
  /** End-of-support position, e.g. "11 products past end of support, 14 nearing end of support." */
  endOfSupport: string;
  aiGenerated: boolean;
}

/** The three bullet keys, in render order. */
export const NARRATIVE_KEYS = ["intro", "contracts", "totals", "endOfSupport"] as const;

function totalProducts(f: SummaryFacts): number | null {
  if (!f.hasCaseData) return null;
  return (f.ecProductCount ?? 0) + (f.nonEcProductCount ?? 0);
}

/**
 * The deterministic version.
 *
 * Doubles as the fallback and as the worked example handed to Bob, so the two
 * can never describe the same customer differently.
 */
/** "1 product" vs "3 products" — and the matching verb where one is needed. */
function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return n === 1 ? singular : pluralForm;
}

export function buildNarrativeTemplate(f: SummaryFacts): Omit<NarrativeSummary, "aiGenerated"> {
  // Exact fixed wording, as specified — only the values are substituted, and
  // singular/plural (and "is"/"are") are corrected for count-of-one, but the
  // sentence pattern itself never changes between customers or runs.
  const ecCount = f.ecProductCount ?? 0;
  const intro = !f.hasCaseData
    ? `${f.clientName} is an active subscription customer${f.geo ? ` in ${f.geo} region` : ""}. No Expertise Connect product data is available for this customer.`
    : ecCount === 0
      ? `${f.clientName} is an active subscription customer${f.geo ? ` in ${f.geo} region` : ""} with no products currently under Expertise Connect service.`
      : `${f.clientName} is an active subscription customer${f.geo ? ` in ${f.geo} region` : ""} with Expertise Connect service for ${ecCount} ${plural(ecCount, "product")}.`;

  const activeVerb = f.activeContractCount === 1 ? "is" : "are";
  const activeNoun = plural(f.activeContractCount, "active contract");
  const contracts =
    f.contractCount === 0
      ? "There are no active contracts for this customer currently."
      : f.nextExpiry
        ? `There ${activeVerb} ${f.activeContractCount} ${activeNoun}, with earliest expiry for ${f.nextExpiry.workOrderNumber} on ${f.nextExpiry.endDate}.`
        : `There ${activeVerb} ${f.activeContractCount} ${activeNoun}, with no expiry dates recorded.`;

  const total = totalProducts(f);
  const nonEc = f.nonEcProductCount ?? 0;
  const totals =
    total === null
      ? "The total product estate cannot be determined without case data."
      : total === 0
        ? "No IBM products are currently recorded against this customer."
        : `Overall the customer has ${total} IBM ${plural(total, "product")}, of which ${nonEc} ${plural(nonEc, "is", "are")} Non-EC ${plural(nonEc, "product")}.`;

  // End of support — distinct products, not the product-version rows the
  // Insights upgrades table lists, so a product on three unsupported versions
  // counts once here.
  const expired = f.eosExpiredProducts.length;
  const nearing = f.eosExpiringSoonProducts.length;
  const endOfSupport = !f.hasCaseData
    ? "No product lifecycle data is available for this customer."
    : expired === 0 && nearing === 0
      ? "All products are within their supported lifecycle, with no end-of-support exposure."
      : expired > 0 && nearing > 0
        ? `${expired} ${plural(expired, "product")} past end of support and ${nearing} nearing end of support.`
        : expired > 0
          ? `${expired} ${plural(expired, "product")} past end of support, none nearing.`
          : `${nearing} ${plural(nearing, "product")} nearing end of support, none past it yet.`;

  return { intro, contracts, totals, endOfSupport };
}

function buildPrompt(f: SummaryFacts): string {
  const template = buildNarrativeTemplate(f);
  return `You are writing four short bullet points summarising an IBM Expert Labs customer, shown above a tile dashboard.
A seller scans these in a few seconds before a customer call.

TERMINOLOGY — use exactly, never expand:
- "EC" means Expertise Connect. Never write "Extended Care".
- "Non-EC" stays "Non-EC".

FACTS (authoritative — already calculated, never recalculate or invent):
${JSON.stringify(
  {
    clientName: f.clientName,
    geo: f.geo || null,
    hasCaseData: f.hasCaseData,
    ecProducts: f.ecProductCount,
    nonEcProducts: f.nonEcProductCount,
    totalProducts: totalProducts(f),
    activeContracts: f.activeContractCount,
    totalContracts: f.contractCount,
    expiredContracts: f.expired.length,
    earliestExpiry: f.nextExpiry,
  },
  null,
  2,
)}

A correct, plainly-worded version is:
${JSON.stringify(template, null, 2)}

Return a single JSON object, nothing else — no markdown fence, no commentary:
{ "intro": "", "contracts": "", "totals": "", "endOfSupport": "" }

RULES:
1. Each value is ONE bullet point — a short phrase, not a full paragraph. Aim for under 90 characters.
2. Each bullet must say something DIFFERENT. Never repeat a fact that appears in another bullet.
3. Do NOT start a bullet with "The customer" or repeat the company name in more than the first bullet.
4. Use ONLY the numbers in FACTS. Never calculate a new one. A bullet containing an unknown number is discarded.
5. Where a value is null or zero, write a natural short phrase saying so — never "undefined", never a blank, never a half-finished clause.
6. Do NOT list the EC product names — they are rendered separately as a sub-list.
7. No trailing full stops. No marketing tone. Factual and clipped, like a briefing note.
8. Output ONLY the JSON object.`;
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Every number Bob may state. */
function allowedNumbers(f: SummaryFacts): Set<string> {
  const nums = [
    f.ecProductCount,
    f.nonEcProductCount,
    totalProducts(f),
    f.activeContractCount,
    f.contractCount,
    f.expired.length,
  ].filter((n): n is number => typeof n === "number");
  return new Set(nums.map(String));
}

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december";

/** Digits belonging to a date rather than a claim — see the tiles module for why. */
function stripDateLike(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}/g, " ")
    .replace(new RegExp(`(${MONTHS})\\s+\\d{1,2}(st|nd|rd|th)?,?\\s*\\d{0,4}`, "gi"), " ")
    .replace(new RegExp(`\\d{1,2}(st|nd|rd|th)?\\s+(${MONTHS})\\s*\\d{0,4}`, "gi"), " ")
    .replace(new RegExp(`(${MONTHS})\\s+\\d{4}`, "gi"), " ")
    .replace(/\bQ[1-4]\b/gi, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ");
}

function citesOnlyKnownNumbers(lines: string[], f: SummaryFacts): boolean {
  const allowed = allowedNumbers(f);
  const literals = [f.nextExpiry?.workOrderNumber, f.clientName, f.geo]
    .filter((v): v is string => !!v && /\d/.test(v));

  for (const line of lines) {
    let stripped = line;
    for (const lit of literals) stripped = stripped.split(lit).join(" ");
    stripped = stripDateLike(stripped);
    for (const n of stripped.match(/\d+/g) ?? []) {
      if (!allowed.has(n)) return false;
    }
  }
  return true;
}

/**
 * Bob-authored phrasing is switched off — every customer gets the exact fixed
 * wording from buildNarrativeTemplate(), unchanged, so the same facts always
 * produce the same sentence with no variation between customers or runs.
 *
 * The Bob call, prompt and validator below this function are left in place
 * rather than deleted, so AI phrasing can be switched back on later by
 * restoring the call — see buildPrompt / citesOnlyKnownNumbers / extractJson.
 */
export async function generateNarrative(f: SummaryFacts): Promise<NarrativeSummary> {
  return { ...buildNarrativeTemplate(f), aiGenerated: false };
}

/**
 * The AI path, currently unused by generateNarrative() above. Restore by
 * replacing that function's body with this one's try/catch.
 */
async function generateNarrativeViaBob(f: SummaryFacts): Promise<NarrativeSummary> {
  const fallback: NarrativeSummary = { ...buildNarrativeTemplate(f), aiGenerated: false };

  try {
    const parsed = extractJson(await runBobCLI(buildPrompt(f)));
    if (typeof parsed !== "object" || parsed === null) return fallback;

    const o = parsed as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const key of NARRATIVE_KEYS) {
      const v = o[key];
      if (typeof v !== "string" || !v.trim()) return fallback;
      out[key] = v.trim();
    }

    if (!citesOnlyKnownNumbers(Object.values(out), f)) {
      console.warn(`[exec-narrative] ${f.clientId}: unknown figure in narrative — using template`);
      return fallback;
    }

    return {
      intro: out.intro,
      contracts: out.contracts,
      totals: out.totals,
      endOfSupport: out.endOfSupport,
      aiGenerated: true,
    };
  } catch (e) {
    console.warn(`[exec-narrative] ${f.clientId}: Bob failed — ${e instanceof Error ? e.message : e}`);
    return fallback;
  }
}
void generateNarrativeViaBob; // kept for future use — see doc comment above
