import type { Client, KPIScoreEntry } from "@/data/clients";
import { KPI_LIBRARY, type KPIDefinition } from "@/data/kpiLibrary";
import { ALL_GEOS, GEO_FILTER_OPTIONS, normalizeGeo, type Geo, type GeoFilter } from "@/constants/geos";
import { ALL_MARKETS, type MarketFilter } from "@/constants/markets";
import { getClientFinancialMetrics } from "@/lib/clientFinancials";

export { ALL_GEOS, type GeoFilter, ALL_MARKETS, type MarketFilter };

export interface TierBreakdown {
  Free: number;
  Bronze: number;
  Silver: number;
  Gold: number;
}

export interface GlobalKpiAverage {
  kpiId: string;
  label: string;
  unit: string;
  average: number;
  clientCount: number;
  isPercentage: boolean;
}

export interface KpiClientDetail {
  clientId: string;
  clientName: string;
  geo: string;
  market: string;
  tier: Client["tier"];
  latestValue: number;
  previousValue: number | null;
  change: number | null;
  checkpointDate: string;
  notes?: string;
}

export interface PortfolioKpiTrendPoint {
  date: string;
  average: number;
  clientCount: number;
  previousAverage: number | null;
  changeFromPrevious: number | null;
}

export interface GlobalPortfolioMetrics {
  totalCustomers: number;
  totalCurrentYearRevenue: number;
  totalAcv: number;
  totalTcv: number;
  portfolioNrrPercent: number;
  totalArr: number;
  totalProducts: number;
  uniqueProducts: number;
  tierBreakdown: TierBreakdown;
}

export interface GlobalViewSnapshot {
  geoFilter: GeoFilter;
  clientsInScope: Client[];
  geosCovered: number;
  portfolioMetrics: GlobalPortfolioMetrics;
  averageKpis: GlobalKpiAverage[];
  geos: Geo[];
}

export { formatMoneyCompact, formatNrrPercent, parseMoneyValue } from "@/lib/moneyFormat";

function aggregatePortfolioMetrics(clients: Client[]): GlobalPortfolioMetrics {
  const tierBreakdown = emptyTiers();
  let totalProducts = 0;
  const productNames = new Set<string>();
  let totalCurrentYearRevenue = 0;
  let totalAcv = 0;
  let totalTcv = 0;
  let totalArr = 0;
  let nrrWeightedSum = 0;

  for (const client of clients) {
    const fin = getClientFinancialMetrics(client);
    tierBreakdown[client.tier] += 1;
    totalProducts += client.productPortfolio.length;
    client.productPortfolio.forEach((p) => productNames.add(p.productName));
    client.products.forEach((p) => productNames.add(p));
    totalCurrentYearRevenue += fin.currentYearRevenue;
    totalAcv += fin.acv;
    totalTcv += fin.tcv;
    totalArr += fin.arr;
    nrrWeightedSum += fin.arr * fin.nrrPercent;
  }

  const portfolioNrrPercent =
    totalArr > 0 ? Math.round((nrrWeightedSum / totalArr) * 10) / 10 : 0;

  return {
    totalCustomers: clients.length,
    totalCurrentYearRevenue,
    totalAcv,
    totalTcv,
    portfolioNrrPercent,
    totalArr,
    totalProducts,
    uniqueProducts: productNames.size,
    tierBreakdown,
  };
}

function isPercentageKpi(def: KPIDefinition): boolean {
  return def.unit === "%" || def.unit === "/100";
}

export function parseCheckpointDate(dateStr: string): number {
  const parts = dateStr.split(/[/-]/).map((p) => parseInt(p, 10));
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
  }
  const dt = new Date(dateStr);
  return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
}

function roundKpi(value: number, isPercentage: boolean): number {
  const rounded = Math.round(value * 10) / 10;
  if (!isPercentage) return rounded;
  return Math.min(100, Math.max(0, rounded));
}

function getKpiHistory(client: Client, kpiId: string): KPIScoreEntry[] {
  const config = client.kpiConfig.find((c) => c.kpiId === kpiId);
  if (!config?.history.length) return [];
  return [...config.history].sort(
    (a, b) => parseCheckpointDate(a.date) - parseCheckpointDate(b.date)
  );
}

function latestKpiValue(client: Client, kpiId: string): number | null {
  const history = getKpiHistory(client, kpiId);
  if (!history.length) return null;
  return history[history.length - 1]?.value ?? null;
}

function clientGeo(client: Client): Geo | null {
  return normalizeGeo(client.geo);
}

function filterClients(
  clients: Client[],
  geoFilter: GeoFilter,
  marketFilter: MarketFilter = ALL_MARKETS
): Client[] {
  let filtered = clients;
  
  // Apply geo filter
  if (geoFilter !== ALL_GEOS) {
    filtered = filtered.filter((c) => clientGeo(c) === geoFilter);
  }
  
  // Apply market filter
  if (marketFilter !== ALL_MARKETS) {
    filtered = filtered.filter((c) => c.market === marketFilter);
  }
  
  return filtered;
}

function emptyTiers(): TierBreakdown {
  return { Free: 0, Bronze: 0, Silver: 0, Gold: 0 };
}

// The 14 configurable KPI IDs in library definition order (rows 1–14).
// These are the only KPIs eligible for Global View aggregation.
const CONFIGURABLE_KPI_IDS: readonly string[] = [
  "product_adoption",
  "value_realization",
  "engagement",
  "risk_awareness",
  "time_to_value",
  "platform_reliability_confidence",
  "use_case_maturity",
  "onboarding",
  "change_readiness",
  "ai_maturity",
  "service_utilization",
  "sla_compliance",
  "feature_adoption",
  "csat",
];

export function buildGlobalViewSnapshot(
  clients: Client[],
  geoFilter: GeoFilter = ALL_GEOS,
  marketFilter: MarketFilter = ALL_MARKETS
): GlobalViewSnapshot {
  const scoped = filterClients(clients, geoFilter, marketFilter);
  const geosPresent = new Set<Geo>();
  for (const client of clients) {
    const geo = clientGeo(client);
    if (geo) geosPresent.add(geo);
  }

  const portfolioMetrics = aggregatePortfolioMetrics(scoped);

  // Build averages for all 14 configurable KPIs.
  // Only include a KPI card if at least one client in scope has a recorded value.
  const averageKpis: GlobalKpiAverage[] = CONFIGURABLE_KPI_IDS
    .map((kpiId) => {
      const def = KPI_LIBRARY.find((k) => k.kpiId === kpiId);
      if (!def) return null;

      const values: number[] = [];
      for (const client of scoped) {
        const v = latestKpiValue(client, kpiId);
        if (v != null && Number.isFinite(v)) values.push(v);
      }

      // Skip KPIs with no data across all clients
      if (!values.length) return null;

      const isPercentage = isPercentageKpi(def);
      let average = values.reduce((sum, v) => sum + v, 0) / values.length;
      if (isPercentage) average = Math.min(100, Math.max(0, average));

      return {
        kpiId,
        label: def.label,
        unit: def.unit,
        average: Math.round(average * 10) / 10,
        clientCount: values.length,
        isPercentage,
      };
    })
    .filter((row): row is GlobalKpiAverage => row != null);
  // Order is preserved from CONFIGURABLE_KPI_IDS (library definition order)

  const geosInScope =
    geoFilter === ALL_GEOS
      ? [...geosPresent].sort()
      : [geoFilter];

  return {
    geoFilter,
    clientsInScope: scoped,
    geosCovered: geosInScope.length,
    portfolioMetrics,
    averageKpis,
    geos: [...GEO_FILTER_OPTIONS],
  };
}

export function buildKpiClientBreakdown(
  clients: Client[],
  kpiId: string,
  geoFilter: GeoFilter = ALL_GEOS,
  marketFilter: MarketFilter = ALL_MARKETS
): KpiClientDetail[] {
  const def = KPI_LIBRARY.find((k) => k.kpiId === kpiId);
  if (!def) return [];

  const isPercentage = isPercentageKpi(def);
  const scoped = filterClients(clients, geoFilter, marketFilter);

  // All 14 configurable KPIs have recorded history — read from kpiConfig
  const results: KpiClientDetail[] = [];
  for (const client of scoped) {
    const history = getKpiHistory(client, kpiId);
    if (!history.length) continue;

    const latest = history[history.length - 1];
    const previous = history.length >= 2 ? history[history.length - 2] : null;
    const change =
      previous != null ? roundKpi(latest.value - previous.value, isPercentage) : null;

    results.push({
      clientId: client.clientId,
      clientName: client.clientName,
      geo: client.geo,
      market: client.market,
      tier: client.tier,
      latestValue: roundKpi(latest.value, isPercentage),
      previousValue:
        previous != null ? roundKpi(previous.value, isPercentage) : null,
      change,
      checkpointDate: latest.date,
      notes: latest.notes,
    });
  }
  return results.sort((a, b) => a.clientName.localeCompare(b.clientName));
}

export function buildPortfolioKpiTrend(
  clients: Client[],
  kpiId: string,
  geoFilter: GeoFilter = ALL_GEOS,
  marketFilter: MarketFilter = ALL_MARKETS
): PortfolioKpiTrendPoint[] {
  const def = KPI_LIBRARY.find((k) => k.kpiId === kpiId);
  if (!def) return [];

  const isPercentage = isPercentageKpi(def);
  const scoped = filterClients(clients, geoFilter, marketFilter);
  const valuesByDate = new Map<string, number[]>();

  for (const client of scoped) {
    for (const entry of getKpiHistory(client, kpiId)) {
      const bucket = valuesByDate.get(entry.date) ?? [];
      bucket.push(entry.value);
      valuesByDate.set(entry.date, bucket);
    }
  }

  const points = [...valuesByDate.entries()]
    .map(([date, values]) => {
      const average =
        values.reduce((sum, v) => sum + v, 0) / values.length;
      return {
        date,
        average: roundKpi(average, isPercentage),
        clientCount: values.length,
        sortKey: parseCheckpointDate(date),
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey);

  return points.map((point, index) => {
    const previousAverage = index > 0 ? points[index - 1].average : null;
    const changeFromPrevious =
      previousAverage != null
        ? roundKpi(point.average - previousAverage, isPercentage)
        : null;
    return {
      date: point.date,
      average: point.average,
      clientCount: point.clientCount,
      previousAverage,
      changeFromPrevious,
    };
  });
}
