/**
 * Consolidated opportunity summary — one view across every customer.
 *
 * ── What it is ──
 * An EXTRA file, `opportunity_summary.json`, written at the end of each
 * completed Run Reports job. Per-customer reports in insights_cache are saved
 * exactly as before; this file is assembled only by reading them, so it can
 * never disagree with the Executive Account Summary:
 *   - Essential Management / Expertise Connect rows come straight from each
 *     report's saved `opportunityRules` (server/opportunityRules.ts).
 *   - Upgrade rows come from each report's saved upgrade candidates — Non-EC,
 *     past or nearing end of support — the same data as the Insights upgrades
 *     table and the "EC & Migration Opportunity" tile.
 * Nothing is calculated when the landing page loads or a file is downloaded.
 *
 * ── Access ──
 * Every view of the summary goes through `rowsForCaller`, which filters with
 * the app's single access rule (accessControl.ts) — the same one behind the
 * customer list. Geo and Market are resolved from the same live index that
 * rule uses, so what a row is labelled and whether a caller may see it can
 * never disagree. Delivery users are refused outright: this is pipeline
 * reporting for Management and Sales.
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { getExcelFilePath } from "./demoDataPaths";
import { safeReadClientOverview } from "./caseDataReader";
import { getClientGeoMarketIndex } from "./geoMarketService";
import { listReports, readReport } from "./reportStore";
import { canAccessClient, type AccessContext } from "./accessControl";
import type { OpportunityRulesResult } from "./opportunityRules";
import { OPPORTUNITY_RULES } from "@/constants/opportunityRules";

export type OpportunityType = "essentialManagement" | "expertiseConnect" | "upgrade";

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  essentialManagement: "Essential Management",
  expertiseConnect: "Expertise Connect",
  upgrade: "Upgrade (EC & Expert Labs Migration)",
};

/** One customer + product + opportunity type. A customer can have many. */
export interface OpportunityRow {
  clientId: string;
  customerName: string;
  /** Clarizen customer number, as shown on the Insights page. */
  customerId: string;
  product: string;
  /** CSP "Division" of the product, e.g. "Data and AI". "" when CSP carries none. */
  division: string;
  type: OpportunityType;
  /** Essential Management / Expertise Connect: cases in the 12-month window. */
  sev1Cases?: number;
  totalCases?: number;
  /** Upgrade: worst status across the product's out-of-support versions. */
  supportStatus?: "Expired" | "Expiring Soon";
  /** Upgrade: earliest end-of-support date across those versions. */
  endOfSupport?: string;
  /** Upgrade: the out-of-support versions. */
  outOfSupportVersions?: string[];
  /** Upgrade: versions the customer also runs that are still supported (Insights "+N more (Supported)"). */
  supportedVersions?: string[];
}

export interface OpportunitySummaryFile {
  /** When the Run Reports job that produced this finished. */
  generatedAt: string;
  window: OpportunityRulesResult["window"] | null;
  thresholds: { essentialManagementSev1Above: number; expertiseConnectCasesAbove: number };
  rows: OpportunityRow[];
}

function summaryPath(): string {
  return path.join(path.dirname(getExcelFilePath()), "opportunity_summary.json");
}

// ── Build (Run Reports only) ─────────────────────────────────────────────────

const STATUS_RANK = { Expired: 0, "Expiring Soon": 1 } as const;

/**
 * Assemble the summary from the saved reports and write it.
 * Called once, at the end of a completed Run Reports job.
 */
export async function writeOpportunitySummary(generatedAt: string): Promise<number> {
  const names = new Map(
    safeReadClientOverview().map((r) => [
      String(r.client_id ?? "").trim(),
      { name: String(r.client_name ?? "").trim(), cmr: String(r.cmr_number ?? "").trim() },
    ]),
  );

  const rows: OpportunityRow[] = [];
  let window: OpportunitySummaryFile["window"] = null;

  for (const { clientId } of await listReports()) {
    const report = await readReport(clientId);
    const analysis = report?.analysis;
    if (!report || !analysis) continue;

    const meta = names.get(clientId);
    const base = {
      clientId,
      customerName: meta?.name || analysis.clientName || clientId,
      customerId: analysis.customerId || meta?.cmr || "",
    };

    // Division per product, as carried on the customer's CSP cases.
    const divisionOf = new Map(analysis.productStats.map((p) => [p.productName, p.division ?? ""]));

    const rules = report.opportunityRules;
    if (rules) {
      window ??= rules.window;
      for (const p of rules.essentialManagement) {
        rows.push({
          ...base,
          product: p.productName,
          division: divisionOf.get(p.productName) ?? "",
          type: "essentialManagement",
          sev1Cases: p.sev1Cases,
          totalCases: p.totalCases,
        });
      }
      for (const p of rules.expertiseConnect) {
        rows.push({
          ...base,
          product: p.productName,
          division: divisionOf.get(p.productName) ?? "",
          type: "expertiseConnect",
          sev1Cases: p.sev1Cases,
          totalCases: p.totalCases,
        });
      }
    }

    // Upgrade: one row per Non-EC product, its versions folded together.
    const byProduct = new Map<string, OpportunityRow>();
    for (const u of analysis.upgradeCandidates ?? []) {
      if (u.isEC) continue;
      const product = u.productName.trim();
      if (!product) continue;
      let row = byProduct.get(product);
      if (!row) {
        row = {
          ...base,
          product,
          division: u.division || divisionOf.get(product) || "",
          type: "upgrade",
          supportStatus: u.lifecycleStatus === "Expired" ? "Expired" : "Expiring Soon",
          endOfSupport: u.endOfSupport,
          outOfSupportVersions: [],
          supportedVersions: [],
        };
        byProduct.set(product, row);
      }
      const status = u.lifecycleStatus === "Expired" ? "Expired" : "Expiring Soon";
      if (STATUS_RANK[status] < STATUS_RANK[row.supportStatus!]) row.supportStatus = status;
      if (u.endOfSupport && (!row.endOfSupport || u.endOfSupport < row.endOfSupport))
        row.endOfSupport = u.endOfSupport;
      if (!row.outOfSupportVersions!.includes(u.productVersion))
        row.outOfSupportVersions!.push(u.productVersion);
      for (const v of u.hiddenSupportedVersions ?? []) {
        if (!row.supportedVersions!.includes(v)) row.supportedVersions!.push(v);
      }
    }
    for (const row of byProduct.values()) {
      row.outOfSupportVersions!.sort();
      row.supportedVersions!.sort();
      rows.push(row);
    }
  }

  const file: OpportunitySummaryFile = {
    generatedAt,
    window,
    thresholds: {
      essentialManagementSev1Above: OPPORTUNITY_RULES.essentialManagementSev1Above,
      expertiseConnectCasesAbove: OPPORTUNITY_RULES.expertiseConnectCasesAbove,
    },
    rows,
  };
  const p = summaryPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file), "utf-8");
  fs.renameSync(tmp, p);
  return rows.length;
}

// ── Read ─────────────────────────────────────────────────────────────────────

let cached: { mtimeMs: number; file: OpportunitySummaryFile } | null = null;

/** The saved summary, or null before the first completed run that writes it. */
export function readOpportunitySummary(): OpportunitySummaryFile | null {
  try {
    const p = summaryPath();
    if (!fs.existsSync(p)) return null;
    const { mtimeMs } = fs.statSync(p);
    if (cached && cached.mtimeMs === mtimeMs) return cached.file;
    const file = JSON.parse(fs.readFileSync(p, "utf-8")) as OpportunitySummaryFile;
    cached = { mtimeMs, file };
    return file;
  } catch {
    return null;
  }
}

// ── Access ───────────────────────────────────────────────────────────────────

/**
 * Admins, Management, Sales and Delivery (with or without edit access — the
 * reports are read-only). Anyone without an entitlement record is refused.
 * Every role sees only the customers its own access allows (rowsForCaller).
 */
export function canViewOpportunities(ctx: AccessContext): boolean {
  if (ctx.unrestricted) return true;
  const role = ctx.entitlement?.role;
  return role === "management" || role === "sales" || role === "delivery";
}

/**
 * Who may narrow the view with Geo/Market filters — every caller who may view
 * opportunities. Safe for all of them: filters are applied after the access
 * rule, so they can only narrow what the caller already sees, and the options
 * offered are built from the caller's own rows.
 */
export function canFilterOpportunities(ctx: AccessContext): boolean {
  return canViewOpportunities(ctx);
}

export interface ViewFilters {
  geo?: string;
  market?: string;
  division?: string;
}

export interface LabelledRow extends OpportunityRow {
  geo: string;
  market: string;
}

/**
 * Rows the caller may see, labelled with Geo/Market, optionally narrowed by
 * filters. Filters can only narrow: they are applied AFTER the access rule.
 */
export function rowsForCaller(
  ctx: AccessContext,
  file: OpportunitySummaryFile,
  filters: ViewFilters = {},
): LabelledRow[] {
  const index = getClientGeoMarketIndex();
  const allowed = new Map<string, boolean>();
  const out: LabelledRow[] = [];
  for (const r of file.rows) {
    const gm = index[r.clientId] ?? { geo: "", market: "" };
    let ok = allowed.get(r.clientId);
    if (ok === undefined) {
      ok = canAccessClient(ctx, r.clientId, gm);
      allowed.set(r.clientId, ok);
    }
    if (!ok) continue;
    if (filters.geo && gm.geo !== filters.geo) continue;
    if (filters.market && gm.market !== filters.market) continue;
    // Summaries written before Division existed carry none — treat as blank.
    const division = r.division ?? "";
    if (filters.division && division !== filters.division) continue;
    out.push({ ...r, division, geo: gm.geo, market: gm.market });
  }
  return out;
}

// ── Views ────────────────────────────────────────────────────────────────────

const TYPES: OpportunityType[] = ["essentialManagement", "expertiseConnect", "upgrade"];

export interface OpportunityOverview {
  available: true;
  generatedAt: string;
  window: OpportunitySummaryFile["window"];
  thresholds: OpportunitySummaryFile["thresholds"];
  canFilter: boolean;
  /** Geo → markets present in the caller's own rows, for the filter dropdowns. */
  filterOptions: { geo: string; markets: string[] }[];
  /** Divisions present within the current Geo/Market selection, for the Division dropdown. */
  divisionOptions: string[];
  totals: Record<OpportunityType, { customers: number; products: number }>;
  top5: Record<OpportunityType, { clientId: string; customerName: string; products: number }[]>;
  /** Customers per Geo per type. */
  byGeo: { geo: string; essentialManagement: number; expertiseConnect: number; upgrade: number }[];
  /** Customers qualifying for 2+ types, and for all 3. */
  multiType: { twoOrMore: number; allThree: number };
}

export function buildOverview(
  rows: LabelledRow[],
  file: OpportunitySummaryFile,
  canFilter: boolean,
  optionRows: LabelledRow[],
  /** The caller's rows after Geo/Market but before Division — so the list never offers an empty choice. */
  divisionRows: LabelledRow[],
): OpportunityOverview {
  const totals = {} as OpportunityOverview["totals"];
  const top5 = {} as OpportunityOverview["top5"];
  for (const t of TYPES) {
    const ofType = rows.filter((r) => r.type === t);
    const perCustomer = new Map<
      string,
      { clientId: string; customerName: string; products: number }
    >();
    for (const r of ofType) {
      const c = perCustomer.get(r.clientId) ?? {
        clientId: r.clientId,
        customerName: r.customerName,
        products: 0,
      };
      c.products++;
      perCustomer.set(r.clientId, c);
    }
    totals[t] = { customers: perCustomer.size, products: ofType.length };
    top5[t] = [...perCustomer.values()]
      .sort((a, b) => b.products - a.products || a.customerName.localeCompare(b.customerName))
      .slice(0, 5);
  }

  const geoMap = new Map<string, Record<OpportunityType, Set<string>>>();
  const typesByCustomer = new Map<string, Set<OpportunityType>>();
  for (const r of rows) {
    const g = r.geo || "No Geo";
    if (!geoMap.has(g))
      geoMap.set(g, {
        essentialManagement: new Set(),
        expertiseConnect: new Set(),
        upgrade: new Set(),
      });
    geoMap.get(g)![r.type].add(r.clientId);
    if (!typesByCustomer.has(r.clientId)) typesByCustomer.set(r.clientId, new Set());
    typesByCustomer.get(r.clientId)!.add(r.type);
  }
  const byGeo = [...geoMap.entries()]
    .map(([geo, s]) => ({
      geo,
      essentialManagement: s.essentialManagement.size,
      expertiseConnect: s.expertiseConnect.size,
      upgrade: s.upgrade.size,
    }))
    .sort((a, b) =>
      a.geo === "No Geo" ? 1 : b.geo === "No Geo" ? -1 : a.geo.localeCompare(b.geo),
    );

  const counts = [...typesByCustomer.values()].map((s) => s.size);

  const options = new Map<string, Set<string>>();
  for (const r of optionRows) {
    if (!r.geo) continue;
    if (!options.has(r.geo)) options.set(r.geo, new Set());
    if (r.market) options.get(r.geo)!.add(r.market);
  }

  return {
    available: true,
    generatedAt: file.generatedAt,
    window: file.window,
    thresholds: file.thresholds,
    canFilter,
    filterOptions: [...options.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([geo, m]) => ({ geo, markets: [...m].sort((a, b) => a.localeCompare(b)) })),
    divisionOptions: [...new Set(divisionRows.map((r) => r.division).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b),
    ),
    totals,
    top5,
    byGeo,
    multiType: {
      twoOrMore: counts.filter((n) => n >= 2).length,
      allThree: counts.filter((n) => n === 3).length,
    },
  };
}

/** Distinct opportunity products per customer, across all three types — for the list sort. */
export function opportunityCountsByCustomer(rows: LabelledRow[]): Record<string, number> {
  const products = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!products.has(r.clientId)) products.set(r.clientId, new Set());
    products.get(r.clientId)!.add(r.product);
  }
  return Object.fromEntries([...products.entries()].map(([id, s]) => [id, s.size]));
}

// ── Excel ────────────────────────────────────────────────────────────────────

/**
 * Downloadable reports. "multi" is every opportunity row for customers that
 * qualify for two or more types; "all" is every row of every type.
 */
export type ReportKind = OpportunityType | "multi" | "all";

export const REPORT_KINDS: ReportKind[] = [
  "expertiseConnect",
  "essentialManagement",
  "upgrade",
  "multi",
  "all",
];

const REPORT_TITLES: Record<ReportKind, string> = {
  expertiseConnect: "Expertise Connect",
  essentialManagement: "Essential Management",
  upgrade: "Upgrade (EC & Migration)",
  multi: "Multiple Opportunity Types",
  all: "Full Consolidated Report",
};

const REPORT_FILE_NAMES: Record<ReportKind, string> = {
  expertiseConnect: "Expertise_Connect_Opportunities",
  essentialManagement: "Essential_Management_Opportunities",
  upgrade: "Upgrade_Opportunities",
  multi: "Multiple_Opportunity_Types",
  all: "Consolidated_Opportunity_Report",
};

export const REPORT_NOTE =
  "Reports list customers and products where an opportunity exists. For detailed information, please reach out to the admin of this application.";

function ruleText(t: OpportunityType, file: OpportunitySummaryFile): string {
  const months = file.window?.lookbackMonths ?? OPPORTUNITY_RULES.lookbackMonths;
  switch (t) {
    case "essentialManagement":
      return `Non-EC product with more than ${file.thresholds.essentialManagementSev1Above} Sev1 cases in the last ${months} months of CSP data.`;
    case "expertiseConnect":
      return `Non-EC product with more than ${file.thresholds.expertiseConnectCasesAbove} cases (all severities) in the last ${months} months of CSP data.`;
    case "upgrade":
      return "Non-EC product running a version past or nearing end of support (within 12 months), from the saved Upgrade Opportunities insights.";
  }
}

/** The rows one report contains, from rows already filtered for the caller. */
function rowsForReport(kind: ReportKind, rows: LabelledRow[]): LabelledRow[] {
  if (kind === "all") return rows;
  if (kind !== "multi") return rows.filter((r) => r.type === kind);
  const types = new Map<string, Set<OpportunityType>>();
  for (const r of rows) {
    if (!types.has(r.clientId)) types.set(r.clientId, new Set());
    types.get(r.clientId)!.add(r.type);
  }
  return rows.filter((r) => (types.get(r.clientId)?.size ?? 0) >= 2);
}

/** One report as a sheet: sorted Geo > Market > Division > Customer, with header filters. */
function reportSheet(
  kind: ReportKind,
  rows: LabelledRow[],
  file: OpportunitySummaryFile,
): { sheet: XLSX.WorkSheet; rowCount: number } {
  const typeOrder: Record<OpportunityType, number> = {
    expertiseConnect: 0,
    essentialManagement: 1,
    upgrade: 2,
  };
  // Customers with no Geo/Market in Clarizen sort after everyone else.
  const blankLast = (x: string, y: string) => (!x && y ? 1 : x && !y ? -1 : x.localeCompare(y));
  const sorted = [...rowsForReport(kind, rows)].sort(
    (a, b) =>
      blankLast(a.geo, b.geo) ||
      blankLast(a.market, b.market) ||
      blankLast(a.division, b.division) ||
      a.customerName.localeCompare(b.customerName) ||
      a.product.localeCompare(b.product) ||
      typeOrder[a.type] - typeOrder[b.type],
  );

  const mixed = kind === "all" || kind === "multi";
  const showCases = mixed || kind === "essentialManagement" || kind === "expertiseConnect";
  const showUpgrade = mixed || kind === "upgrade";
  const months = file.window?.lookbackMonths ?? OPPORTUNITY_RULES.lookbackMonths;

  const header = [
    "Geo",
    "Market",
    "Division",
    "Customer Name",
    "Customer ID",
    "Product",
    "Opportunity Type",
    ...(showCases
      ? [`Sev1 Cases (last ${months} months)`, `Total Cases (last ${months} months)`]
      : []),
    ...(showUpgrade
      ? [
          "Support Status",
          "End of Support",
          "Out-of-Support Versions",
          "Supported Versions Also Running",
        ]
      : []),
  ];
  const body = sorted.map((r) => [
    r.geo || "No Geo",
    r.market || "No Market",
    r.division || "No Division",
    r.customerName,
    r.customerId,
    r.product,
    OPPORTUNITY_TYPE_LABELS[r.type],
    ...(showCases
      ? [
          r.type === "upgrade" ? "" : (r.sev1Cases ?? ""),
          r.type === "upgrade" ? "" : (r.totalCases ?? ""),
        ]
      : []),
    ...(showUpgrade
      ? [
          r.supportStatus ?? "",
          r.endOfSupport ?? "",
          (r.outOfSupportVersions ?? []).join(", "),
          (r.supportedVersions ?? []).join(", "),
        ]
      : []),
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  sheet["!cols"] = header.map((h) => ({ wch: Math.max(12, Math.min(40, h.length + 4)) }));
  // Filter dropdowns on every header, so the file can be sliced in Excel too.
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: body.length, c: header.length - 1 },
    }),
  };
  return { sheet, rowCount: body.length };
}

/**
 * The Excel file for one or more reports, from rows already filtered for the
 * caller. One report → one "Opportunities" sheet; several → one sheet each.
 * Either way an "About" sheet records rules, filters and the note.
 */
export function buildReportWorkbook(
  kinds: ReportKind[],
  rows: LabelledRow[],
  file: OpportunitySummaryFile,
  /** Filters the page applied, recorded on the About sheet. */
  filters: ViewFilters = {},
): { buffer: Buffer; fileName: string; rowCount: number } {
  const wb = XLSX.utils.book_new();
  const counts: [string, number][] = [];
  for (const kind of kinds) {
    const { sheet, rowCount } = reportSheet(kind, rows, file);
    // Excel sheet names: 31 characters max (titles fit; none uses : \ / ? * [ ]).
    const name = kinds.length === 1 ? "Opportunities" : REPORT_TITLES[kind].slice(0, 31);
    XLSX.utils.book_append_sheet(wb, sheet, name);
    counts.push([REPORT_TITLES[kind], rowCount]);
  }

  const rules = TYPES.filter(
    (t) => kinds.includes("all") || kinds.includes("multi") || kinds.includes(t),
  );
  const about = XLSX.utils.aoa_to_sheet([
    ["Report", kinds.map((k) => REPORT_TITLES[k]).join(", ")],
    ["Generated", file.generatedAt.slice(0, 10)],
    ["Case window", file.window ? `${file.window.start} to ${file.window.end}` : ""],
    ...counts.map(([title, n]) => [`Rows — ${title}`, n]),
    [
      "Filters applied",
      [
        filters.geo && `Geo: ${filters.geo}`,
        filters.market && `Market: ${filters.market}`,
        filters.division && `Division: ${filters.division}`,
      ]
        .filter(Boolean)
        .join(" · ") || "None — everything you can access",
    ],
    [],
    ...rules.map((t) => [OPPORTUNITY_TYPE_LABELS[t], ruleText(t, file)]),
    ...(kinds.includes("multi")
      ? [
          [
            REPORT_TITLES.multi,
            "Every opportunity row for customers that qualify for two or more opportunity types.",
          ],
        ]
      : []),
    [],
    ["Note", REPORT_NOTE],
  ]);
  about["!cols"] = [{ wch: 36 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, about, "About");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const base = kinds.length === 1 ? REPORT_FILE_NAMES[kinds[0]] : "Opportunity_Reports_Combined";
  return {
    buffer,
    fileName: `${base}_${file.generatedAt.slice(0, 10)}.xlsx`,
    rowCount: counts.reduce((n, [, c]) => n + c, 0),
  };
}
