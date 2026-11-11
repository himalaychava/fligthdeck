/**
 * Executive Account Summary — AI captions.
 *
 * Bob's entire job is to write a short caption for each tile — 2 to 6 words of
 * context under a number, or the full "no data" message when a tile is empty.
 * It never writes a number, a bullet list, or a paragraph.
 *
 * ── Why numbers never come from Bob ──
 * The summary is the first thing a seller reads before a customer call, and
 * every figure on it is a count. A language model asked to report a count can
 * be wrong, and a wrong number reaching a seller has nothing in between to
 * catch it. So the numbers are computed in executiveSummaryFacts.ts and never
 * touched again — Bob is handed the same facts only to describe them, and the
 * validator below rejects any caption that contains a digit at all, which is
 * a much simpler guarantee than checking whether a number is the right one.
 *
 * ── Why JSON, not prose ──
 * The frontend renders a Carbon tile grid, not a text block, so the output has
 * to be one short string per tile — a caption dictionary keyed by CAPTION_KEYS,
 * not a paragraph to parse.
 */
import { runBobCLI } from "./aiInsightsService";
import type { SummaryFacts } from "./executiveSummaryFacts";
import { CAPTION_KEYS } from "./executiveSummaryTiles";

export interface GeneratedCaptions {
  captions: Record<string, string>;
  aiGenerated: boolean;
  generatedAt: string;
}

function buildPrompt(facts: SummaryFacts): string {
  return `You are writing very short status captions for a tile dashboard in an IBM Expert Labs account tool.
A seller glances at this for two seconds before a customer call. Each caption sits under a number that is ALREADY SHOWN on the tile — you are adding one line of context, not reporting the number again.

TERMINOLOGY — use exactly, never expand:
- "EC" means Expertise Connect. Never write "Extended Care" or anything else.
- "Non-EC" stays "Non-EC".
- Severities are "Sev1", "Sev2".

CUSTOMER: ${facts.clientName}

FACTS (already calculated — for context only, do not restate the numbers):
${JSON.stringify(
  {
    hasCaseData: facts.hasCaseData,
    ecProducts: facts.ecProductCount,
    nonEcProducts: facts.nonEcProductCount,
    ecUpgradeOpportunities: facts.ecUpgradeCount,
    nonEcProductsPastOrNearingEndOfSupport: facts.nonEcUpgradeCount,
    sev1Cases: facts.sev1Cases,
    productWithMostSev2: facts.maxSev2,
    activeContracts: facts.activeContractCount,
    earliestExpiry: facts.nextExpiry,
    expiredContracts: facts.expired.length,
  },
  null,
  2,
)}

Return a single JSON object, nothing else — no markdown fence, no commentary. Every key below must be present as a string:

${JSON.stringify(Object.fromEntries(CAPTION_KEYS.map((k) => [k, ""])), null, 2)}

RULES:
1. Every value is a caption of 2 to 6 words. NEVER include a digit, a date, or a work order number — the tile already shows those. A caption with a number in it will be discarded.
2. "...None" keys (ecUpgradesNone, sev1None, etc.) are used when that metric is zero or healthy — write something positive and brief, e.g. "All current", "No escalations".
3. Non-"None" keys are used when the metric is non-zero — write something that signals attention without alarm, e.g. "Review recommended", "Needs attention".
4. "noCaseData" is shown on every Products/Support tile when the customer has no case data at all. Write ONE short sentence, e.g. "No cases raised for this customer". Reused across several tiles — that is expected.
4a. "noContractData" is shown on every Contracts tile when the customer has zero contracts on record — a different fact from "contracts exist but none are expired". Write ONE short sentence, e.g. "No contract data available for this customer".
5. Keep tone professional and neutral. No exclamation marks, no emoji.
6. Output ONLY the JSON object.`;
}

/** Strip a Bob response down to just the JSON object, tolerating a code fence. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
  return JSON.parse(candidate.slice(start, end + 1));
}

/** A caption is rejected outright if it contains a digit — see the module doc. */
function isCleanCaption(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= 80 && !/\d/.test(v);
}

export async function generateExecutiveSummaryCaptions(
  facts: SummaryFacts,
): Promise<GeneratedCaptions> {
  const empty: GeneratedCaptions = {
    captions: {},
    aiGenerated: false,
    generatedAt: new Date().toISOString(),
  };

  try {
    const raw = await runBobCLI(buildPrompt(facts));
    const parsed = extractJson(raw);
    if (typeof parsed !== "object" || parsed === null) return empty;

    const clean: Record<string, string> = {};
    let usable = 0;
    for (const key of CAPTION_KEYS) {
      const v = (parsed as Record<string, unknown>)[key];
      if (isCleanCaption(v)) {
        clean[key] = v.trim();
        usable++;
      }
    }

    // Require most keys to be usable, not all — one bad caption falls back to
    // the deterministic default for that tile alone (see buildTiles), rather
    // than discarding an otherwise-good set over a single rejected string.
    if (usable < CAPTION_KEYS.length * 0.6) return empty;

    return { captions: clean, aiGenerated: true, generatedAt: new Date().toISOString() };
  } catch (e) {
    console.warn(`[exec-summary] ${facts.clientId}: Bob failed — ${e instanceof Error ? e.message : e}`);
    return empty;
  }
}
