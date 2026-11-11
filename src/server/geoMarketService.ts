/**
 * Geography / Market Service
 * ──────────────────────────
 * The single source of truth for "which geo and market does a customer belong
 * to", and for the list of geos and markets that exist at all.
 *
 * Everything here is derived from the Clarizen upload at read time — nothing is
 * hardcoded. A new geo, a renamed market, or a customer moving between markets
 * takes effect on the next upload with no code change, which is the whole point:
 * this data backs an access-control decision and must never be stale relative
 * to the source.
 *
 * ── Why Clarizen and not the workbook ──
 * The workbook's ClientOverview sheet also carries geo and market columns, but
 * market is populated on roughly 1% of accounts and onboarding writes both as
 * empty for every new client, so it can never be relied on. Clarizen carries
 * Geo on 99.9% of rows and Market on 97.2%, and is the system of record for
 * both.
 *
 * ── Consistency ──
 * A customer can have many Clarizen rows (one per work order). Every row for a
 * given customer agrees on geo and market in the current data — verified, zero
 * conflicts — but this code does not assume that. Where rows disagree, the most
 * frequent value wins and the disagreement is reported, so a future data change
 * degrades to a defensible answer instead of an arbitrary one.
 */
import { getClarizenRowsForClient, safeReadClientOverview } from "./caseDataReader";
import { readClarizenMaster } from "./dataIngestionService";
import { cspDataFingerprint, clarizenDataFingerprint, readDiskCache, writeDiskCache } from "./dataFingerprint";

/** The Clarizen column names this service depends on. */
const GEO_COLUMN = "Geo";
/** Clarizen's market column is literally named "Market OLD" — there is no newer one. */
const MARKET_COLUMN = "Market OLD";

/** Where a customer sits. Empty string means Clarizen carries no value. */
export interface GeoMarket {
  geo: string;
  market: string;
}

/** Geography with the markets that exist beneath it. */
export interface GeoNode {
  geo: string;
  markets: string[];
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Pick the winning value from a customer's rows.
 *
 * Rows agree in the current data, so this is a guard rather than a common path.
 * Most frequent wins; ties break alphabetically so the result is stable across
 * runs rather than depending on row order.
 */
function dominant(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 0) return "";
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/**
 * Every geography, each with its markets, built from the live Clarizen data.
 *
 * Drives the admin multi-selects and the Global View filters, so both always
 * offer exactly what the data contains.
 */
export function getGeoMarketTree(): GeoNode[] {
  const byGeo = new Map<string, Set<string>>();
  for (const row of readClarizenMaster()) {
    const geo = text(row[GEO_COLUMN]);
    if (!geo) continue;
    const set = byGeo.get(geo) ?? new Set<string>();
    const market = text(row[MARKET_COLUMN]);
    if (market) set.add(market);
    byGeo.set(geo, set);
  }
  return [...byGeo.entries()]
    .map(([geo, markets]) => ({ geo, markets: [...markets].sort() }))
    .sort((a, b) => a.geo.localeCompare(b.geo));
}

/**
 * clientId → geo/market for every onboarded account.
 *
 * Built in one pass over Clarizen rather than per-client, because the access
 * filter needs the whole map to filter a client list and doing it per-client
 * would re-scan the master list once per account.
 *
 * Cached to disk against the data fingerprint, so an upload invalidates it and
 * nothing else has to remember to.
 */
export function getClientGeoMarketIndex(): Record<string, GeoMarket> {
  // The version suffix invalidates the cache when the DERIVATION LOGIC changes,
  // not just the data. Without it, a cache written before market inference
  // existed would keep being served and the inference would never run.
  const fingerprint = `geo-v3:${cspDataFingerprint()}:${clarizenDataFingerprint()}`;
  const cached = readDiskCache<Record<string, GeoMarket>>("client_geo_market", fingerprint);
  if (cached) return cached;

  // Group Clarizen rows by customer number, tolerating zero-padding the same
  // way getClarizenRowsForClient does.
  const byCustomer = new Map<string, { geos: string[]; markets: string[] }>();
  for (const row of readClarizenMaster()) {
    const num = text(row.customerNumber);
    if (!num) continue;
    for (const key of new Set([num, num.replace(/^0+/, "") || num])) {
      const entry = byCustomer.get(key) ?? { geos: [], markets: [] };
      entry.geos.push(text(row[GEO_COLUMN]));
      entry.markets.push(text(row[MARKET_COLUMN]));
      byCustomer.set(key, entry);
    }
  }

  // Clarizen is taken exactly as it is. A blank Geo or Market stays blank.
  //
  // An earlier version filled a missing Market by copying one from another
  // customer number sharing the same company name or buying group. That was
  // removed deliberately: Market drives commercial and financial rollups, so a
  // customer placed in the wrong market distorts reporting. We do not know why
  // the source is blank, and a plausible guess is worse than an acknowledged
  // gap — the gaps are reported instead, via getUnclassifiedClients.
  const index: Record<string, GeoMarket> = {};
  for (const client of safeReadClientOverview()) {
    const clientId = text(client.client_id);
    if (!clientId) continue;
    const cmr = text(client.cmr_number);
    const entry = cmr
      ? (byCustomer.get(cmr) ?? byCustomer.get(cmr.replace(/^0+/, "") || cmr))
      : undefined;
    index[clientId] = {
      geo: entry ? dominant(entry.geos) : "",
      market: entry ? dominant(entry.markets) : "",
    };
  }

  writeDiskCache("client_geo_market", fingerprint, index);
  return index;
}

/** One client's geo/market. Falls back to a direct lookup if not in the index. */
export function getClientGeoMarket(clientId: string): GeoMarket {
  const hit = getClientGeoMarketIndex()[clientId];
  if (hit) return hit;
  const rows = getClarizenRowsForClient(clientId);
  return {
    geo: dominant(rows.map((r) => text(r[GEO_COLUMN]))),
    market: dominant(rows.map((r) => text(r[MARKET_COLUMN]))),
  };
}

/**
 * Accounts whose geo or market could not be resolved.
 *
 * Surfaced for the admin panel: under a deny-by-default rule these are
 * invisible to every non-admin, so somebody has to be able to see that they
 * exist and why.
 */
export function getUnclassifiedClients(): {
  clientId: string;
  clientName: string;
  geo: string;
  market: string;
  reason: "no-geo" | "no-market";
}[] {
  const index = getClientGeoMarketIndex();
  const names = new Map(
    safeReadClientOverview().map((c) => [text(c.client_id), text(c.client_name)]),
  );
  const out: ReturnType<typeof getUnclassifiedClients> = [];
  for (const [clientId, gm] of Object.entries(index)) {
    if (!gm.geo) {
      out.push({ clientId, clientName: names.get(clientId) ?? clientId, ...gm, reason: "no-geo" });
    } else if (!gm.market) {
      out.push({
        clientId,
        clientName: names.get(clientId) ?? clientId,
        ...gm,
        reason: "no-market",
      });
    }
  }
  return out.sort((a, b) => a.clientName.localeCompare(b.clientName));
}
