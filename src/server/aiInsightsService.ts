/**
 * AI Insights Service — Bob CLI integration.
 * All Bob calls go through this file. Nothing else calls Bob directly.
 *
 * Uses Bob CLI in non-interactive mode: bob -p "<prompt>"
 * Authenticated via BOBSHELL_API_KEY environment variable.
 */
import { spawn } from "child_process";
import fs from "node:fs";
import path from "node:path";

/** Read BOBSHELL_API_KEY at call-time so a server restart isn't required after .env changes. */
function getBobApiKey(): string {
  // 1. Already in process.env (set before server started)
  if (process.env.BOBSHELL_API_KEY) return process.env.BOBSHELL_API_KEY;
  // 2. Read live from .env file
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    const content = fs.readFileSync(envPath, "utf-8");
    const match = content.match(/^BOBSHELL_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    /* ignore */
  }
  return "";
}
import type { SupportCase, EcEngagement } from "./caseDataReader";
import { resolveLifecycle, type LifecycleStatus } from "./productLifecycleService";
import { isSev1 } from "./caseDataReader";
import { serviceCategoryFor } from "@/constants/serviceCategories";

// ─── Bob CLI runner ────────────────────────────────────────────────────────────

function cleanOutput(raw: string): string {
  let text = raw
    .replace(/\x1B\[[0-9;]*[mGKHF]/g, "") // strip ANSI colour codes
    .replace(/\r\n/g, "\n");

  // Strip <thinking>...</thinking> blocks (may span multiple lines)
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");

  // Strip [using tool ...] lines and ---output--- markers
  text = text.replace(/\[using tool[\s\S]*?\]/g, "");
  text = text.replace(/---output---/g, "");

  // Strip cost annotations
  text = text.replace(/\|\s*Cost:\s*[\d.]+\]/g, "");

  // Strip leading role labels
  text = text.replace(/^(Bob:|Assistant:|AI:)\s*/im, "");

  // Collapse multiple blank lines and trim
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return text;
}

export function runBobCLI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      BOBSHELL_API_KEY: getBobApiKey(),
    };

    const child = spawn("bob", ["--accept-license", "-p", prompt], {
      env,
      timeout: 120_000, // 2 min
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code: number | null) => {
      if (code === 0 && stdout.trim()) {
        resolve(cleanOutput(stdout));
      } else {
        reject(new Error(`Bob CLI failed (code: ${code}) → ${stderr || "No output"}`));
      }
    });

    child.on("error", (err: Error) => {
      reject(err);
    });
  });
}

// ─── Hardcoded logic layer (deterministic — no AI needed) ─────────────────────

export interface CaseAnalysis {
  clientName: string;
  /** The Clarizen Customer Number / CMR for this insight set. Shown prominently in the UI. */
  customerId: string;
  totalCases: number;
  sev1Cases: number;
  openCases: SupportCase[];
  closedCases: SupportCase[];

  // Per-product
  productStats: ProductStat[];
  top5ByTotal: ProductStat[];
  top5BySev1: ProductStat[];

  // EC / Non-EC split
  ecProducts: string[];
  /** Project-level EC/EM engagement rows (one per Clarizen row, not deduped by product). */
  ecEngagements: EcEngagement[];
  nonEcProducts: string[];

  /**
   * Upgrade/modernisation candidates — every distinct (Non-EC product, version)
   * pair with a non-empty version, across ALL cases (no Top N limit). Computed
   * independently of productStats/opportunities/nonEcProducts, which dedupe by
   * product name only and would collapse multiple versions of the same product
   * into one entry.
   */
  upgradeCandidates: UpgradeCandidate[];

  /**
   * Non-EC (product, version) pairs that could not be checked for support
   * status, each with the specific reason, so an admin can act on them directly
   * from the client's Insights page rather than hunting in the admin panel.
   */
  unmappedProducts: UnmappedProduct[];

  // Opportunity signal per product
  opportunities: OpportunityItem[];

  // Keyword frequencies from summaries
  keywords: { term: string; count: number }[];

  // Status breakdown
  statusBreakdown: { status: string; count: number; products: string[] }[];

  // Monthly trend
  monthlyTrend: { month: string; count: number }[];

  // Cases where resolution took / is taking > 30 days, grouped by product
  longResolutionCases: LongResolutionProductGroup[];

  /**
   * CSP entries that are service categories, not products (see
   * constants/serviceCategories.ts). Counted in the totals above, excluded
   * from every product-level breakdown.
   */
  serviceCategories: ServiceCategoryStat[];
}

export interface ServiceCategoryStat {
  /** Display label, e.g. "Essential Management Service". */
  label: string;
  /** The raw CSP "Product Name" values folded into this category. */
  sourceNames: string[];
  totalCases: number;
  sev1Cases: number;
  openCases: number;
  closedCases: number;
}

/** A case that has been open or took > 30 days to resolve */
export interface LongResolutionCase {
  caseNumber: string;
  status: string;
  resolutionDays: number;
  openDate: string;
  closeDate: string;
  isStillOpen: boolean;
}

export interface LongResolutionProductGroup {
  productName: string;
  caseCount: number;
  cases: LongResolutionCase[];
}

export interface ProductStat {
  productName: string;
  division?: string;
  segment?: string;
  totalCases: number;
  sev1Cases: number;
  sev2Cases: number;
  sev3Cases: number;
  sev4Cases: number;
  openCases: number;
  closedCases: number;
  statuses: Record<string, number>;
  concepts: string[];
}

export interface OpportunityItem {
  productName: string;
  division?: string;
  segment?: string;
  totalCases: number;
  sev1Cases: number;
  sev2Cases: number;
  sev3Cases: number;
  sev4Cases: number;
  signal: "High" | "Medium" | "Low";
  isEC: boolean;
}

/**
 * One (Non-EC product, version) row for the Upgrade Opportunities section.
 *
 * Only products resolved to a lifecycle catalog entry AND carrying a status of
 * Expired or Expiring Soon reach this list. Supported products are dropped —
 * they are not upgrade opportunities — as are products the matcher could not
 * resolve, which are listed in {@link CaseAnalysis.unmappedProducts}.
 */
export interface UpgradeCandidate {
  productName: string;
  productVersion: string;
  division: string;
  segment: string;
  /** True when this product appears with more than one distinct version — flagged for highlighting. */
  isMultiVersion: boolean;
  /**
   * Other versions of this product (same EC/Non-EC table) that resolved to
   * Supported and are therefore not shown as rows. Without this, a client
   * running mostly the current release with a few legacy instances reads as
   * having only the legacy versions — e.g. Sandvik Mining's Maximo Application
   * Suite on Cloud has 65 cases on 9.1.0 (Supported, hidden) and 15 on 8.11.0
   * (Expired, shown); the "2 versions" badge covered only the shown ones with
   * no indication a third, healthy version existed.
   */
  hiddenSupportedVersions: string[];
  /**
   * True when the client holds an Expert Care contract for this product. Drives
   * which of the two Upgrades tables the row appears in — EC first, as the
   * easier upgrade conversation — and is not shown as a column.
   */
  isEC: boolean;
  /** Resolved end-of-support status. Only ever "Expired" or "Expiring Soon" here. */
  lifecycleStatus: LifecycleStatus;
  /** ISO End of Support date from the catalog. Always populated for these rows. */
  endOfSupport: string;
  /** ISO extended/sustained support end date, or "". */
  extendedEndOfSupport: string;
  /** Catalog support policy code, or "". */
  lifecyclePolicy: string;
  /** Catalog product name that was matched. */
  matchedProductName: string;
  /** Catalog VRM that was matched. */
  matchedVersion: string;
}

/**
 * One (product, version) pair the lifecycle matcher could not report a status
 * for, and why. The two reasons need different fixes:
 *
 *  - "no-catalog-match"       no catalog product resolved for this NAME. An
 *                             admin mapping in Product Lifecycle Mapping fixes it.
 *  - "version-not-in-catalog" the product resolved, but the catalog has no row
 *                             for this version. A name mapping will NOT fix
 *                             this — the catalog itself lacks the coverage.
 */
export interface UnmappedProduct {
  productName: string;
  productVersion: string;
  reason: "no-catalog-match" | "version-not-in-catalog";
  /** For version gaps, the catalog product that WAS matched. "" otherwise. */
  matchedProductName: string;
  /**
   * For version gaps, a different catalog entry that DOES carry this version.
   * When set, an admin mapping fixes the row; when "", the catalog genuinely
   * has no coverage and no mapping will help.
   */
  alternativeProductName: string;
}

const KEYWORD_TERMS = [
  "api",
  "vulnerability",
  "vulnerabilit",
  "cve",
  "security",
  "system down",
  "performance",
  "timeout",
  "upgrade",
  "migration",
  "deployment",
  "crash",
  "error",
  "failure",
  "slow",
  "connection",
  "database",
  "memory",
  "cpu",
  "disk",
  "cache",
  "certificate",
];

/** Returns true if a case status indicates it is resolved/closed. */
function isClosed(status: string): boolean {
  const s = status.toLowerCase().trim();
  return (
    s === "resolution provided" ||
    s === "closed - archived" ||
    s === "closed" ||
    s === "closed as spam" ||
    s.startsWith("closed")
  );
}

export function analyseCases(
  cases: SupportCase[],
  clientName: string,
  ecProducts: string[],
  customerId = "",
  ecEngagements: EcEngagement[] = [],
): CaseAnalysis {
  // Filter out cases with blank or "Unassigned" product names — these cannot
  // be meaningfully compared against EC products and should not affect the
  // expansion logic (Requirement: skip them entirely).
  const validCases = cases.filter((c) => {
    const name = c.productName.trim();
    return name !== "" && name.toLowerCase() !== "unassigned";
  });

  const sev1Cases = validCases.filter(isSev1).length;
  const openCases = validCases.filter((c) => !isClosed(c.status));
  const closedCases = validCases.filter((c) => isClosed(c.status));

  // Service categories (e.g. "Analytics Cloud Service" = Essential Management)
  // stay in the totals above but out of every product-level breakdown below.
  const serviceCategoryMap = new Map<string, ServiceCategoryStat>();
  const productCases: SupportCase[] = [];
  for (const c of validCases) {
    const label = serviceCategoryFor(c.productName);
    if (!label) {
      productCases.push(c);
      continue;
    }
    let s = serviceCategoryMap.get(label);
    if (!s) {
      s = { label, sourceNames: [], totalCases: 0, sev1Cases: 0, openCases: 0, closedCases: 0 };
      serviceCategoryMap.set(label, s);
    }
    if (!s.sourceNames.includes(c.productName)) s.sourceNames.push(c.productName);
    s.totalCases++;
    if (isSev1(c)) s.sev1Cases++;
    if (isClosed(c.status)) s.closedCases++;
    else s.openCases++;
  }
  const serviceCategories = [...serviceCategoryMap.values()].sort((a, b) => b.totalCases - a.totalCases);

  // Helper to extract severity number
  const getSeverity = (c: SupportCase): number => {
    const vals = [c.currentSeverity, c.maxSeverity, c.initialSeverity, c.priority];
    for (const val of vals) {
      const cleaned = String(val).trim();
      if (cleaned === "1") return 1;
      if (cleaned === "2") return 2;
      if (cleaned === "3") return 3;
      if (cleaned === "4") return 4;
    }
    for (const val of vals) {
      const str = String(val).toLowerCase();
      if (str.includes("1")) return 1;
      if (str.includes("2")) return 2;
      if (str.includes("3")) return 3;
      if (str.includes("4")) return 4;
    }
    return 4;
  };

  // Per-product stats
  const productMap = new Map<string, ProductStat>();
  for (const c of productCases) {
    if (!productMap.has(c.productName)) {
      productMap.set(c.productName, {
        productName: c.productName,
        division: c.division ?? "",
        segment: c.segment ?? "",
        totalCases: 0,
        sev1Cases: 0,
        sev2Cases: 0,
        sev3Cases: 0,
        sev4Cases: 0,
        openCases: 0,
        closedCases: 0,
        statuses: {},
        concepts: [],
      });
    }
    const p = productMap.get(c.productName)!;
    if (!p.division && c.division) p.division = c.division;
    if (!p.segment && c.segment) p.segment = c.segment;
    p.totalCases++;
    if (isSev1(c)) {
      p.sev1Cases++;
    } else {
      const sev = getSeverity(c);
      if (sev === 2) p.sev2Cases++;
      else if (sev === 3) p.sev3Cases++;
      else p.sev4Cases++;
    }
    if (isClosed(c.status)) p.closedCases++;
    else p.openCases++;
    p.statuses[c.status] = (p.statuses[c.status] ?? 0) + 1;
    if (c.concept && !p.concepts.includes(c.concept)) p.concepts.push(c.concept);
  }
  const productStats = [...productMap.values()].sort((a, b) => b.totalCases - a.totalCases);

  // EC / non-EC classification
  const ecProductsNorm = ecProducts.map((p) => p.toLowerCase().trim());
  const nonEcProducts: string[] = [];
  for (const ps of productStats) {
    const name = ps.productName.toLowerCase().trim();
    const inContract = ecProductsNorm.some((ec) => name.includes(ec) || ec.includes(name));
    if (!inContract) nonEcProducts.push(ps.productName);
  }

  // Opportunity signal
  const opportunities: OpportunityItem[] = productStats.map((ps) => {
    const name = ps.productName.toLowerCase().trim();
    const inContract = ecProductsNorm.some((ec) => name.includes(ec) || ec.includes(name));
    let signal: "High" | "Medium" | "Low" = "Low";
    if (ps.totalCases >= 4 || ps.sev1Cases >= 2) signal = "High";
    else if (ps.totalCases >= 3 || ps.sev1Cases >= 1) signal = "Medium";
    return {
      productName: ps.productName,
      division: ps.division ?? "",
      segment: ps.segment ?? "",
      totalCases: ps.totalCases,
      sev1Cases: ps.sev1Cases,
      sev2Cases: ps.sev2Cases,
      sev3Cases: ps.sev3Cases,
      sev4Cases: ps.sev4Cases,
      signal,
      isEC: inContract,
    };
  });

  // Upgrade Opportunities — every distinct (product, version) pair, EC and Non-EC alike, no
  // Top N limit. Built independently from validCases rather than from
  // productStats/nonEcProducts, since those dedupe by product name alone and
  // would collapse "AIX 7.1" / "AIX 7.2" into a single "AIX" entry.
  //
  // EC products are INCLUDED and flagged rather than filtered out: a contracted
  // customer approaching end of support is the easier upgrade conversation, so
  // those lead the section. The flag only drives which table a row lands in —
  // matching and status are computed identically either way.
  const upgradeMap = new Map<
    string,
    {
      productName: string;
      productVersion: string;
      productNameAlt: string;
      division: string;
      segment: string;
      isEC: boolean;
    }
  >();
  for (const c of productCases) {
    const version = c.productVersion?.trim();
    if (!version) continue; // Rule: skip rows with no version value entirely
    const name = c.productName.toLowerCase().trim();
    const inContract = ecProductsNorm.some((ec) => name.includes(ec) || ec.includes(name));
    const key = `${c.productName}|||${version}`;
    const existing = upgradeMap.get(key);
    if (!existing) {
      upgradeMap.set(key, {
        productName: c.productName,
        productVersion: version,
        productNameAlt: c.productNameAlt ?? "",
        division: c.division ?? "",
        segment: c.segment ?? "",
        isEC: inContract,
      });
    } else {
      if (!existing.division && c.division) existing.division = c.division;
      if (!existing.segment && c.segment) existing.segment = c.segment;
      if (!existing.productNameAlt && c.productNameAlt) existing.productNameAlt = c.productNameAlt;
      // Any case matching a contracted product makes the pair EC.
      if (inContract) existing.isEC = true;
    }
  }
  // Count distinct versions per product to flag multi-version products.
  const versionsByProduct = new Map<string, Set<string>>();
  for (const v of upgradeMap.values()) {
    if (!versionsByProduct.has(v.productName)) versionsByProduct.set(v.productName, new Set());
    versionsByProduct.get(v.productName)!.add(v.productVersion);
  }

  // Resolve each (product, version) against the IBM Product Lifecycle Catalog.
  // Only Expired / Expiring Soon rows are carried forward — Supported products
  // are not upgrade opportunities, and anything that failed to resolve is
  // counted instead so the UI can show a data-completeness note without naming
  // the products client-side.
  const enrichedUpgrades: UpgradeCandidate[] = [];
  const unmappedProducts: UnmappedProduct[] = [];
  // Versions dropped as Supported, per (table, product) — surfaced as a small
  // "+N more (Supported)" note so a healthy version doesn't just disappear.
  const hiddenSupportedByGroup = new Map<string, Set<string>>();
  for (const v of upgradeMap.values()) {
    const life = resolveLifecycle(v.productName, v.productVersion, v.productNameAlt);
    if (life.kind !== "resolved") {
      // Both an unresolvable name and a version the catalog doesn't cover are
      // gaps we cannot report a status for, but they need different fixes.
      unmappedProducts.push({
        productName: v.productName,
        productVersion: v.productVersion,
        reason: life.kind === "unmapped-name" ? "no-catalog-match" : "version-not-in-catalog",
        matchedProductName: life.kind === "unmapped-version" ? life.matchedProductName : "",
        alternativeProductName:
          life.kind === "unmapped-version" ? (life.alternativeProductName ?? "") : "",
      });
      continue;
    }
    if (life.status === "Supported") {
      const key = `${v.isEC ? "ec" : "non"}|||${v.productName}`;
      if (!hiddenSupportedByGroup.has(key)) hiddenSupportedByGroup.set(key, new Set());
      hiddenSupportedByGroup.get(key)!.add(v.productVersion);
      continue;
    }
    enrichedUpgrades.push({
      productName: v.productName,
      productVersion: v.productVersion,
      division: v.division,
      segment: v.segment,
      isMultiVersion: (versionsByProduct.get(v.productName)?.size ?? 0) > 1,
      hiddenSupportedVersions: [], // filled in once every group's hidden set is known
      isEC: v.isEC,
      lifecycleStatus: life.status,
      endOfSupport: life.endOfSupport,
      extendedEndOfSupport: life.extendedEndOfSupport,
      lifecyclePolicy: life.lifecyclePolicy,
      matchedProductName: life.matchedProductName,
      matchedVersion: life.matchedVersion,
    });
  }
  for (const u of enrichedUpgrades) {
    const hidden = hiddenSupportedByGroup.get(`${u.isEC ? "ec" : "non"}|||${u.productName}`);
    if (hidden) u.hiddenSupportedVersions = [...hidden].sort();
  }

  // isMultiVersion was computed across ALL of the client's versions; recompute
  // it over the rows that survived filtering, per table, so the "N versions"
  // badge matches what is actually on screen in that section.
  const shownVersionCounts = new Map<string, number>();
  for (const u of enrichedUpgrades) {
    const key = `${u.isEC ? "ec" : "non"}|||${u.productName}`;
    shownVersionCounts.set(key, (shownVersionCounts.get(key) ?? 0) + 1);
  }
  for (const u of enrichedUpgrades) {
    u.isMultiVersion =
      (shownVersionCounts.get(`${u.isEC ? "ec" : "non"}|||${u.productName}`) ?? 0) > 1;
  }

  // Sort Expired first, then Expiring Soon, WITHOUT breaking the product
  // grouping the table renders via rowSpan: order products by their worst
  // version status, then keep that product's versions contiguous.
  const STATUS_RANK: Record<LifecycleStatus, number> = {
    Expired: 0,
    "Expiring Soon": 1,
    Supported: 2,
  };
  // Worst status is tracked per (table, product) so a product that is EC for
  // this client can't influence the ordering of the Non-EC table.
  const groupKey = (u: UpgradeCandidate) => `${u.isEC ? "ec" : "non"}|||${u.productName}`;
  const worstStatusByProduct = new Map<string, number>();
  for (const u of enrichedUpgrades) {
    const rank = STATUS_RANK[u.lifecycleStatus];
    const current = worstStatusByProduct.get(groupKey(u));
    if (current === undefined || rank < current) worstStatusByProduct.set(groupKey(u), rank);
  }
  const upgradeCandidates: UpgradeCandidate[] = enrichedUpgrades.sort((a, b) => {
    // EC rows lead — contracted customers are the easier upgrade conversation.
    if (a.isEC !== b.isEC) return a.isEC ? -1 : 1;
    const groupDiff =
      (worstStatusByProduct.get(groupKey(a)) ?? 2) - (worstStatusByProduct.get(groupKey(b)) ?? 2);
    if (groupDiff !== 0) return groupDiff;
    const nameDiff = a.productName.localeCompare(b.productName);
    if (nameDiff !== 0) return nameDiff;
    // Within a product: most urgent version first, then version string.
    const statusDiff = STATUS_RANK[a.lifecycleStatus] - STATUS_RANK[b.lifecycleStatus];
    if (statusDiff !== 0) return statusDiff;
    return a.productVersion.localeCompare(b.productVersion);
  });

  // Top 5
  const top5ByTotal = [...productStats].sort((a, b) => b.totalCases - a.totalCases).slice(0, 5);
  const top5BySev1 = [...productStats].sort((a, b) => b.sev1Cases - a.sev1Cases).slice(0, 5);

  // Keywords
  const allText = validCases.map((c) => (c.summary + " " + c.concept).toLowerCase()).join(" ");
  const keywords = KEYWORD_TERMS.map((term) => {
    const count = (allText.match(new RegExp(term, "g")) ?? []).length;
    return { term, count };
  })
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count);

  // Status breakdown (use validCases)
  const statusMap = new Map<string, { count: number; products: Set<string> }>();
  for (const c of validCases) {
    if (!statusMap.has(c.status)) statusMap.set(c.status, { count: 0, products: new Set() });
    const s = statusMap.get(c.status)!;
    s.count++;
    s.products.add(serviceCategoryFor(c.productName) ?? c.productName);
  }
  const statusBreakdown = [...statusMap.entries()].map(([status, v]) => ({
    status,
    count: v.count,
    products: [...v.products],
  }));

  // Monthly trend (use validCases) — openDate is now always YYYY-MM-DD
  const MONTH_DISPLAY = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthMap = new Map<string, number>();
  for (const c of validCases) {
    // "2026-01-27" → key "2026-01" for sorting, display as "Jan 2026"
    const isoMonth = c.openDate ? c.openDate.slice(0, 7) : ""; // "YYYY-MM"
    if (!isoMonth) continue;
    monthMap.set(isoMonth, (monthMap.get(isoMonth) ?? 0) + 1);
  }
  const monthlyTrend = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0])) // sort by YYYY-MM string
    .map(([isoMonth, count]) => {
      const [yr, mo] = isoMonth.split("-");
      const label = `${MONTH_DISPLAY[parseInt(mo, 10) - 1] ?? mo} ${yr}`;
      return { month: label, count };
    });

  // Long resolution cases (> 30 days): compute from openDate/closeDate
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const longResMap = new Map<string, LongResolutionCase[]>();
  for (const c of productCases) {
    if (!c.openDate || !/^\d{4}-\d{2}-\d{2}$/.test(c.openDate)) continue;
    const open = new Date(c.openDate);
    if (isNaN(open.getTime())) continue;
    const isStillOpen = !isClosed(c.status);
    let endDate: Date;
    if (!isStillOpen && c.closeDate && /^\d{4}-\d{2}-\d{2}$/.test(c.closeDate)) {
      endDate = new Date(c.closeDate);
      if (isNaN(endDate.getTime())) endDate = today;
    } else {
      endDate = today;
    }
    const resolutionDays = Math.floor((endDate.getTime() - open.getTime()) / 86_400_000);
    if (resolutionDays <= 30) continue;
    if (!longResMap.has(c.productName)) longResMap.set(c.productName, []);
    longResMap.get(c.productName)!.push({
      caseNumber: c.caseNumber,
      status: c.status,
      resolutionDays,
      openDate: c.openDate,
      closeDate: c.closeDate,
      isStillOpen,
    });
  }
  // Sort each product's cases by resolution days desc, then sort products by case count desc
  const longResolutionCases: LongResolutionProductGroup[] = [...longResMap.entries()]
    .map(([productName, cases]) => ({
      productName,
      caseCount: cases.length,
      cases: cases.sort((a, b) => b.resolutionDays - a.resolutionDays),
    }))
    .sort((a, b) => b.caseCount - a.caseCount);

  return {
    clientName,
    customerId,
    totalCases: validCases.length,
    sev1Cases,
    openCases,
    closedCases,
    productStats,
    top5ByTotal,
    top5BySev1,
    ecProducts,
    ecEngagements,
    nonEcProducts,
    upgradeCandidates,
    unmappedProducts: unmappedProducts.sort(
      (a, b) =>
        a.productName.localeCompare(b.productName) ||
        a.productVersion.localeCompare(b.productVersion),
    ),
    opportunities,
    keywords,
    statusBreakdown,
    monthlyTrend,
    longResolutionCases,
    serviceCategories,
  };
}

// ─── Prompt templates ──────────────────────────────────────────────────────────

function buildSev1Prompt(analysis: CaseAnalysis): string {
  const lines = analysis.productStats
    .filter((p) => p.sev1Cases > 0)
    .map(
      (p) =>
        `- ${p.productName}: ${p.sev1Cases} Sev1 case(s), ${p.closedCases} closed, ${p.openCases} open`,
    )
    .join("\n");
  return `You are an IBM Expert Labs technical insights analyst. For the client "${analysis.clientName}", analyse the following Sev1 case data per product and generate ONE concise, professional observation sentence per product (max 20 words each). Be specific about risk or stability signals. Do not use generic phrases like "it is important to monitor".

Sev1 Cases by Product:
${lines}

Respond ONLY with a JSON array like: [{"product":"<name>","insight":"<one sentence>"}]`;
}

function buildStatusPrompt(analysis: CaseAnalysis): string {
  const lines = analysis.statusBreakdown
    .map((s) => `- ${s.status}: ${s.count} case(s) across products: ${s.products.join(", ")}`)
    .join("\n");
  return `You are an IBM Expert Labs delivery analyst. For client "${analysis.clientName}", the following open support cases are waiting:

${lines}

Respond with EXACTLY 3-4 bullet points summarising where delays are concentrated and what action is recommended. Each bullet point must start with "- " on its own line. Be specific and professional. Reference product names. Do not write a paragraph — bullet points only.`;
}

function buildPainPointsPrompt(analysis: CaseAnalysis): string {
  const lines = analysis.top5ByTotal
    .map(
      (p) =>
        `- ${p.productName}: ${p.totalCases} total cases, ${p.sev1Cases} Sev1, concepts: ${p.concepts.join(", ")}`,
    )
    .join("\n");
  return `You are an IBM Expert Labs TAM analyst. For client "${analysis.clientName}", generate ONE insight line per product below — classify as either "High adoption signal" (frequent low-severity = heavily used) or "Instability signal" (Sev1/Sev2 recurring = potentially unstable). Be concise and specific.

Top products by case volume:
${lines}

Respond ONLY with a JSON array like: [{"product":"<name>","signal":"High adoption signal"|"Instability signal","insight":"<one sentence>"}]`;
}

function buildOpportunityPrompt(analysis: CaseAnalysis): string {
  const nonEc = analysis.opportunities.filter((o) => !o.isEC);
  if (nonEc.length === 0) return "";
  const lines = nonEc
    .map(
      (o) =>
        `- Product: ${o.productName} | Total Cases: ${o.totalCases} | Sev1 Cases: ${o.sev1Cases} | Opportunity Signal: ${o.signal}`,
    )
    .join("\n");
  return `You are an IBM Expert Labs sales strategist. For client "${analysis.clientName}", generate ONE commercial recommendation sentence per non-EC/EM product below. Each recommendation should be suitable for a TAM or sales person in a client conversation — specific, opportunity-focused, and concise (max 25 words).

Non EC/EM Products requiring attention:
${lines}

Respond ONLY with a JSON array like: [{"product":"<name>","recommendation":"<one sentence>"}]`;
}

function buildKeywordsPrompt(analysis: CaseAnalysis): string {
  const kws = analysis.keywords
    .slice(0, 8)
    .map((k) => `${k.term}: ${k.count} mention(s)`)
    .join(", ");
  return `You are an IBM Expert Labs account analyst. For client "${analysis.clientName}", the following keywords appeared in support case descriptions this month: ${kws}.

Write ONE paragraph (2-3 sentences) identifying the primary concern theme and what it indicates about the client's environment. Be specific and analytical.`;
}

function buildSummaryPrompt(analysis: CaseAnalysis): string {
  return `You are an IBM Expert Labs executive insights analyst. Summarise the following support case statistics for client "${analysis.clientName}" in ONE professional executive sentence suitable for a QBR presentation.

Stats: ${analysis.totalCases} total cases, ${analysis.sev1Cases} Sev1, ${analysis.openCases.length} open, ${analysis.nonEcProducts.length} non-EC/EM products with cases.

One sentence only. No bullet points.`;
}

// ─── Main generateInsight function ────────────────────────────────────────────

export type InsightType = "sev1" | "status" | "painPoints" | "opportunity" | "keywords" | "summary";

export interface InsightResult {
  type: InsightType;
  aiText: string | null;
  aiAvailable: boolean;
  raw: unknown; // structured data even when AI is unavailable
}

export async function generateInsight(
  type: InsightType,
  analysis: CaseAnalysis,
): Promise<InsightResult> {
  let prompt = "";
  switch (type) {
    case "sev1":
      prompt = buildSev1Prompt(analysis);
      break;
    case "status":
      prompt = buildStatusPrompt(analysis);
      break;
    case "painPoints":
      prompt = buildPainPointsPrompt(analysis);
      break;
    case "opportunity":
      prompt = buildOpportunityPrompt(analysis);
      break;
    case "keywords":
      prompt = buildKeywordsPrompt(analysis);
      break;
    case "summary":
      prompt = buildSummaryPrompt(analysis);
      break;
  }

  if (!prompt) {
    return { type, aiText: null, aiAvailable: false, raw: null };
  }

  try {
    const aiText = await runBobCLI(prompt);
    return { type, aiText, aiAvailable: true, raw: null };
  } catch (err) {
    console.warn(`[insights] Bob CLI unavailable for ${type}:`, err);
    return { type, aiText: null, aiAvailable: false, raw: null };
  }
}

/** Generate all insights in parallel — returns partial results if some fail. */
export async function generateAllInsights(
  analysis: CaseAnalysis,
): Promise<Record<InsightType, InsightResult>> {
  const types: InsightType[] = [
    "summary",
    "sev1",
    "status",
    "painPoints",
    "opportunity",
    "keywords",
  ];
  const results = await Promise.allSettled(types.map((t) => generateInsight(t, analysis)));
  const out = {} as Record<InsightType, InsightResult>;
  results.forEach((r, i) => {
    const t = types[i];
    out[t] =
      r.status === "fulfilled" ? r.value : { type: t, aiText: null, aiAvailable: false, raw: null };
  });
  return out;
}
