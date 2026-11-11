/**
 * Pending Products scanner
 * ────────────────────────
 * Finds every CSP product name that the lifecycle matcher cannot resolve —
 * across ALL clients — so an admin knows what to map and in what order.
 *
 * Scans the uploaded CSP JSON files one at a time and keeps only aggregates,
 * never the cases themselves: the full store is >1M cases / ~580MB, which must
 * not be held in memory at once.
 *
 * Results are cached briefly because the scan is expensive and the underlying
 * data only changes on upload. Saving a mapping invalidates the cache so the
 * admin sees the product leave the list immediately.
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";
import type { CspCase } from "./dataIngestionService";
import {
  resolveProductName,
  suggestCatalogMatches,
  type CatalogSuggestion,
} from "./productLifecycleService";
import { safeReadClientOverview } from "./caseDataReader";
import {
  cspDataFingerprint,
  lifecycleConfigFingerprint,
  readDiskCache,
  writeDiskCache,
} from "./dataFingerprint";

export interface PendingProduct {
  /** CSP product name exactly as it appears in case data. */
  productName: string;
  /** How many cases across ONBOARDED clients reference it. */
  caseCount: number;
  /** How many distinct ONBOARDED clients (by CMR) reference it. */
  clientCount: number;
  /** A few example versions seen, to help identify the product when mapping. */
  sampleVersions: string[];
  /** Candidate catalog entries, best first — the admin picks one to map to. */
  suggestions: CatalogSuggestion[];
}

interface PendingResult {
  products: PendingProduct[];
  /** Distinct product names seen in the scan (resolved + unresolved). */
  totalDistinctProducts: number;
  /** Distinct product names that resolved automatically or via a mapping. */
  resolvedProducts: number;
  scannedAt: string;
}

/**
 * In-process memo, backed by a disk cache keyed on a data fingerprint.
 *
 * A time-based TTL was wrong here: the scan costs ~14s and the inputs only
 * change on upload, so a 5-minute expiry meant repeatedly paying full price
 * for an unchanged answer — and every server restart paid it again. The
 * fingerprint covers the CSP files plus the catalog and mapping table, so the
 * result is reused until one of those genuinely changes.
 */
let cached: PendingResult | null = null;
let cachedFingerprint = "";

function currentFingerprint(): string {
  return `${cspDataFingerprint()}||${lifecycleConfigFingerprint()}`;
}

/** Drop the cached scan — call after a mapping or catalog upload changes. */
export function invalidatePendingProductsCache(): void {
  cached = null;
  cachedFingerprint = "";
}

function cspDir(): string {
  return path.join(path.dirname(getExcelFilePath()), "csp");
}

function legacyCspPath(): string {
  return path.join(path.dirname(getExcelFilePath()), "csp_data.json");
}

/**
 * Aggregate every (product name) seen in CSP data that carries a version and is
 * Software/SaaS — the same population the Upgrade Opportunities section draws from, so the
 * list only contains products a mapping would actually affect.
 *
 * Restricted to ONBOARDED clients. The CSP export is the full IBM case store
 * (~24k distinct customers), of which only those in ClientOverview have an
 * Insights page. Counting the rest would rank products by global IBM footprint
 * rather than by impact here — e.g. "PowerVM / VIOS" spans 1,674 CSP customers
 * but only 49 onboarded clients.
 */
export function getPendingProducts(force = false): PendingResult {
  const fingerprint = currentFingerprint();
  if (!force) {
    // In-process first, then the disk cache — which also serves the first
    // request after a restart or redeploy, when memory is empty but the data
    // has not changed.
    if (cached && cachedFingerprint === fingerprint) return cached;
    const fromDisk = readDiskCache<PendingResult>("lifecycle_pending", fingerprint);
    if (fromDisk) {
      cached = fromDisk;
      cachedFingerprint = fingerprint;
      return fromDisk;
    }
  }

  const onboardedCmrs = new Set<string>();
  for (const row of safeReadClientOverview()) {
    const cmr = String(row.cmr_number ?? "").trim();
    if (cmr) onboardedCmrs.add(cmr.replace(/^0+/, "") || cmr);
  }

  interface Agg {
    productName: string;
    caseCount: number;
    clients: Set<string>;
    /** version → distinct clients running it, so suggestions can be weighted. */
    versions: Map<string, Set<string>>;
  }
  const agg = new Map<string, Agg>();
  const seenCases = new Set<string>();

  const files: string[] = [];
  try {
    if (fs.existsSync(legacyCspPath())) files.push(legacyCspPath());
  } catch {
    /* ignore */
  }
  try {
    const dir = cspDir();
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".json")) files.push(path.join(dir, f));
      }
    }
  } catch {
    /* ignore */
  }

  for (const file of files) {
    let rows: CspCase[];
    try {
      rows = JSON.parse(fs.readFileSync(file, "utf-8")) as CspCase[];
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) continue;

    for (const c of rows) {
      // Same population as the Upgrade Opportunities section: Software/SaaS, versioned,
      // deduplicated by case number across files.
      const hw = String(c.hwSwSaas ?? "").toLowerCase();
      if (hw !== "software" && hw !== "saas") continue;
      const version = String(c.productVersion ?? "").trim();
      if (!version) continue;
      const name = String(c.productName ?? "").trim();
      if (!name) continue;
      // Only clients that exist in this Control Plane — see the note above.
      const cmrNorm = String(c.cmrNumber ?? "")
        .trim()
        .replace(/^0+/, "");
      if (!cmrNorm || !onboardedCmrs.has(cmrNorm)) continue;
      const caseNumber = String(c.caseNumber ?? "");
      if (!caseNumber || seenCases.has(caseNumber)) continue;
      seenCases.add(caseNumber);

      const key = name.toLowerCase();
      let entry = agg.get(key);
      if (!entry) {
        entry = { productName: name, caseCount: 0, clients: new Set(), versions: new Map() };
        agg.set(key, entry);
      }
      entry.caseCount++;
      entry.clients.add(cmrNorm);
      // Every version is tracked, not just the first few — the most-used ones
      // are picked afterwards, since file order says nothing about importance.
      let vClients = entry.versions.get(version);
      if (!vClients) {
        vClients = new Set();
        entry.versions.set(version, vClients);
      }
      vClients.add(cmrNorm);
    }
    // Release the parsed batch before reading the next file.
    rows.length = 0;
  }

  // Resolution is checked once per distinct product name, not per case.
  const products: PendingProduct[] = [];
  let resolvedProducts = 0;
  for (const entry of agg.values()) {
    if (resolveProductName(entry.productName)) {
      resolvedProducts++;
      continue;
    }
    // Most-used versions first — these drive both the display and the
    // suggestion ranking, so they must reflect what clients actually run.
    const ranked = [...entry.versions.entries()]
      .map(([version, clients]) => ({ version, clients: clients.size }))
      .sort((a, b) => b.clients - a.clients || a.version.localeCompare(b.version));

    products.push({
      productName: entry.productName,
      caseCount: entry.caseCount,
      clientCount: entry.clients.size,
      sampleVersions: ranked.slice(0, 5).map((v) => v.version),
      // Ranked by how many CLIENTS each candidate would resolve, so the admin
      // can pick without hunting through 4,000+ catalog names.
      suggestions: suggestCatalogMatches(entry.productName, ranked),
    });
  }

  // Highest impact first: most clients affected, then most cases.
  products.sort(
    (a, b) =>
      b.clientCount - a.clientCount ||
      b.caseCount - a.caseCount ||
      a.productName.localeCompare(b.productName),
  );

  cached = {
    products,
    totalDistinctProducts: agg.size,
    resolvedProducts,
    scannedAt: new Date().toISOString(),
  };
  cachedFingerprint = fingerprint;
  writeDiskCache("lifecycle_pending", fingerprint, cached);
  return cached;
}
