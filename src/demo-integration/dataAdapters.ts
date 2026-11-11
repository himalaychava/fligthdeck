import type {
  AccountTeamMember,
  Client,
  ClientKPIConfig,
  ProductHealth,
  ProductLiveIntegration,
  Risk,
} from "@/data/clients";
import { riskLevelFromScore } from "@/lib/riskLevel";
import {
  buildKpiConfigFromSelection,
  getMandatoryKpiIds,
  normalizeClientKpiConfig,
} from "@/lib/kpiTierRules";
import { validateClientGeoMarket } from "@/constants/markets";
import { TIER_FEATURE_ENABLED } from "@/constants/tierFeature";

/*
 * ─── WHY THIS MATTERS (for management demo) ───────────────────────────────
 * The UI components have zero knowledge of where data comes from.
 * They only know the normalised shape defined in this adapter.
 * To integrate a new data source (SAP, Salesforce, IBM OpenPages, etc.):
 *   1. Add one case to normaliseClientData()
 *   2. Write one adaptFrom[Source]() function
 *   3. Change DEMO_SOURCE constant in useDemoData.ts
 * That's it. No component changes. No page changes. No context changes.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type DemoSourceType = "excel" | "json" | "api";

export const EXCEL_SHEET_NAMES = [
  "ClientOverview",
  "KPILibrary",
  "KeyPoints",
  "Risks",
  "CommercialSnapshot",
  "ProductPortfolio",
  "ProductIntegrationMetrics",
  "ProductHealthCheck",
  "ProductCaseVolume",
  "ProductRiskIntelligence",
  "ProductStability",
  "ProductPerformance",
  "ProductRecommendations",
  "AccountTeam",
  "KPIScores",
  "KPIClientConfig",
  "BronzeKPIScores",
  "SilverKPIScores",
  "GoldKPIScores",
  "GeoMarkets",
  /**
   * Per-product Product Adoption scores.
   * Columns: client_id, product_id, score_value (0–10), checkpoint_date,
   *          notes, updated_at, updated_by.
   */
  "ProductAdoptionScores",
] as const;

export type ExcelSheetName = (typeof EXCEL_SHEET_NAMES)[number];

export type ExcelRawPayload = Record<ExcelSheetName, Record<string, unknown>[]>;

const SEVERITY_MAP: Record<string, Risk["severity"]> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
  Low: "Low",
  Medium: "Medium",
  High: "High",
  Critical: "Critical",
};

const STATUS_MAP: Record<string, ProductHealth["status"]> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  WATCH: "Watch",
  CRITICAL: "Critical",
  PILOT: "Pilot",
  Excellent: "Excellent",
  Good: "Good",
  Watch: "Watch",
  Critical: "Critical",
  Pilot: "Pilot",
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise a KPI score value to the 0–10 scale.
 * Legacy Excel data may still have values in the 0–100 range.
 * Guard: if the stored value exceeds 10 it is assumed to be on the old
 * 0–100 scale and is divided by 10 to convert it.
 */
function normaliseKpiScore(v: unknown): number {
  const n = num(v) ?? 0;
  return n > 10 ? Math.round((n / 10) * 10) / 10 : n;
}

function bool(v: unknown): boolean {
  const s = str(v).toUpperCase();
  return s === "Y" || s === "YES" || s === "TRUE" || s === "1";
}

function formatMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Excel's day-zero: 1899-12-30, accounting for its fabricated 1900 leap day. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function parseDate(value: string): Date | null {
  if (!value) return null;

  // A workbook date cell that SheetJS reads as a raw serial (not text, not
  // auto-converted to a JS Date) comes through here as a bare digit string,
  // e.g. "46297". Without this check that fell through to `new Date("46297")`,
  // which V8 parses as the literal YEAR 46297 rather than a serial day count
  // — silently turning a real, often near-term date (serial 46297 = Oct 2,
  // 2026) into "Jan 1, 46297" and hiding it from every date-range
  // calculation (renewals-due, contract period, days-to-renewal, …).
  if (/^\d+(\.\d+)?$/.test(value)) {
    const serial = Number(value);
    if (serial > 20000 && serial < 80000) {
      const dt = new Date(EXCEL_EPOCH_MS + serial * 86400000);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
  }

  const parts = value.split(/[/-]/).map((p) => parseInt(p, 10));
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDisplayDate(dt: Date): string {
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function renewalConfidenceLabel(score: number): string {
  if (score >= 80) return `${score}% — Strong`;
  if (score >= 65) return `${score}% — Good`;
  if (score >= 50) return `${score}% — Moderate`;
  return `${score}% — At Risk`;
}

function productKey(clientId: string, productId: string): string {
  return `${clientId}::${productId}`;
}

function groupBy(rows: Record<string, unknown>[], key: string): Record<string, Record<string, unknown>[]> {
  return rows.reduce<Record<string, Record<string, unknown>[]>>((acc, row) => {
    const id = str(row[key]);
    if (!acc[id]) acc[id] = [];
    acc[id].push(row);
    return acc;
  }, {});
}

function groupByProduct(
  rows: Record<string, unknown>[]
): Record<string, Record<string, unknown>[]> {
  return rows.reduce<Record<string, Record<string, unknown>[]>>((acc, row) => {
    const key = productKey(str(row.client_id), str(row.product_id));
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

/** One row per client_id + product_id (used for ProductIntegrationMetrics). */
function indexByProduct(
  rows: Record<string, unknown>[]
): Record<string, Record<string, unknown>> {
  return rows.reduce<Record<string, Record<string, unknown>>>((acc, row) => {
    const key = productKey(str(row.client_id), str(row.product_id));
    if (!acc[key]) acc[key] = row;
    return acc;
  }, {});
}

function sortByOrder(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort(
    (a, b) => (num(a.sort_order) ?? 0) - (num(b.sort_order) ?? 0)
  );
}

function buildLiveIntegration(
  clientId: string,
  productId: string,
  metricsByProduct: Record<string, Record<string, unknown>>,
  healthCheckByProduct: Record<string, Record<string, unknown>>,
  caseVolumeByProduct: Record<string, Record<string, unknown>[]>,
  risksByProduct: Record<string, Record<string, unknown>[]>,
  stabilityByProduct: Record<string, Record<string, unknown>[]>,
  performanceByProduct: Record<string, Record<string, unknown>[]>,
  recommendationsByProduct: Record<string, Record<string, unknown>[]>
): ProductLiveIntegration {
  const key = productKey(clientId, productId);
  const metrics = metricsByProduct[key];
  const healthRow = healthCheckByProduct[key];
  const caseRows = sortByOrder(caseVolumeByProduct[key] ?? []);
  const riskRows = sortByOrder(risksByProduct[key] ?? []);
  const stabilityRows = sortByOrder(stabilityByProduct[key] ?? []);
  const performanceRows = sortByOrder(performanceByProduct[key] ?? []);
  const recommendationRows = sortByOrder(recommendationsByProduct[key] ?? []);

  const healthRequired = healthRow ? bool(healthRow.health_check_required) : false;

  return {
    healthPercent: metrics ? num(metrics.health_percent) : null,
    checksFinished: metrics ? num(metrics.checks_finished) : null,
    dataThroughput: metrics ? str(metrics.data_throughput) || null : null,
    totalTickets: metrics ? num(metrics.total_tickets) : null,
    escalations: metrics ? num(metrics.escalations) : null,
    avgResolution: metrics ? str(metrics.avg_resolution) || null : null,
    healthCheck: {
      required: healthRequired,
      finishedCount: healthRow ? num(healthRow.checks_finished) ?? num(metrics?.checks_finished) : null,
      lastCheck: healthRow ? str(healthRow.last_check) || null : null,
      nextCheck: healthRow ? str(healthRow.next_check) || null : null,
    },
    caseVolume: caseRows.map((row) => ({
      month: str(row.month),
      cases: num(row.cases) ?? 0,
    })),
    riskIntelligence: riskRows.map((row) => {
      const score = num(row.risk_score) ?? 0;
      return {
        level: riskLevelFromScore(score),
        title: str(row.title),
        description: str(row.description),
        score,
      };
    }),
    stability: stabilityRows.map((row) => ({
      metric: str(row.metric),
      value: str(row.value),
      status: (str(row.status).toUpperCase() || "GOOD") as "EXCELLENT" | "GOOD" | "WATCH" | "CRITICAL",
      trend: (str(row.trend).toUpperCase() || "STABLE") as "UP" | "DOWN" | "STABLE",
      description: str(row.description),
    })),
    performance: performanceRows.map((row) => ({
      metric: str(row.metric),
      value: str(row.value),
      target: str(row.target),
      status: (str(row.status).toUpperCase() || "GOOD") as "EXCELLENT" | "GOOD" | "WATCH" | "CRITICAL",
      trend: (str(row.trend).toUpperCase() || "STABLE") as "UP" | "DOWN" | "STABLE",
      description: str(row.description),
    })),
    recommendations: recommendationRows.map((row) => ({
      priority: (str(row.priority).toUpperCase() || "MEDIUM") as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      title: str(row.title),
      description: str(row.description),
      impact: str(row.impact),
      effort: str(row.effort),
      timeline: str(row.timeline),
    })),
  };
}

function sheetRows(sheets: ExcelRawPayload, name: ExcelSheetName): Record<string, unknown>[] {
  const rows = sheets[name];
  return Array.isArray(rows) ? rows : [];
}

function applyKpiClientConfigSheet(
  client: Pick<Client, "clientId" | "tier" | "kpiConfig">
): ClientKPIConfig[] {
  return normalizeClientKpiConfig(client);
}

function resolveKpiConfigForClient(
  clientRecord: Pick<Client, "clientId" | "tier" | "kpiConfig">,
  configRows: Record<string, unknown>[]
): ClientKPIConfig[] {
  const clientRows = configRows.filter(
    (row) =>
      str(row.client_id) === clientRecord.clientId &&
      str(row.is_active).toUpperCase() !== "N"
  );
  if (!clientRows.length) {
    return applyKpiClientConfigSheet(clientRecord);
  }
  const mandatory = new Set(getMandatoryKpiIds(clientRecord.tier));
  const activeIds = clientRows.map((row) => str(row.kpi_id)).filter(Boolean);
  const rotational = activeIds.filter((id) => !mandatory.has(id));
  return buildKpiConfigFromSelection(
    clientRecord.tier,
    rotational,
    clientRecord.kpiConfig ?? []
  );
}

/**
 * Computes client-level Product Adoption history as the average of per-product adoption histories.
 */
function computeClientProductAdoptionHistory(productPortfolio: ProductHealth[]): { date: string; value: number; notes?: string; recordedBy?: string }[] {
  // Get the latest score from each product
  const latestScores: { value: number; date: string; notes?: string; recordedBy?: string; productName?: string }[] = [];
  
  productPortfolio.forEach((p) => {
    const pHistory = p.adoptionKpiConfig?.history ?? [];
    if (pHistory.length > 0) {
      // Most recent checkpoint for this product.
      //
      // Ties matter: re-scoring a product on the same day is normal, and every
      // checkpoint that day carries the identical date. Sorting and taking the
      // first keeps whichever the sort happened to leave in front — in practice
      // the OLDEST, so a correction silently did nothing. History preserves the
      // order scores were written, so `>=` deliberately lets a later entry win
      // a tie and the newest score of the day is the one that counts.
      const latest = pHistory.reduce((best, cur) =>
        (parseDate(cur.date)?.getTime() ?? 0) >= (parseDate(best.date)?.getTime() ?? 0)
          ? cur
          : best,
      );
      latestScores.push({
        value: latest.value,
        date: latest.date,
        notes: latest.notes,
        recordedBy: latest.recordedBy,
        productName: p.productName,
      });
    }
  });

  if (latestScores.length === 0) return [];

  // Debug logging
  console.log('🔍 Product Adoption Calculation:', {
    totalProducts: productPortfolio.length,
    productsWithScores: latestScores.length,
    allProducts: productPortfolio.map(p => ({
      name: p.productName,
      hasHistory: (p.adoptionKpiConfig?.history?.length ?? 0) > 0,
      historyCount: p.adoptionKpiConfig?.history?.length ?? 0
    })),
    latestScores: latestScores.map(s => ({
      product: s.productName,
      value: s.value,
      date: s.date
    }))
  });

  // Find the most recent date across all products
  const mostRecentDate = latestScores.reduce((latest, score) => {
    const scoreTime = parseDate(score.date)?.getTime() ?? 0;
    const latestTime = parseDate(latest)?.getTime() ?? 0;
    return scoreTime > latestTime ? score.date : latest;
  }, latestScores[0].date);

  // Calculate average of all latest scores
  const avg = latestScores.reduce((sum, score) => sum + score.value, 0) / latestScores.length;

  console.log('📊 Calculated Average:', {
    average: avg,
    rounded: Math.round(avg * 10) / 10,
    percentage: Math.round(avg * 10) + '%',
    mostRecentDate
  });

  // Collect notes and recordedBy from scores on the most recent date
  const recentScores = latestScores.filter((s) => s.date === mostRecentDate);
  const notes = recentScores
    .map((s) => s.notes)
    .filter((n): n is string => !!n)
    .join("; ");
  const recordedBySet = new Set(
    recentScores.map((s) => s.recordedBy).filter((r): r is string => !!r)
  );

  // Return a single entry with the most recent date and the average
  return [
    {
      date: mostRecentDate,
      value: Math.round(avg * 10) / 10,
      notes: notes || "Calculated client average from all products",
      recordedBy: recordedBySet.size > 0 ? Array.from(recordedBySet).join(", ") : "System",
    },
  ];
}

function buildClientsFromSheets(sheets: ExcelRawPayload): Client[] {
  const kpiClientConfigRows = sheetRows(sheets, "KPIClientConfig");
  const keyByClient = groupBy(sheetRows(sheets, "KeyPoints"), "client_id");
  const risksByClient = groupBy(sheetRows(sheets, "Risks"), "client_id");
  const commercialByClient = groupBy(sheetRows(sheets, "CommercialSnapshot"), "client_id");
  const productsByClient = groupBy(sheetRows(sheets, "ProductPortfolio"), "client_id");

  // Combine tier-specific KPI scores (values normalised to 0–10 scale)
  const bronzeKpis = sheetRows(sheets, "BronzeKPIScores");
  const silverKpis = sheetRows(sheets, "SilverKPIScores");
  const goldKpis = sheetRows(sheets, "GoldKPIScores");
  const allTierKpis = [...bronzeKpis, ...silverKpis, ...goldKpis];
  const kpisByClient = groupBy(allTierKpis, "client_id");

  // Per-product Product Adoption scores (stored in dedicated sheet)
  const productAdoptionRows = sheetRows(sheets, "ProductAdoptionScores");
  // Index: "clientId::productId" → sorted rows
  const adoptionByClientProduct = groupByProduct(productAdoptionRows);

  // EC products (Clarizen-sourced) have no ProductPortfolio row, so a score
  // recorded against one is never seen by the per-product walk below. Index
  // their ids per client so they can still reach the client-level average.
  const ecAdoptionIdsByClient = productAdoptionRows.reduce<Record<string, Set<string>>>(
    (acc, row) => {
      const pid = str(row.product_id);
      if (!pid.startsWith("ec-")) return acc;
      const cid = str(row.client_id);
      (acc[cid] ??= new Set<string>()).add(pid);
      return acc;
    },
    {},
  );

  /** Sheet rows → adoption history points. Shared so both paths agree. */
  const toAdoptionHistory = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      date: str(r.checkpoint_date || r.date),
      value: normaliseKpiScore(r.score_value ?? r.value),
      notes: str(r.notes) || undefined,
      recordedBy: str(r.updated_by || r.recorded_by) || "Live Data Source",
    }));

  const teamByClient = groupBy(sheetRows(sheets, "AccountTeam"), "client_id");

  const metricsByProduct = indexByProduct(sheetRows(sheets, "ProductIntegrationMetrics"));
  const healthCheckByProduct = Object.fromEntries(
    sheetRows(sheets, "ProductHealthCheck").map((row) => [
      productKey(str(row.client_id), str(row.product_id)),
      row,
    ])
  );
  const caseVolumeByProduct = groupByProduct(sheetRows(sheets, "ProductCaseVolume"));
  const riskIntelligenceByProduct = groupByProduct(sheetRows(sheets, "ProductRiskIntelligence"));
  const stabilityByProduct = groupByProduct(sheetRows(sheets, "ProductStability"));
  const performanceByProduct = groupByProduct(sheetRows(sheets, "ProductPerformance"));
  const recommendationsByProduct = groupByProduct(sheetRows(sheets, "ProductRecommendations"));

  return sheetRows(sheets, "ClientOverview").map((row) => {
    const clientId = str(row.client_id);
    const renewalDt = parseDate(str(row.renewal_date));
    const startDt = parseDate(str(row.contract_start));
    const endDt = parseDate(str(row.contract_end));
    const renewalDate = renewalDt ? formatDisplayDate(renewalDt) : str(row.renewal_date);
    const daysToRenewal = renewalDt ? daysUntil(renewalDt) : 0;
    const contractPeriod =
      startDt && endDt
        ? `${formatDisplayDate(startDt)} — ${formatDisplayDate(endDt)}`
        : `${str(row.contract_start)} — ${str(row.contract_end)}`;

    const accountHealth = num(row.account_health) ?? 0;
    const expansionPotential = num(row.expansion_potential) ?? 0;
    const valueVisibility = num(row.value_visibility) ?? 0;

    const keyPoints = (keyByClient[clientId] ?? []).map((p) => str(p.point)).filter(Boolean);
    const risks: Risk[] = (risksByClient[clientId] ?? []).map((r) => ({
      severity: SEVERITY_MAP[str(r.severity).toUpperCase()] ?? "Low",
      description: str(r.description),
      mitigation: str(r.mitigation),
      likelihood: num(r.likelihood_pct) ?? 0,
      impact: num(r.impact_pct) ?? 0,
      riskScore: num(r.risk_score) ?? 0,
    }));

    const productRows = sortByOrder(productsByClient[clientId] ?? []);
    const productPortfolio: ProductHealth[] = productRows.map((p) => {
      const pid = str(p.product_id);
      const adoptionKey = productKey(clientId, pid);
      const adoptionRows = sortByOrder(adoptionByClientProduct[adoptionKey] ?? []);
      // Build per-product adoption KPI config from ProductAdoptionScores sheet
      // Handle both old format (date/value/recorded_by) and new format (checkpoint_date/score_value/updated_by)
      const adoptionKpiConfig =
        adoptionRows.length > 0
          ? { kpiId: "product_adoption", history: toAdoptionHistory(adoptionRows) }
          : undefined;
      return {
        productId: pid,
        productName: str(p.product_name),
        status: STATUS_MAP[str(p.status).toUpperCase()] ?? "Good",
        description: str(p.description),
        adoptionKpiConfig,
        liveIntegration: buildLiveIntegration(
          clientId,
          pid,
          metricsByProduct,
          healthCheckByProduct,
          caseVolumeByProduct,
          riskIntelligenceByProduct,
          stabilityByProduct,
          performanceByProduct,
          recommendationsByProduct
        ),
      };
    });

    const kpiRows = kpisByClient[clientId] ?? [];
    const kpiGrouped = new Map<string, typeof kpiRows>();
    for (const row of kpiRows) {
      const kpiId = str(row.kpi_id);
      if (!kpiId) continue;
      const bucket = kpiGrouped.get(kpiId) ?? [];
      bucket.push(row);
      kpiGrouped.set(kpiId, bucket);
    }
    const kpiConfig = [...kpiGrouped.entries()].map(([kpiId, rows]) => ({
      kpiId,
      history: rows
        .map((k) => ({
          date: str(k.checkpoint_date),
          // Normalise legacy 0–100 scores to 0–10
          value: normaliseKpiScore(k.score_value),
          notes: str(k.notes) || undefined,
          recordedBy: "Live Data Source",
          sortKey: parseDate(str(k.checkpoint_date))?.getTime() ?? 0,
        }))
        .sort((a, b) => a.sortKey - b.sortKey)
        .map(({ date, value, notes, recordedBy }) => ({
          date,
          value,
          notes: notes || undefined,
          recordedBy,
        })),
    }));

    const commercialRow = commercialByClient[clientId]?.[0];
    const contractValueNum = num(row.contract_value) ?? 0;
    const arrValue = commercialRow ? num(commercialRow.arr) ?? 0 : num(row.arr) ?? 0;
    const acvValue = num(row.acv) ?? arrValue;
    const tcvValue = num(row.tcv) ?? contractValueNum;
    const currentYearRevenue = num(row.current_year_revenue) ?? arrValue;
    const nrrPercent = num(row.nrr_percent);
    const commercialRenewal = commercialRow ? str(commercialRow.renewal_date) : str(row.renewal_date);
    const commercialRenewalDt = parseDate(commercialRenewal);
    const commercialRenewalDisplay = commercialRenewalDt
      ? formatDisplayDate(commercialRenewalDt)
      : commercialRenewal;
    const commercialDays =
      commercialRow && commercialRow.days_to_renewal != null && commercialRow.days_to_renewal !== ""
        ? num(commercialRow.days_to_renewal) ?? daysToRenewal
        : commercialRenewalDt
          ? daysUntil(commercialRenewalDt)
          : daysToRenewal;
    // Get renewal_confidence from CommercialSnapshot sheet (renewal_confidence_score column)
    const renewalConfidence = commercialRow
      ? num(commercialRow.renewal_confidence_score) ?? 0
      : 0;
    const renewalConfScore = renewalConfidence;

    const accountTeam: AccountTeamMember[] = sortByOrder(teamByClient[clientId] ?? []).map((m) => ({
      name: str(m.name),
      role: str(m.role),
      assignment: str(m.assignment),
      email: str(m.email),
      phone: str(m.phone),
    }));

    const geo = str(row.geo || row.region);
    const market = str(row.market);
    
    // Validate geo/market combination
    const validation = validateClientGeoMarket(geo, market);
    if (!validation.valid) {
      console.warn(`⚠️ Client ${str(row.client_name)} (${clientId}): ${validation.error}`);
    }
    
    const clientRecord = {
      clientId,
      clientName: str(row.client_name),
      icnNumber: str(row.icn_number),
      cmrNumber: str(row.cmr_number),
      geo,
      market,
      // Tier is switched off for now — every client resolves to Bronze here,
      // the single point every KPI-catalog function and every tier badge reads
      // from. The stored value in the workbook is untouched; see tierFeature.ts.
      tier: (TIER_FEATURE_ENABLED ? str(row.tier) : "Bronze") as Client["tier"],
      contractValue: formatMoney(num(row.contract_value) ?? 0),
      contractPeriod,
      renewalDate,
      daysToRenewal,
      products: str(row.products)
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
      scores: {
        accountHealth,
        renewalConfidence,
        expansionPotential,
        valueVisibility,
      },
      executiveSummary: {
        summary: str(row.executive_summary),
        keyPoints,
      },
      commercialSnapshot: {
        arr: formatPercentage(arrValue),
        renewalDate: commercialRenewalDisplay,
        daysToRenewal: commercialDays,
        renewalConfidence: commercialRow?.renewal_confidence_label
          ? str(commercialRow.renewal_confidence_label)
          : renewalConfidenceLabel(renewalConfScore),
        expansionPipeline: formatMoney(
          commercialRow ? num(commercialRow.expansion_pipeline) ?? 0 : num(row.expansion_pipeline) ?? 0
        ),
        contractionRisk: commercialRow
          ? str(commercialRow.contraction_risk)
          : str(row.contraction_risk),
      },
      risks,
      productPortfolio,
      kpiConfig,
      healthCheckData: null,
      accountTeam,
      financials: {
        arr: arrValue,
        acv: acvValue,
        tcv: tcvValue,
        currentYearRevenue,
        ...(nrrPercent != null ? { nrrPercent } : {}),
      },
    } satisfies Client;

    const withKpis = {
      ...clientRecord,
      kpiConfig: resolveKpiConfigForClient(clientRecord, kpiClientConfigRows),
    };

    // Products that contribute to the client-level Product Adoption average.
    //
    // A sample client's products all come from ProductPortfolio. A real client
    // has none there — its products come from Clarizen — so any adoption score
    // recorded against an EC product is folded in here, keyed by the same
    // "ec-<slug>" id the Product Overview writes it under. Without this the
    // client-level KPI stays empty no matter how many product scores exist.
    const portfolioProductIds = new Set(productPortfolio.map((p) => p.productId));
    const ecAdoptionProducts: ProductHealth[] = [
      ...(ecAdoptionIdsByClient[clientId] ?? []),
    ]
      .filter((pid) => !portfolioProductIds.has(pid))
      .map((pid) => {
        const rows = sortByOrder(adoptionByClientProduct[productKey(clientId, pid)] ?? []);
        return {
          productId: pid,
          // Only used for the debug log; the average keys off the score alone.
          productName: pid.replace(/^ec-/, "").replace(/-/g, " "),
          status: "Good" as const,
          description: "",
          adoptionKpiConfig: { kpiId: "product_adoption", history: toAdoptionHistory(rows) },
        };
      });

    // Calculate Product Adoption average history dynamically
    const calculatedProductAdoptionHistory = computeClientProductAdoptionHistory([
      ...productPortfolio,
      ...ecAdoptionProducts,
    ]);
    const finalKpiConfig = withKpis.kpiConfig.map(cfg => {
      if (cfg.kpiId === "product_adoption") {
        return {
          ...cfg,
          history: calculatedProductAdoptionHistory
        };
      }
      return cfg;
    });
    if (!finalKpiConfig.some(cfg => cfg.kpiId === "product_adoption")) {
      finalKpiConfig.push({
        kpiId: "product_adoption",
        history: calculatedProductAdoptionHistory
      });
    }
    withKpis.kpiConfig = finalKpiConfig;

    return withKpis;
  });
}

function adaptFromExcel(rawData: ExcelRawPayload): Client[] {
  return buildClientsFromSheets(rawData);
}

function adaptFromJson(rawData: ExcelRawPayload): Client[] {
  return buildClientsFromSheets(rawData);
}

function emptySheets(): ExcelRawPayload {
  return EXCEL_SHEET_NAMES.reduce((acc, name) => {
    acc[name] = [];
    return acc;
  }, {} as ExcelRawPayload);
}

function adaptFromApi(rawData: unknown): Client[] {
  if (Array.isArray(rawData)) {
    return rawData as Client[];
  }
  if (rawData && typeof rawData === "object" && "ClientOverview" in rawData) {
    return adaptFromJson(rawData as ExcelRawPayload);
  }
  return [];
}

export const normaliseClientData = (rawData: unknown, source: DemoSourceType): Client[] => {
  switch (source) {
    case "excel":
      return adaptFromExcel(rawData as ExcelRawPayload);
    case "json":
      return adaptFromJson(rawData as ExcelRawPayload);
    case "api":
      return adaptFromApi(rawData);
    default:
      return Array.isArray(rawData) ? (rawData as Client[]) : [];
  }
};

export function filterDemoClientForViewMode(
  client: Client,
  viewMode: "internal" | "external" | "demo"
): Client {
  if (viewMode !== "external") return client;
  return {
    ...client,
    commercialSnapshot: {
      ...client.commercialSnapshot,
      contractionRisk: "",
      expansionPipeline: "",
    },
    risks: [],
  };
}

export { emptySheets };
