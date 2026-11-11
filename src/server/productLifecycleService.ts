/**
 * Product Lifecycle Service
 * ─────────────────────────
 * Resolves a customer's CSP product (name + version) against the IBM Product
 * Lifecycle Catalog to derive an End-of-Support status.
 *
 * There is no shared product code between CSP and the catalog — CSP's UTL30
 * codes and the catalog's PID are unrelated identifiers — so resolution is
 * name-based, via a hybrid of automatic matching and admin-configured mappings:
 *
 *   Layer 1 — exact name match (lowercased)
 *   Layer 2 — substring: the CSP name appears inside a catalog name
 *   Layer 3 — shortest-name heuristic when Layer 2 is ambiguous, preferring
 *             "IBM <product>" and "<product> Standard Edition" forms
 *   Manual  — admin mappings for anything the three layers can't resolve
 *
 * Manual mappings are read from disk on each resolution pass, so a mapping
 * saved in the admin panel takes effect on the next insights generation with
 * no restart, redeploy or data re-upload.
 *
 * There is deliberately no confidence score and no hardcoded alias table:
 * anything the three layers cannot resolve is reported as unresolved and
 * surfaces in the admin Pending Products list for a deliberate mapping.
 */
import {
  readLifecycleData,
  readLifecycleMappings,
  type LifecycleProduct,
} from "./dataIngestionService";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Status of a product whose name AND version both resolved. */
export type LifecycleStatus = "Expired" | "Expiring Soon" | "Supported";

/**
 * Outcome of resolving one CSP (product, version) pair.
 *
 *  - "resolved"          both name and version matched; status/date are known.
 *  - "unmapped-name"     no catalog product could be resolved for this name.
 *  - "unmapped-version"  the product resolved but the catalog carries no row
 *                        for this version, so no date can be asserted.
 *
 * The two unmapped kinds are reported separately because only the first can be
 * fixed by an admin mapping — a version gap is missing catalog coverage.
 */
export type LifecycleResolution =
  | {
      kind: "resolved";
      status: LifecycleStatus;
      /** ISO date, or "" when the catalog announces no end of support. */
      endOfSupport: string;
      extendedEndOfSupport: string;
      lifecyclePolicy: string;
      matchedProductName: string;
      matchedVersion: string;
    }
  | { kind: "unmapped-name" }
  | {
      kind: "unmapped-version";
      matchedProductName: string;
      /**
       * A different catalog entry that DOES carry this version, when one exists.
       * The automatic layers commit to one entry per product name, so a version
       * gap often means "the entry we picked lacks it" rather than "the catalog
       * lacks it" — an admin mapping to this entry would resolve the row.
       * null when no entry anywhere covers the version.
       */
      alternativeProductName: string | null;
    };

/** Expiring Soon window — a year of runway, so upgrades can be planned ahead. */
const EXPIRING_SOON_MONTHS = 12;

/**
 * Layer 3 refuses to guess past this many candidates when none of them takes a
 * structurally preferred form. "zSecure" matches 27 unrelated components and
 * "WebSphere" 441; picking one and presenting its date as fact would be worse
 * than routing the product to the admin Pending list for a deliberate mapping.
 */
const MAX_AMBIGUOUS_CANDIDATES = 5;

/**
 * Preferred catalog name forms, most preferred first. The catalog frequently
 * carries no bare product entry ("AIX") but does carry its edition variants
 * ("AIX Standard Edition"), so these are structural matches rather than
 * coincidental substrings.
 */
const EDITION_SUFFIXES = [
  "standard edition",
  "server",
  "enterprise edition",
  "advanced edition",
  "express edition",
];

// ─── Catalog index ────────────────────────────────────────────────────────────

interface CatalogIndex {
  /** Lowercased catalog product name → all its rows. */
  byName: Map<string, LifecycleProduct[]>;
  /** [lowercasedName, rows] pairs for substring scanning. */
  entries: [string, LifecycleProduct[]][];
}

let cachedIndex: CatalogIndex | null = null;
let cachedFor = -1;

function getCatalogIndex(): CatalogIndex {
  const rows = readLifecycleData();
  if (cachedIndex && cachedFor === rows.length) return cachedIndex;

  const byName = new Map<string, LifecycleProduct[]>();
  for (const row of rows) {
    const key = String(row.productName ?? "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    const bucket = byName.get(key);
    if (bucket) bucket.push(row);
    else byName.set(key, [row]);
  }
  cachedIndex = { byName, entries: [...byName.entries()] };
  cachedFor = rows.length;
  return cachedIndex;
}

/** Drops the memoised index — call after replacing the catalog on disk. */
export function invalidateLifecycleCache(): void {
  cachedIndex = null;
  cachedFor = -1;
}

/** True when a lifecycle catalog has been uploaded. */
export function isLifecycleCatalogLoaded(): boolean {
  return getCatalogIndex().entries.length > 0;
}

// ─── Name resolution: 3 automatic layers, then manual mappings ───────────────

interface NameResolution {
  rows: LifecycleProduct[];
  catalogName: string;
}

/**
 * Run one CSP product name through the three automatic layers.
 * Returns null when none of them resolves it.
 */
function resolveNameAutomatic(cspName: string, index: CatalogIndex): NameResolution | null {
  const needle = cspName.trim().toLowerCase();
  if (!needle) return null;

  // Layer 1 — exact
  const exact = index.byName.get(needle);
  if (exact) return { rows: exact, catalogName: exact[0].productName };

  // Layer 2 — substring: the CSP name appears inside a catalog name.
  const candidates: [string, LifecycleProduct[]][] = [];
  for (const entry of index.entries) {
    if (entry[0].includes(needle)) candidates.push(entry);
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { rows: candidates[0][1], catalogName: candidates[0][1][0].productName };
  }

  // Layer 3 — shortest-name heuristic over an ambiguous Layer 2 result.
  // Structurally preferred forms win outright, however many candidates there
  // are: "IBM <product>" first, then "<product> <edition>".
  const ibmForm = candidates.find((c) => c[0] === `ibm ${needle}`);
  if (ibmForm) return { rows: ibmForm[1], catalogName: ibmForm[1][0].productName };

  const editionForms: [number, [string, LifecycleProduct[]]][] = [];
  for (const entry of candidates) {
    for (let i = 0; i < EDITION_SUFFIXES.length; i++) {
      const suffix = EDITION_SUFFIXES[i];
      if (entry[0] === `${needle} ${suffix}` || entry[0] === `ibm ${needle} ${suffix}`) {
        editionForms.push([i, entry]);
        break;
      }
    }
  }
  if (editionForms.length > 0) {
    editionForms.sort((a, b) => a[0] - b[0] || a[1][0].length - b[1][0].length);
    const best = editionForms[0][1];
    return { rows: best[1], catalogName: best[1][0].productName };
  }

  // No preferred form. Fall back to shortest name only while the result is
  // narrow enough to be meaningful; past that it is a guess, so report
  // unresolved and let an admin map it deliberately.
  if (candidates.length > MAX_AMBIGUOUS_CANDIDATES) return null;
  candidates.sort((a, b) => a[0].length - b[0].length);
  return { rows: candidates[0][1], catalogName: candidates[0][1][0].productName };
}

/**
 * Look the CSP name up in the admin-configured mappings, then resolve the
 * mapped catalog name against the index. Read fresh each pass so a mapping
 * saved in the admin panel is live immediately.
 */
function resolveNameManual(cspName: string, index: CatalogIndex): NameResolution | null {
  const needle = cspName.trim().toLowerCase();
  if (!needle) return null;

  const mapping = readLifecycleMappings().find(
    (m) => m.cspProductName.trim().toLowerCase() === needle,
  );
  if (!mapping) return null;

  const target = mapping.catalogProductName.trim().toLowerCase();
  const hit = index.byName.get(target) ?? index.byName.get(`ibm ${target}`);
  if (!hit) return null; // mapping points at a catalog name that no longer exists
  return { rows: hit, catalogName: hit[0].productName };
}

/**
 * Full name resolution used by both the insights path and the admin Pending
 * scanner: three automatic layers, then manual mappings.
 */
export function resolveProductName(cspName: string): { catalogName: string } | null {
  const index = getCatalogIndex();
  if (index.entries.length === 0) return null;
  const hit = resolveNameAutomatic(cspName, index) ?? resolveNameManual(cspName, index);
  return hit ? { catalogName: hit.catalogName } : null;
}

// ─── Version resolution ───────────────────────────────────────────────────────

/** Split a version into numeric segments, ignoring non-numeric noise. */
function versionSegments(v: string): number[] {
  return v
    .split(/[.\-_\s]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n));
}

/** Compare two version strings segment-wise. Returns <0, 0, >0. */
function compareVersions(a: string, b: string): number {
  const as = versionSegments(a);
  const bs = versionSegments(b);
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const diff = (as[i] ?? 0) - (bs[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** "9.0.x" / "12.0.X" — matches when every non-wildcard segment agrees. */
function matchesWildcard(cspVersion: string, catalogVersion: string): boolean {
  if (!/[xX*]/.test(catalogVersion)) return false;
  const catParts = catalogVersion.split(".");
  const cspParts = cspVersion.split(".");
  for (let i = 0; i < catParts.length; i++) {
    const cat = catParts[i].trim();
    if (cat === "x" || cat === "X" || cat === "*") continue;
    if ((cspParts[i] ?? "").trim() !== cat) return false;
  }
  return true;
}

/** "7.6.0-7.6.6" — matches when the CSP version falls inside the range. */
function matchesRange(cspVersion: string, catalogVersion: string): boolean {
  const m = catalogVersion.match(/^\s*([\d.]+)\s*[-–]\s*([\d.]+)\s*$/);
  if (!m) return false;
  return compareVersions(cspVersion, m[1]) >= 0 && compareVersions(cspVersion, m[2]) <= 0;
}

/** "7.2" vs "7.2.5" — matches when the first two segments agree. */
function matchesMajorMinor(cspVersion: string, catalogVersion: string): boolean {
  const a = versionSegments(cspVersion);
  const b = versionSegments(catalogVersion);
  if (a.length === 0 || b.length === 0) return false;
  if (a[0] !== b[0]) return false;
  if (a.length === 1 || b.length === 1) return true;
  return a[1] === b[1];
}

/**
 * Find the catalog row whose VRM fits the CSP version: exact, then wildcard,
 * then range, then major.minor. Where several rows qualify within a strategy,
 * the earliest End of Support wins — an ambiguous match should not understate
 * exposure.
 */
/**
 * CSP sometimes prefixes a version with a bare "V" or "v." — "V11.5.9.0" for a
 * release the catalog lists as "11.5.0". Verified against onboarded-client data:
 * of 32 (product, version) pairs whose name resolved but version didn't, 17
 * carried this prefix and matched cleanly the moment it was removed, with zero
 * false positives — stripping it only lets the existing exact/wildcard/range/
 * major-minor strategies see a version they'd already accept unprefixed, it
 * can't manufacture a match those strategies wouldn't otherwise make.
 */
function stripVersionPrefix(v: string): string {
  return v.replace(/^v\.?\s*/i, "");
}

function resolveVersion(cspVersion: string, rows: LifecycleProduct[]): LifecycleProduct | null {
  const needle = stripVersionPrefix(cspVersion.trim()).toLowerCase();
  if (!needle) return null;

  const strategies: ((vrm: string) => boolean)[] = [
    (vrm) => vrm === needle,
    (vrm) => matchesWildcard(needle, vrm),
    (vrm) => matchesRange(needle, vrm),
    (vrm) => matchesMajorMinor(needle, vrm),
  ];

  for (const test of strategies) {
    const hits = rows.filter((r) => {
      const vrm = String(r.vrm ?? "")
        .trim()
        .toLowerCase();
      return vrm !== "" && test(vrm);
    });
    if (hits.length > 0) return pickEarliestEos(hits);
  }
  return null;
}

/** Of several candidate rows, the one expiring soonest (rows with no EOS sort last). */
function pickEarliestEos(rows: LifecycleProduct[]): LifecycleProduct {
  return [...rows].sort((a, b) => {
    const ad = toIsoDate(String(a.endOfSupport ?? ""));
    const bd = toIsoDate(String(b.endOfSupport ?? ""));
    if (!ad && !bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    return ad.localeCompare(bd);
  })[0];
}

// ─── Dates & status ───────────────────────────────────────────────────────────

const MONTH_ABBR: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Normalise a catalog date cell to YYYY-MM-DD, or "" when unparseable.
 * The catalog is exported in several formats depending on source, so this
 * accepts ISO, "Sep 2026", "30 Apr 2027", US slashes and Excel serials.
 */
export function toIsoDate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 1000) {
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
        .toISOString()
        .slice(0, 10);
    }
  }

  // "30 Apr 2027" / "30-Apr-2027"
  let m = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,})[\s\-/](\d{4})$/);
  if (m) {
    const mo = MONTH_ABBR[m[2].slice(0, 3).toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  // "Apr 30, 2027"
  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_ABBR[m[1].slice(0, 3).toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  // "Sep 2026" — month precision; treat as month end so a product isn't
  // reported expired partway through its final month.
  m = s.match(/^([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_ABBR[m[1].slice(0, 3).toLowerCase()];
    if (mo) {
      const lastDay = new Date(Date.UTC(parseInt(m[2], 10), mo, 0)).getUTCDate();
      return `${m[2]}-${String(mo).padStart(2, "0")}-${lastDay}`;
    }
  }

  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const lastDay = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10), 0)).getUTCDate();
    return `${m[1]}-${m[2]}-${lastDay}`;
  }

  // MM/DD/YYYY — the catalog is a US-sourced export
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

/**
 * Status from an EOS date. An empty date means the catalog announces no end of
 * support — the normal state for a current release — which reads as Supported
 * and is therefore dropped from the upgrade opportunities list.
 */
export function statusFromEos(endOfSupportIso: string, today = new Date()): LifecycleStatus {
  if (!endOfSupportIso) return "Supported";
  const todayIso = today.toISOString().slice(0, 10);
  if (endOfSupportIso < todayIso) return "Expired";
  const horizon = new Date(today);
  horizon.setMonth(horizon.getMonth() + EXPIRING_SOON_MONTHS);
  return endOfSupportIso <= horizon.toISOString().slice(0, 10) ? "Expiring Soon" : "Supported";
}

/**
 * Find a catalog entry, other than the one already tried, that carries the
 * given version for a related product. Used to tell a fixable version gap
 * (an admin mapping redirects to this entry) from a real catalog gap.
 *
 * Entries with a real End of Support date win over undated ones, then the
 * shortest name — the least-embellished variant of the product.
 */
function findEntryCoveringVersion(
  cspName: string,
  version: string,
  excludeCatalogName: string,
  index: CatalogIndex,
): string | null {
  const tokens = significantTokens(cspName);
  if (tokens.length === 0 || !version.trim()) return null;

  const exclude = excludeCatalogName.trim().toLowerCase();
  let best: { name: string; dated: boolean; len: number } | null = null;

  for (const [lowerName, rows] of index.entries) {
    if (lowerName === exclude) continue;
    if (!tokens.some((t) => lowerName.includes(t))) continue;
    const hit = resolveVersion(version, rows);
    if (!hit) continue;
    const dated = toIsoDate(String(hit.endOfSupport ?? "")) !== "";
    if (!best || (dated && !best.dated) || (dated === best.dated && lowerName.length < best.len)) {
      best = { name: rows[0].productName, dated, len: lowerName.length };
    }
  }
  return best?.name ?? null;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Resolve a CSP product to its lifecycle status.
 *
 * @param productName    CSP "Product Name" (primary match key)
 * @param productVersion CSP product version
 * @param productNameAlt CSP "Product" column — tried as a second candidate when
 *                       the primary name doesn't resolve. Safe to omit; batches
 *                       uploaded before this column was mapped carry "".
 */
export function resolveLifecycle(
  productName: string,
  productVersion: string,
  productNameAlt = "",
  today = new Date(),
): LifecycleResolution {
  const index = getCatalogIndex();
  if (index.entries.length === 0) return { kind: "unmapped-name" };

  const altUsable =
    productNameAlt.trim() !== "" &&
    productNameAlt.trim().toLowerCase() !== productName.trim().toLowerCase();

  // Automatic layers on both CSP name columns, then manual mappings on both.
  // The primary name wins ties because it is the column the rest of the app
  // keys on; manual mappings run last so they only cover genuine fall-through.
  const resolved =
    resolveNameAutomatic(productName, index) ??
    (altUsable ? resolveNameAutomatic(productNameAlt, index) : null) ??
    resolveNameManual(productName, index) ??
    (altUsable ? resolveNameManual(productNameAlt, index) : null);

  if (!resolved) return { kind: "unmapped-name" };

  const row = resolveVersion(productVersion, resolved.rows);
  // The entry we resolved to has no row for this version. Any date available
  // under it belongs to a different version, so none is asserted. Before
  // reporting it as a catalog gap, check whether a SIBLING entry carries the
  // version — for "Storage Scale 5.1.9" the auto-picked "Standard Edition" has
  // only 6.0.0, while "Storage Scale System Software Data Access Edition" has
  // 5.1.9 exactly. That distinction decides whether an admin can fix it.
  if (!row) {
    return {
      kind: "unmapped-version",
      matchedProductName: resolved.catalogName,
      alternativeProductName: findEntryCoveringVersion(
        productName,
        productVersion,
        resolved.catalogName,
        index,
      ),
    };
  }

  const endOfSupport = toIsoDate(String(row.endOfSupport ?? ""));
  return {
    kind: "resolved",
    status: statusFromEos(endOfSupport, today),
    endOfSupport,
    extendedEndOfSupport: toIsoDate(String(row.extendedEndOfSupport ?? "")),
    lifecyclePolicy: String(row.lifecyclePolicy ?? "").trim(),
    matchedProductName: resolved.catalogName,
    matchedVersion: String(row.vrm ?? "").trim(),
  };
}

/** All distinct catalog product names — powers the admin mapping autocomplete. */
export function listCatalogProductNames(): string[] {
  const index = getCatalogIndex();
  return index.entries.map(([, rows]) => rows[0].productName).sort((a, b) => a.localeCompare(b));
}

// ─── Mapping suggestions (admin Pending Products) ────────────────────────────

/** A candidate catalog entry an admin might map an unresolved CSP product to. */
export interface CatalogSuggestion {
  catalogName: string;
  /** How many of the product's observed CSP versions this entry actually covers. */
  versionsCovered: number;
  /** How many observed versions were tested. */
  versionsTested: number;
  /** A few of the entry's VRM values, so the admin can eyeball the fit. */
  sampleVrms: string[];
  /** True when at least one covered version yields a real End of Support date. */
  hasDates: boolean;
}

/**
 * Words too common to discriminate between catalog product names.
 *
 * "manager" earns its place here: it let QRadar Log Manager and QRadar Risk
 * Manager qualify as candidates for "Content Manager OnDemand" — unrelated
 * products that shared only that word and happened to carry 7.4.x / 7.5.x
 * releases, which pushed the correct entry out of the suggestion list.
 */
const STOPWORDS = new Set([
  "ibm",
  "for",
  "and",
  "the",
  "of",
  "on",
  "in",
  "with",
  "server",
  "edition",
  "software",
  "application",
  "system",
  "systems",
  "data",
  "management",
  "manager",
  "solutions",
  "suite",
  "package",
  "tools",
]);

function significantTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** One observed CSP version, weighted by how many clients run it. */
export interface ObservedVersion {
  version: string;
  /** Distinct clients on this version. Drives ranking; 1 is a safe default. */
  clients: number;
}

/**
 * Suggest catalog entries for a CSP product the matcher could not resolve.
 *
 * Ranking is driven primarily by VERSION COVERAGE rather than name similarity,
 * because name similarity alone is actively misleading here: for CSP's
 * "Db2 Linux, Unix and Windows", the catalog entry sharing the most words is
 * "DB2 Performance Expert for Linux, UNIX and Windows" — a different product —
 * whereas the entry that actually carries the customer's 11.5 / 12.1 releases
 * shares only the word "db2".
 *
 * Coverage is weighted by CLIENT COUNT, not by number of versions. Counting
 * versions gets real cases backwards: for "Content Manager OnDemand",
 * "…for i" covers two of three versions while "…for Multiplatforms" covers one
 * — but that one is 10.5, which 30 of the 34 affected clients run. The entry
 * serving the most clients is the one worth offering first.
 */
export function suggestCatalogMatches(
  cspName: string,
  observedVersions: ObservedVersion[],
  limit = 4,
): CatalogSuggestion[] {
  const index = getCatalogIndex();
  if (index.entries.length === 0) return [];

  const needleTokens = significantTokens(cspName);
  if (needleTokens.length === 0) return [];
  const versions = observedVersions.filter((v) => v.version.trim()).slice(0, 8);

  const scored: {
    s: CatalogSuggestion;
    clientsCovered: number;
    tokenScore: number;
    nameLen: number;
  }[] = [];

  for (const [lowerName, rows] of index.entries) {
    // Cheap gate: share at least one significant token.
    let shared = 0;
    for (const t of needleTokens) {
      if (lowerName.includes(t)) shared++;
    }
    if (shared === 0) continue;

    let covered = 0;
    let clientsCovered = 0;
    let hasDates = false;
    for (const v of versions) {
      const hit = resolveVersion(v.version, rows);
      if (hit) {
        covered++;
        clientsCovered += Math.max(1, v.clients);
        if (toIsoDate(String(hit.endOfSupport ?? ""))) hasDates = true;
      }
    }
    // A candidate that covers none of the customer's versions is only worth
    // offering when the name overlap is strong, otherwise it is noise.
    if (covered === 0 && shared < needleTokens.length) continue;

    scored.push({
      s: {
        catalogName: rows[0].productName,
        versionsCovered: covered,
        versionsTested: versions.length,
        sampleVrms: rows
          .map((r) => String(r.vrm ?? "").trim())
          .filter(Boolean)
          .slice(0, 6),
        hasDates,
      },
      clientsCovered,
      tokenScore: shared / needleTokens.length,
      nameLen: lowerName.length,
    });
  }

  // Client-weighted coverage first, then NAME overlap. hasDates is deliberately
  // a weak tiebreaker rather than a strong one: a current product's newest
  // release carries no announced EOS date, so ranking dated entries higher
  // pushes retired appliance SKUs above the live software product — e.g. it
  // buried "IBM Security QRadar SIEM" (7.5.x, undated) under "IBM QRadar 1901
  // Appliance" purely because the appliance had already been withdrawn.
  scored.sort(
    (a, b) =>
      b.clientsCovered - a.clientsCovered ||
      b.tokenScore - a.tokenScore ||
      Number(b.s.hasDates) - Number(a.s.hasDates) ||
      a.nameLen - b.nameLen,
  );
  return scored.slice(0, limit).map((x) => x.s);
}
