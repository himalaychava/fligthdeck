import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectItem,
  Tile,
  ClickableTile,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Tooltip,
} from "@carbon/react";
import { Information } from "@carbon/icons-react";
import type { Client } from "@/data/clients";
import { TierTag } from "@/components/shared/TierTag";
import { TIER_FEATURE_ENABLED } from "@/constants/tierFeature";
import { ALL_GEOS, type GeoFilter } from "@/constants/geos";
import { ALL_MARKETS, type MarketFilter } from "@/constants/markets";
import { useGeoMarketTree } from "@/components/admin/GeoMarketSelect";
import { GlobalKpiDetailModal } from "@/components/global/GlobalKpiDetailModal";
import { GlobalMetricsGrid } from "@/components/global/GlobalMetricsGrid";
import { buildGlobalViewSnapshot, type GlobalKpiAverage } from "@/services/globalViewAggregator";
import { getClientFinancialMetrics } from "@/lib/clientFinancials";
import { getKpiDefinition, scoreStatus, kpiValueToPercent } from "@/data/kpiLibrary";

interface GlobalViewDashboardProps {
  clients: Client[];
}

export function GlobalViewDashboard({ clients }: GlobalViewDashboardProps) {
  const [geoFilter, setGeoFilter] = useState<GeoFilter>(ALL_GEOS);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>(ALL_MARKETS);
  const [selectedKpi, setSelectedKpi] = useState<GlobalKpiAverage | null>(null);
  const [clientTableTierFilter, setClientTableTierFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Geographies and markets come from the live Clarizen data, not a hardcoded
  // hierarchy — a new geo or a renamed market appears here on the next upload.
  // The previous fixed list shared no market names with the real data, so the
  // market filter could never match anything.
  const { tree: geoTree } = useGeoMarketTree();

  const availableGeos = useMemo(() => geoTree.map((n) => n.geo), [geoTree]);

  // Cascading: picking a geography narrows the markets to that geography's.
  const availableMarkets = useMemo(() => {
    if (geoFilter === ALL_GEOS) {
      return [...new Set(geoTree.flatMap((n) => n.markets))].sort();
    }
    return geoTree.find((n) => n.geo === geoFilter)?.markets ?? [];
  }, [geoTree, geoFilter]);

  // A market chosen under one geography is meaningless under another, so it is
  // cleared when the geography changes rather than silently filtering to zero.
  useEffect(() => {
    if (marketFilter !== ALL_MARKETS && !availableMarkets.includes(marketFilter)) {
      setMarketFilter(ALL_MARKETS);
    }
  }, [availableMarkets, marketFilter]);

  const snapshot = useMemo(
    () => buildGlobalViewSnapshot(clients, geoFilter, marketFilter),
    [clients, geoFilter, marketFilter],
  );

  // Prepare client table data with filtering
  const clientTableRows = useMemo(() => {
    let filteredClients = snapshot.clientsInScope;

    // Apply tier filter
    if (clientTableTierFilter !== "all") {
      filteredClients = filteredClients.filter((c) => c.tier === clientTableTierFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredClients = filteredClients.filter(
        (c) =>
          c.clientName.toLowerCase().includes(query) ||
          c.geo.toLowerCase().includes(query) ||
          c.tier.toLowerCase().includes(query),
      );
    }

    return filteredClients.map((client) => {
      const financials = getClientFinancialMetrics(client);
      return {
        id: client.clientId,
        clientName: client.clientName,
        geo: client.geo,
        tier: client.tier,
        tcv: financials.tcv,
        arr: financials.arr,
        products: client.productPortfolio.length,
      };
    });
  }, [snapshot.clientsInScope, clientTableTierFilter, searchQuery]);

  const headers = [
    { key: "clientName", header: "Client" },
    { key: "geo", header: "Geo" },
    ...(TIER_FEATURE_ENABLED ? [{ key: "tier", header: "Tier" }] : []),
    { key: "tcv", header: "TCV" },
    { key: "arr", header: "ARR" },
    { key: "products", header: "Products" },
  ];

  // Get unique tiers from clients
  const availableTiers = useMemo(() => {
    const tiers = new Set(snapshot.clientsInScope.map((c) => c.tier));
    return Array.from(tiers).sort();
  }, [snapshot.clientsInScope]);

  return (
    <>
      <Tile style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 400, margin: 0 }}>Key Metrics</h2>
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "0.875rem",
                color: "var(--cds-text-secondary)",
              }}
            >
              Aggregated across {snapshot.portfolioMetrics.totalCustomers} active client
              {snapshot.portfolioMetrics.totalCustomers === 1 ? "" : "s"} in the control plane.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Select
              id="global-geo-filter"
              labelText="Geo"
              value={geoFilter}
              onChange={(e) => {
                setGeoFilter(e.target.value as GeoFilter);
                // Reset market filter when geo changes
                setMarketFilter(ALL_MARKETS);
              }}
              style={{ minWidth: "160px" }}
            >
              <SelectItem value={ALL_GEOS} text="All" />
              {availableGeos.map((geo) => (
                <SelectItem key={geo} value={geo} text={geo} />
              ))}
            </Select>
            <Select
              id="global-market-filter"
              labelText="Market"
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value as MarketFilter)}
              style={{ minWidth: "180px" }}
            >
              <SelectItem value={ALL_MARKETS} text="All" />
              {availableMarkets.map((market) => (
                <SelectItem key={market} value={market} text={market} />
              ))}
            </Select>
          </div>
        </div>
      </Tile>

      <section className="cp-section">
        <h2 className="cp-section-title">Global metrics</h2>
        <GlobalMetricsGrid metrics={snapshot.portfolioMetrics} />
      </section>

      <section className="cp-section">
        <h2 className="cp-section-title">Average KPI scores</h2>
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
          Click a KPI to view client breakdown
          {geoFilter !== ALL_GEOS ? ` for ${geoFilter}` : " across all geos"}. Scores are averaged
          out of 10 and shown as percentages (Client Sentiment shown as points out of 10).
        </p>
        {snapshot.averageKpis.length === 0 ? (
          <Tile style={{ padding: "1rem", color: "var(--cds-text-secondary)" }}>
            No KPI data for this selection.
          </Tile>
        ) : (
          <div className="cp-kpi-grid">
            {snapshot.averageKpis.map((kpi) => {
              const kpiDef = getKpiDefinition(kpi.kpiId);
              const status = kpiDef ? scoreStatus(kpiDef, kpi.average) : null;

              const getStatusTag = () => {
                if (!status || status === "pending") return null;
                const statusConfig = {
                  excellent: { type: "green" as const, label: "EXCELLENT" },
                  good: { type: "blue" as const, label: "GOOD" },
                  watch: { type: "magenta" as const, label: "WATCH" },
                  critical: { type: "red" as const, label: "CRITICAL" },
                };
                const config = statusConfig[status];
                return config ? (
                  <Tag type={config.type} size="sm" style={{ marginTop: "0.5rem" }}>
                    {config.label}
                  </Tag>
                ) : null;
              };

              // CSAT → X.X/10 (points as recorded)
              // All other KPIs → convert /10 score to % for display
              const displayValue =
                kpi.kpiId === "csat" ? (
                  <>
                    {kpi.average}
                    <span className="cp-kpi-unit">/10</span>
                  </>
                ) : (
                  <>{kpiValueToPercent(kpi.average)}</>
                );

              return (
                <ClickableTile
                  key={kpi.kpiId}
                  id={`global-kpi-${kpi.kpiId}`}
                  onClick={() => setSelectedKpi(kpi)}
                  style={{ minHeight: 120, padding: "1.25rem" }}
                >
                  <div className="cp-kpi-score">{displayValue}</div>
                  {getStatusTag()}
                  <div className="cp-kpi-category" style={{ marginTop: "0.5rem", fontWeight: 500 }}>
                    {kpi.label}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                      marginTop: "0.25rem",
                    }}
                  >
                    {kpi.clientCount} client{kpi.clientCount === 1 ? "" : "s"}
                  </div>
                </ClickableTile>
              );
            })}
          </div>
        )}
      </section>

      <section className="cp-section">
        <h2 className="cp-section-title">Clients in scope</h2>
        <div
          style={{
            marginBottom: "1rem",
            display: "flex",
            gap: "1rem",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 300px", minWidth: "250px" }}>
            <TableToolbarSearch
              persistent
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target?.value || "")}
            />
          </div>
          {TIER_FEATURE_ENABLED && (
            <Select
              id="client-table-tier-filter"
              labelText="Tier"
              value={clientTableTierFilter}
              onChange={(e) => setClientTableTierFilter(e.target.value)}
              style={{ width: "150px" }}
            >
              <SelectItem value="all" text="All" />
              {availableTiers.map((tier) => (
                <SelectItem key={tier} value={tier} text={`Tier ${tier}`} />
              ))}
            </Select>
          )}
        </div>
        <DataTable rows={clientTableRows} headers={headers} isSortable>
          {({ rows, headers, getHeaderProps, getTableProps, getTableContainerProps }) => (
            <TableContainer title="" description="" {...getTableContainerProps()}>
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    {headers.map((header) => (
                      <TableHeader
                        {...getHeaderProps({ header })}
                        isSortable={header.key !== "tier"}
                      >
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === "tier") {
                          return (
                            <TableCell key={cell.id}>
                              <TierTag tier={cell.value as string} />
                            </TableCell>
                          );
                        }
                        if (cell.info.header === "tcv") {
                          return (
                            <TableCell key={cell.id}>
                              ${(cell.value as number).toLocaleString()}
                            </TableCell>
                          );
                        }
                        if (cell.info.header === "arr") {
                          const arrValue = cell.value as number;
                          const arrow = arrValue >= 0 ? "↑" : "↓";
                          return (
                            <TableCell key={cell.id}>
                              {arrow} {Math.abs(arrValue).toFixed(1)}
                            </TableCell>
                          );
                        }
                        return <TableCell key={cell.id}>{cell.value}</TableCell>;
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      </section>

      <GlobalKpiDetailModal
        kpi={selectedKpi}
        clients={clients}
        geoFilter={geoFilter}
        marketFilter={marketFilter}
        onClose={() => setSelectedKpi(null)}
      />
    </>
  );
}
