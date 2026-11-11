import { useState, useEffect, useRef, useMemo } from "react";
import {
  ClickableTile,
  Modal,
  Grid,
  Column,
  Tile,
  Tag,
  Button,
  Select,
  SelectItem,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListBody,
  StructuredListRow,
  StructuredListCell,
  NumberInput,
  TextArea,
  InlineNotification,
} from "@carbon/react";
import { Edit } from "@carbon/icons-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { Client } from "@/data/clients";
import { useDemoData } from "@/demo-integration/DemoDataContext";
import {
  isNumericDisplay,
  LIVE_NO_DATA,
  resolveProductDisplay,
} from "@/demo-integration/productIntegrationDisplay";
import { riskLevelFromScore } from "@/lib/riskLevel";
import { kpiValueToPercent, getKpiDefinition, scoreStatus } from "@/data/kpiLibrary";
import { addProductAdoptionScore } from "@/services/clientService";
import { KPIScoringGuidance } from "./KPIScoringGuidance";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useAuth } from "@/contexts/AuthContext";
import { fetchClientCaseInsights, getProductInsights } from "@/services/salesforceCaseService";
import { SalesforceCaseInsights } from "./SalesforceCaseInsights";
import type {
  ClientCaseInsights,
  ProductCaseInsights,
} from "@/demo-integration/salesforceCaseAdapter";
import {
  getProductHealthKpis,
  getProductRecommendations,
  type ProductHealthSection,
  type ProductRecommendation,
} from "@/services/productHealthKpiService";

interface HealthCheckHistoryEntry {
  fileName: string;
  timestamp: string;
  dbName: string | null;
  product: string | null;
}
import { calculateProductHealth } from "@/lib/productHealthCalculator";
import { apiFetch } from "@/lib/apiFetch";
import { usesEcProducts } from "@/lib/clientProductCount";
import {
  ProductVerificationPill,
  ProductBoxActions,
  EditAndVerifyModal,
  AddProductModal,
  AddProductTile,
  ConfirmRemoveModal,
  RemovedProductsBar,
  formatVerifiedAt,
  type EcProductBox,
  type RemovedProduct,
  type ProductAction,
} from "./ProductVerificationPill";

/** What GET/POST /api/demo/product-verification/:clientId returns. */
interface ProductBoxesPayload {
  products?: EcProductBox[];
  removed?: RemovedProduct[];
  canVerify?: boolean;
}

// ─── Tag + colour helpers ─────────────────────────────────────────────────────

const getStatusTag = (status: string) => {
  switch (status) {
    case "Excellent":
      return (
        <Tag type="green" size="sm" style={{ margin: 0 }}>
          EXCELLENT
        </Tag>
      );
    case "Good":
      return (
        <Tag type="blue" size="sm" style={{ margin: 0 }}>
          GOOD
        </Tag>
      );
    case "Watch":
      return (
        <Tag size="sm" style={{ margin: 0, background: "#fef1c9", color: "#6c4d00" }}>
          WARNING
        </Tag>
      );
    case "Critical":
      return (
        <Tag type="red" size="sm" style={{ margin: 0 }}>
          CRITICAL
        </Tag>
      );
    case "Pilot":
      return (
        <Tag type="gray" size="sm" style={{ margin: 0 }}>
          DEPLOYING
        </Tag>
      );
    default:
      return (
        <Tag type="gray" size="sm" style={{ margin: 0 }}>
          {status.toUpperCase()}
        </Tag>
      );
  }
};

const getStatusColor = (status: string) => {
  if (status === "Excellent") return "var(--cds-support-success, #24a148)";
  if (status === "Good") return "var(--cds-support-info, #0f62fe)";
  if (status === "Watch") return "var(--cds-support-warning, #f5c342)";
  if (status === "Pilot") return "var(--cds-support-info, #0f62fe)";
  return "var(--cds-support-error, #da1e28)";
};

const getRiskBorder = (lvl: string) => {
  if (lvl === "CRITICAL") return "var(--cds-support-error, #da1e28)";
  if (lvl === "HIGH") return "var(--cds-support-caution, #ff832b)";
  if (lvl === "MEDIUM") return "var(--cds-support-warning, #f5c342)";
  return "var(--cds-support-success, #24a148)";
};

const getRiskIconColor = (lvl: string) => {
  if (lvl === "CRITICAL") return "var(--cds-support-error, #da1e28)";
  if (lvl === "HIGH") return "var(--cds-support-caution, #ff832b)";
  if (lvl === "MEDIUM") return "var(--cds-support-warning, #f5c342)";
  return "var(--cds-support-success, #24a148)";
};

// ─── SVG icon components ──────────────────────────────────────────────────────

const HeartIcon = ({ color }: { color: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill={color}
    style={{ marginRight: "0.25rem", verticalAlign: "middle" }}
  >
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
);

const ClockIcon = ({ color }: { color: string }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const BellIcon = ({ color }: { color: string }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const RiskWarningIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const RiskLockIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const RiskNetworkIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="16" y="16" width="6" height="6" rx="1" />
    <rect x="2" y="16" width="6" height="6" rx="1" />
    <rect x="9" y="2" width="6" height="6" rx="1" />
    <path d="M12 8v4" />
    <path d="M12 12H5v4" />
    <path d="M12 12h7v4" />
  </svg>
);
const RiskShieldIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const getRiskIcon = (lvl: string) => {
  if (lvl === "CRITICAL") return <RiskWarningIcon />;
  if (lvl === "HIGH") return <RiskLockIcon />;
  if (lvl === "MEDIUM") return <RiskNetworkIcon />;
  return <RiskShieldIcon />;
};

// ─── Product Detail Modal ─────────────────────────────────────────────────────

interface ProductDetailModalProps {
  product: Client["productPortfolio"][0] | null;
  client: Client;
  isDemoLive: boolean;
  canRecord: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

interface ProductDetailModalProps {
  product: Client["productPortfolio"][0] | null;
  client: Client;
  isDemoLive: boolean;
  canRecord: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  onOpenAdoptionModal?: () => void;
  onOpenAdoptionTrend?: () => void;
}

function ProductDetailModal({
  product,
  client,
  isDemoLive,
  canRecord,
  onClose,
  onUpdate,
  onOpenAdoptionModal,
  onOpenAdoptionTrend,
}: ProductDetailModalProps) {
  const [salesforceInsights, setSalesforceInsights] = useState<ClientCaseInsights | null>(null);
  const [productCaseInsights, setProductCaseInsights] = useState<ProductCaseInsights | null>(null);
  const [loadingSalesforce, setLoadingSalesforce] = useState(true);
  const [healthKpis, setHealthKpis] = useState<ProductHealthSection[]>([]);
  const [loadingHealthKpis, setLoadingHealthKpis] = useState(true);
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null);
  const [lastCompletedDbName, setLastCompletedDbName] = useState<string | null>(null);
  const [hcHistory, setHcHistory] = useState<HealthCheckHistoryEntry[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [loadingFileData, setLoadingFileData] = useState(false);
  const [trendData, setTrendData] = useState<Array<Record<string, any>>>([]);
  const [availableDbs, setAvailableDbs] = useState<Array<{ dbName: string; checkCount: number }>>(
    [],
  );
  const [selectedDb, setSelectedDb] = useState<string>("");

  const adoptionKpiDef = getKpiDefinition("product_adoption");

  const adoptionHistory = product?.adoptionKpiConfig
    ? [...product.adoptionKpiConfig.history].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
    : [];
  const latestAdoption = adoptionHistory.length
    ? adoptionHistory[adoptionHistory.length - 1]
    : null;
  const adoptionStatus =
    latestAdoption && adoptionKpiDef
      ? scoreStatus(adoptionKpiDef, latestAdoption.value)
      : "pending";

  // Fetch Salesforce case insights when modal opens
  useEffect(() => {
    if (!product || !client.cmrNumber) {
      setLoadingSalesforce(false);
      return;
    }

    setLoadingSalesforce(true);
    fetchClientCaseInsights(client.cmrNumber)
      .then((insights) => {
        setSalesforceInsights(insights);
        if (insights && product.productName) {
          const prodInsights = getProductInsights(insights, product.productName);
          setProductCaseInsights(prodInsights);
        }
      })
      .catch((err) => {
        console.error("Error fetching Salesforce insights:", err);
      })
      .finally(() => {
        setLoadingSalesforce(false);
      });
  }, [product?.productName, client.cmrNumber]);

  // Reset selections when product changes
  useEffect(() => {
    setSelectedFileName("");
    setSelectedDb("");
    setTrendData([]);
    setHcHistory([]);
    setAvailableDbs([]);
  }, [product?.productName]);

  // On open: fetch history list + available databases
  useEffect(() => {
    if (!client.clientId || !product) return;

    apiFetch(`/api/demo/health-check/history/${encodeURIComponent(client.clientId)}`)
      .then((r) => r.json())
      .then((entries: HealthCheckHistoryEntry[]) => {
        // Only keep files for this product, cap at 4
        const filtered = entries.filter((e) => e.product === product.productName).slice(0, 4);
        setHcHistory(filtered);
        if (!selectedFileName && filtered.length > 0) {
          setSelectedFileName(filtered[0].fileName);
        }
      })
      .catch(() => setHcHistory([]));

    fetch(
      `/api/demo/health-check/databases/${encodeURIComponent(client.clientId)}/${encodeURIComponent(product.productName)}`,
    )
      .then((r) => r.json())
      .then((dbs: Array<{ dbName: string; checkCount: number }>) => {
        setAvailableDbs(dbs);
        if (dbs.length > 0) setSelectedDb(dbs[0].dbName);
      })
      .catch(() => setAvailableDbs([]));
  }, [client.clientId, product?.productName]);

  // Fetch trend whenever selectedDb changes
  useEffect(() => {
    if (!client.clientId || !product) return;
    const params = selectedDb ? `?dbName=${encodeURIComponent(selectedDb)}` : "";
    fetch(
      `/api/demo/health-check/trend/${encodeURIComponent(client.clientId)}/${encodeURIComponent(product.productName)}${params}`,
    )
      .then((r) => r.json())
      .then(
        (
          points: Array<{
            label: string;
            avgScores: Record<string, number>;
            overallAvg: number;
            dbName: string | null;
          }>,
        ) => {
          setTrendData(
            points.map((p) => ({
              label: p.label,
              dbName: p.dbName,
              overallAvg: p.overallAvg,
              ...p.avgScores,
            })),
          );
        },
      )
      .catch(() => setTrendData([]));
  }, [selectedDb, client.clientId, product?.productName]);

  // When selected file changes, load its KPIs + Recommendations
  useEffect(() => {
    if (!selectedFileName || !product || !client.clientId) {
      setLoadingHealthKpis(false);
      return;
    }
    setLoadingHealthKpis(true);
    setLoadingFileData(true);
    fetch(
      `/api/demo/health-check/file/${encodeURIComponent(client.clientId)}/${encodeURIComponent(selectedFileName)}/${encodeURIComponent(product.productName)}`,
    )
      .then((r) => r.json())
      .then((d) => {
        setHealthKpis(d.kpis ?? []);
        setRecommendations(d.recommendations ?? []);
        setLastCompletedDbName(d.dbName ?? null);
        // timestamp from history entry
        const entry = hcHistory.find((e) => e.fileName === selectedFileName);
        setLastCompletedAt(entry?.timestamp ?? null);
      })
      .catch(() => {
        setHealthKpis([]);
        setRecommendations([]);
      })
      .finally(() => {
        setLoadingHealthKpis(false);
        setLoadingFileData(false);
      });
  }, [selectedFileName, product?.productName, client.clientId]);

  if (!product) return null;

  const { productName, status, description } = product;
  const display = resolveProductDisplay(product, isDemoLive);
  const { chartData, healthCheck } = display;
  const escalationsValue = display.escalations;
  const escalationsHighlight = isNumericDisplay(escalationsValue) && escalationsValue > 0;

  // Use Salesforce data for total tickets if available, otherwise fallback to display value
  const totalTicketsFromSalesforce = productCaseInsights?.totalCases;
  const totalTickets =
    totalTicketsFromSalesforce !== undefined ? totalTicketsFromSalesforce : display.totalTickets;

  // Calculate dynamic product health score from health check KPIs
  const healthCalculation = calculateProductHealth(healthKpis);
  const calculatedHealthPercent = healthCalculation.hasData
    ? healthCalculation.healthPercent
    : isNumericDisplay(display.healthPercent)
      ? display.healthPercent
      : 0;
  const calculatedStatus = healthCalculation.hasData ? healthCalculation.status : status;

  // Helper function to get status tag for health KPIs
  const getHealthStatusTag = (status: "Excellent" | "Good" | "Warning" | "Critical") => {
    switch (status) {
      case "Excellent":
        return (
          <Tag type="green" size="sm" style={{ margin: 0 }}>
            EXCELLENT
          </Tag>
        );
      case "Good":
        return (
          <Tag type="blue" size="sm" style={{ margin: 0 }}>
            GOOD
          </Tag>
        );
      case "Warning":
        return (
          <Tag size="sm" style={{ margin: 0, background: "#fef1c9", color: "#6c4d00" }}>
            WARNING
          </Tag>
        );
      case "Critical":
        return (
          <Tag type="red" size="sm" style={{ margin: 0 }}>
            CRITICAL
          </Tag>
        );
    }
  };

  const getHealthStatusColor = (status: "Excellent" | "Good" | "Warning" | "Critical") => {
    switch (status) {
      case "Excellent":
        return "var(--cds-support-success, #24a148)";
      case "Good":
        return "var(--cds-support-info, #0f62fe)";
      case "Warning":
        return "var(--cds-support-warning, #f5c342)";
      case "Critical":
        return "var(--cds-support-error, #da1e28)";
    }
  };

  return (
    <Modal
      open
      modalHeading={productName}
      modalLabel="Active Product Integration"
      passiveModal
      onRequestClose={onClose}
      size="lg"
    >
      {/* Status tag + description */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}
      >
        {getStatusTag(calculatedStatus)}
      </div>
      <p
        style={{
          color: "var(--cds-text-secondary)",
          marginTop: 0,
          marginBottom: "1.5rem",
          fontSize: "0.875rem",
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>

      {/* Key Metrics row — mirrors cp-metric-row pattern */}
      <div
        className="cp-metric-row"
        style={{
          borderTop: "none",
          paddingTop: 0,
          gridTemplateColumns: "repeat(3, 1fr)",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <div className="cp-metric-label">Health Score</div>
          <div
            className="cp-metric-value"
            style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <HeartIcon color={getStatusColor(calculatedStatus)} />
            {healthCalculation.hasData ? `${Math.round(calculatedHealthPercent)}%` : LIVE_NO_DATA}
          </div>
        </div>
        <div>
          <div className="cp-metric-label">Total Tickets</div>
          <div className="cp-metric-value">{totalTickets}</div>
        </div>
        <div>
          <div className="cp-metric-label">Escalations</div>
          <div
            className="cp-metric-value"
            style={{
              color: escalationsHighlight ? "var(--cds-support-error, #da1e28)" : undefined,
            }}
          >
            {escalationsValue}
          </div>
        </div>
      </div>

      {/* Product Adoption KPI Tile */}
      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--cds-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.32px",
          marginTop: "0",
          marginBottom: "0.75rem",
        }}
      >
        Product Adoption
      </p>
      <div className="cp-kpi-grid" style={{ marginBottom: "1.5rem" }}>
        <ClickableTile
          onClick={() => onOpenAdoptionTrend?.()}
          style={{ minHeight: 140, display: "flex", flexDirection: "column" }}
        >
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
          >
            <div className="cp-kpi-category">{adoptionKpiDef?.label ?? "Product Adoption"}</div>
            {canRecord && (
              <div
                style={{
                  border: "1px solid #0f62fe",
                  borderRadius: "4px",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Button
                  hasIconOnly
                  renderIcon={Edit}
                  iconDescription="Record checkpoint"
                  kind="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAdoptionModal?.();
                  }}
                  style={{ minHeight: "32px", padding: 0 }}
                />
              </div>
            )}
          </div>

          {latestAdoption === null ? (
            <div
              style={{
                marginTop: "1rem",
                color: "var(--cds-text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              Score pending — first checkpoint not yet recorded
            </div>
          ) : (
            <>
              <div className="cp-kpi-score">{kpiValueToPercent(latestAdoption.value)}</div>
              <div>
                <Tag
                  type={
                    adoptionStatus === "excellent"
                      ? "green"
                      : adoptionStatus === "good"
                        ? "blue"
                        : adoptionStatus === "watch"
                          ? "gray"
                          : "red"
                  }
                  size="sm"
                  style={{ margin: 0 }}
                >
                  {adoptionStatus.toUpperCase()}
                </Tag>
              </div>
            </>
          )}

          <div style={{ marginTop: "auto", paddingTop: "0.5rem", fontSize: "0.875rem" }}>
            {adoptionKpiDef?.label ?? "Product Adoption"}
          </div>
        </ClickableTile>
      </div>

      {/* Salesforce Case Insights - Show only if client has Salesforce data */}
      {productCaseInsights && (
        <div style={{ marginBottom: "1.5rem" }}>
          <SalesforceCaseInsights productInsights={productCaseInsights} />
        </div>
      )}

      {/* 6-Month Case Volume chart — identical styling to KPITrendDrawer */}
      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--cds-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.32px",
          marginBottom: "0.5rem",
          marginTop: 0,
        }}
      >
        6-Month Case Volume
      </p>
      {!display.hasCaseVolume ? (
        <Tile
          style={{
            background: "var(--cds-layer-02)",
            color: "var(--cds-text-secondary)",
            fontSize: "0.875rem",
            marginBottom: "1.5rem",
          }}
        >
          {LIVE_NO_DATA}
        </Tile>
      ) : (
        <div style={{ width: "100%", height: 240, marginBottom: "1.5rem" }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cds-border-subtle)" />
              <XAxis
                dataKey="month"
                stroke="var(--cds-text-secondary)"
                fontSize={12}
                tick={{ fill: "var(--cds-text-secondary)" }}
              />
              <YAxis
                stroke="var(--cds-text-secondary)"
                fontSize={12}
                tick={{ fill: "var(--cds-text-secondary)" }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--cds-layer-02)",
                  borderColor: "var(--cds-border-subtle)",
                  borderRadius: "4px",
                }}
                labelStyle={{ color: "var(--cds-text-primary)" }}
              />
              <Line
                type="monotone"
                dataKey="Cases"
                stroke="#0f62fe"
                strokeWidth={2}
                dot={{ r: 4, stroke: "#0f62fe", strokeWidth: 2, fill: "#ffffff" }}
                activeDot={{ r: 6, stroke: "#0f62fe", strokeWidth: 2, fill: "#ffffff" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Health Check Details */}
      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--cds-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.32px",
          marginTop: "1.5rem",
          marginBottom: "0.75rem",
        }}
      >
        Health Check Details
      </p>

      {/* Trend Chart with DB filter */}
      {availableDbs.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          {/* DB Name dropdown */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "1rem",
              marginBottom: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "0 0 240px" }}>
              <Select
                id="hc-db-select"
                labelText="Database Name"
                value={selectedDb}
                onChange={(e) => setSelectedDb(e.target.value)}
                size="md"
              >
                {availableDbs.map((db) => (
                  <SelectItem
                    key={db.dbName}
                    value={db.dbName}
                    text={`${db.dbName}  (${db.checkCount} check${db.checkCount !== 1 ? "s" : ""})`}
                  />
                ))}
              </Select>
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--cds-text-secondary)",
                paddingBottom: "0.6rem",
              }}
            >
              Showing last {trendData.length} health check{trendData.length !== 1 ? "s" : ""} for{" "}
              <strong>{selectedDb}</strong>
            </div>
          </div>

          {trendData.length >= 2 ? (
            <div style={{ marginBottom: "0" }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--cds-text-secondary)",
                  marginBottom: "0.5rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.32px",
                }}
              >
                Trend Analysis of Defined KPIs
              </div>
              <div
                style={{
                  width: "100%",
                  height: 220,
                  background: "var(--cds-layer-01)",
                  border: "1px solid var(--cds-border-subtle)",
                  padding: "0.75rem 0.5rem 0.25rem 0",
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cds-border-subtle)" />
                    <XAxis
                      dataKey="label"
                      stroke="var(--cds-text-secondary)"
                      fontSize={11}
                      tick={{ fill: "var(--cds-text-secondary)" }}
                    />
                    <YAxis
                      domain={[0, 10]}
                      ticks={[0, 2, 4, 6, 8, 10]}
                      stroke="var(--cds-text-secondary)"
                      fontSize={11}
                      tick={{ fill: "var(--cds-text-secondary)" }}
                      label={{
                        value: "Avg Score",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 10, fill: "var(--cds-text-secondary)" },
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--cds-layer-02)",
                        borderColor: "var(--cds-border-subtle)",
                        borderRadius: "4px",
                        fontSize: "0.8rem",
                      }}
                      labelStyle={{ color: "var(--cds-text-primary)", fontWeight: 600 }}
                      formatter={(value: any, name: string) => [Number(value).toFixed(1), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }} />
                    <Line
                      type="monotone"
                      dataKey="Risk Analysis"
                      stroke="#da1e28"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#da1e28" }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="Product Stability"
                      stroke="#0f62fe"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#0f62fe" }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="Product Performance"
                      stroke="#24a148"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#24a148" }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="overallAvg"
                      stroke="#8a3ffc"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#8a3ffc" }}
                      activeDot={{ r: 6 }}
                      strokeDasharray="5 3"
                      name="Overall Avg"
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <Tile
              style={{
                background: "var(--cds-layer-02)",
                color: "var(--cds-text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              Only 1 health check found for <strong>{selectedDb}</strong>. Run more checks to see a
              trend.
            </Tile>
          )}
        </div>
      )}

      {!healthCheck.required ? (
        <Tile
          style={{
            background: "var(--cds-layer-02)",
            color: "var(--cds-text-secondary)",
            fontSize: "0.875rem",
          }}
        >
          ℹ️ No health check required for this deployment status.
        </Tile>
      ) : (
        <Grid narrow style={{ padding: 0 }}>
          <Column sm={4} md={4} lg={8}>
            <Tile
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                background: "var(--cds-layer-02)",
                marginBottom: "0.5rem",
              }}
            >
              <div
                style={{
                  background: "rgba(36,161,72,0.1)",
                  padding: "0.5rem",
                  borderRadius: "50%",
                  display: "flex",
                }}
              >
                <ClockIcon color="#24a148" />
              </div>
              <div>
                <div className="cp-metric-label">Last Completed Check</div>
                <div
                  style={{
                    fontSize: "0.95rem",
                    color: "var(--cds-text-primary)",
                    marginTop: "0.15rem",
                  }}
                >
                  {lastCompletedAt
                    ? new Date(lastCompletedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : healthCheck.lastCheck}
                </div>
              </div>
            </Tile>
          </Column>
        </Grid>
      )}

      {/* Select Health Check dropdown */}
      {hcHistory.length > 0 && (
        <div style={{ marginTop: "0.75rem", marginBottom: "0.5rem", maxWidth: "240px" }}>
          <Select
            id="hc-history-select"
            labelText="Select Health Check"
            value={selectedFileName}
            onChange={(e) => setSelectedFileName(e.target.value)}
            size="md"
          >
            {hcHistory.map((entry, idx) => {
              const label = [
                idx === 0 ? "Latest — " : "",
                new Date(entry.timestamp).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
                entry.dbName ? ` · ${entry.dbName}` : "",
              ].join("");
              return <SelectItem key={entry.fileName} value={entry.fileName} text={label} />;
            })}
          </Select>
        </div>
      )}

      {/* Database Name tile — below Select Health Check */}
      {lastCompletedDbName && (
        <div style={{ maxWidth: "240px", marginBottom: "0.75rem" }}>
          <Tile
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              background: "var(--cds-layer-02)",
            }}
          >
            <div
              style={{
                background: "rgba(15,98,254,0.1)",
                padding: "0.5rem",
                borderRadius: "50%",
                display: "flex",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                style={{ color: "#0f62fe" }}
              >
                <path d="M8 1C5.2 1 2 2.1 2 4v8c0 1.9 3.2 3 6 3s6-1.1 6-3V4c0-1.9-3.2-3-6-3zm0 1.5c2.8 0 4.5 1 4.5 1.5S10.8 5.5 8 5.5 3.5 4.5 3.5 4 5.2 2.5 8 2.5zM3.5 6.1c.9.6 2.5 1 4.5 1s3.6-.4 4.5-1V8c0 .5-1.7 1.5-4.5 1.5S3.5 8.5 3.5 8V6.1zm0 3.9c.9.6 2.5 1 4.5 1s3.6-.4 4.5-1v1.9c0 .5-1.7 1.5-4.5 1.5S3.5 12.5 3.5 12V10z" />
              </svg>
            </div>
            <div>
              <div className="cp-metric-label">Database Name</div>
              <div
                style={{
                  fontSize: "0.95rem",
                  color: "var(--cds-text-primary)",
                  marginTop: "0.15rem",
                }}
              >
                {lastCompletedDbName}
              </div>
            </div>
          </Tile>
        </div>
      )}

      {/* Product Health KPIs */}
      {loadingHealthKpis || loadingFileData ? (
        <Tile
          style={{
            background: "var(--cds-layer-02)",
            color: "var(--cds-text-secondary)",
            fontSize: "0.875rem",
            marginTop: "1.5rem",
          }}
        >
          Loading health check data...
        </Tile>
      ) : (
        <>
          {/* KPI sections: Risk Analysis, Product Stability, Product Performance */}
          {["Risk Analysis", "Product Stability", "Product Performance"].map(
            (sectionName, sectionIdx) => {
              const sectionData = healthKpis.find((kpi) => kpi.mainKpi === sectionName);
              return (
                <div key={sectionIdx}>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.32px",
                      marginTop: "1.5rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {sectionName}
                  </p>
                  {!sectionData || sectionData.subKpis.length === 0 ? (
                    <Tile
                      style={{
                        background: "var(--cds-layer-02)",
                        color: "var(--cds-text-secondary)",
                        fontSize: "0.875rem",
                      }}
                    >
                      No data available for this section.
                    </Tile>
                  ) : (
                    <Grid narrow style={{ padding: 0, marginBottom: "1rem" }}>
                      {sectionData.subKpis.map((subKpi, subIdx) => {
                        const statusColor = getHealthStatusColor(subKpi.status);
                        return (
                          <Column
                            key={subIdx}
                            sm={4}
                            md={4}
                            lg={4}
                            style={{ marginBottom: "1rem" }}
                          >
                            <Tile
                              style={{
                                background: "var(--cds-layer-01)",
                                border: `1px solid var(--cds-border-subtle)`,
                                borderLeft: `4px solid ${statusColor}`,
                                padding: "1rem",
                                height: "100%",
                                minHeight: "120px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--cds-text-secondary)",
                                  textTransform: "uppercase",
                                  marginBottom: "0.75rem",
                                }}
                              >
                                {subKpi.name}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "baseline",
                                  gap: "0.5rem",
                                  marginBottom: "0.75rem",
                                }}
                              >
                                <span
                                  style={{ fontSize: "2rem", fontWeight: 600, color: statusColor }}
                                >
                                  {subKpi.score}
                                </span>
                                <span
                                  style={{
                                    fontSize: "0.875rem",
                                    color: "var(--cds-text-secondary)",
                                  }}
                                >
                                  / 10
                                </span>
                              </div>
                              <div style={{ marginBottom: "0.5rem" }}>
                                {getHealthStatusTag(subKpi.status)}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "var(--cds-text-secondary)",
                                  marginTop: "auto",
                                }}
                              >
                                Updated: {new Date(subKpi.lastUpdated).toLocaleDateString()}
                              </div>
                            </Tile>
                          </Column>
                        );
                      })}
                    </Grid>
                  )}
                </div>
              );
            },
          )}

          {/* Product Recommendations section — from Structured Advisor Remediation Vectors */}
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--cds-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.32px",
              marginTop: "1.5rem",
              marginBottom: "0.75rem",
            }}
          >
            Product Recommendations
          </p>
          {recommendations.length === 0 ? (
            <Tile
              style={{
                background: "var(--cds-layer-02)",
                color: "var(--cds-text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              No recommendations available. Run a health check to generate recommendations.
            </Tile>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {recommendations.map((rec, idx) => {
                const borderColor =
                  rec.status === "Critical"
                    ? "#da1e28"
                    : rec.status === "Warning"
                      ? "#f1c21b"
                      : rec.status === "Info"
                        ? "#0f62fe"
                        : "#24a148";
                const bgColor =
                  rec.status === "Critical"
                    ? "rgba(218,30,40,0.05)"
                    : rec.status === "Warning"
                      ? "rgba(241,194,27,0.05)"
                      : rec.status === "Info"
                        ? "rgba(15,98,254,0.05)"
                        : "rgba(36,161,72,0.05)";
                const tagType =
                  rec.status === "Critical"
                    ? "red"
                    : rec.status === "Warning"
                      ? "warm-gray"
                      : rec.status === "Info"
                        ? "blue"
                        : "green";
                return (
                  <div
                    key={idx}
                    style={{
                      background: bgColor,
                      border: `1px solid var(--cds-border-subtle)`,
                      borderLeft: `4px solid ${borderColor}`,
                      padding: "1rem",
                      borderRadius: "2px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <Tag type={tagType as any} size="sm" style={{ margin: 0 }}>
                        {rec.status.toUpperCase()}
                      </Tag>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--cds-text-secondary)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                        }}
                      >
                        {rec.section.replace(/^[A-Z]+\.\s*/, "")}
                      </span>
                      <span
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          color: "var(--cds-text-primary)",
                        }}
                      >
                        {rec.heading}
                      </span>
                    </div>
                    {rec.observed && (
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--cds-text-secondary)",
                          marginBottom: "0.35rem",
                        }}
                      >
                        <strong>Observed:</strong> {rec.observed}
                      </div>
                    )}
                    {rec.detail && (
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--cds-text-primary)",
                          marginBottom: "0.35rem",
                        }}
                      >
                        <strong>Analysis:</strong> {rec.detail}
                      </div>
                    )}
                    {rec.action && (
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--cds-text-primary)",
                          marginBottom: "0.35rem",
                        }}
                      >
                        <strong>Action:</strong> {rec.action}
                      </div>
                    )}
                    {rec.ref && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--cds-text-secondary)",
                          fontStyle: "italic",
                        }}
                      >
                        Ref: {rec.ref}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ─── Product Adoption Trend Drawer ───────────────────────────────────────────

interface ProductAdoptionTrendDrawerProps {
  open: boolean;
  product: Client["productPortfolio"][0];
  canRecord: boolean;
  onClose: () => void;
  onOpenScoreModal: () => void;
}

function ProductAdoptionTrendDrawer({
  open,
  product,
  canRecord,
  onClose,
  onOpenScoreModal,
}: ProductAdoptionTrendDrawerProps) {
  const adoptionKpiDef = getKpiDefinition("product_adoption");

  const history = product.adoptionKpiConfig
    ? [...product.adoptionKpiConfig.history].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
      })
    : [];

  // Calculate dynamic Y-axis domain
  let yDomain: [number, number] = [0, 10];
  if (history.length > 0) {
    const values = history.map((h) => h.value);
    const maxVal = Math.max(...values);
    const padMax = Math.min(10, Math.ceil(maxVal) + 1);
    yDomain = [0, Math.max(2, padMax)];
  }

  if (!adoptionKpiDef) return null;

  return (
    <Modal
      open={open}
      modalHeading={`${adoptionKpiDef.label} — ${product.productName}`}
      modalLabel="Product KPI Trend"
      passiveModal
      onRequestClose={onClose}
      size="lg"
    >
      <p style={{ color: "var(--cds-text-secondary)", marginTop: 0, marginBottom: "1.5rem" }}>
        {adoptionKpiDef.description}
      </p>

      {history.length === 0 ? (
        <InlineNotification
          kind="info"
          title="No score history"
          subtitle="Record a checkpoint to see trends"
          hideCloseButton
        />
      ) : (
        <>
          {/* Trend Graph */}
          <div style={{ width: "100%", height: 300, marginBottom: "1.5rem" }}>
            <ResponsiveContainer>
              <LineChart data={history} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cds-border-subtle)" />
                <XAxis
                  dataKey="date"
                  stroke="var(--cds-text-secondary)"
                  fontSize={12}
                  tick={{ fill: "var(--cds-text-secondary)" }}
                />
                <YAxis
                  domain={yDomain}
                  tickFormatter={(v: number) => `${Math.round(v * 10)}%`}
                  stroke="var(--cds-text-secondary)"
                  fontSize={12}
                  tick={{ fill: "var(--cds-text-secondary)" }}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [kpiValueToPercent(Number(value)), "Score"]}
                  contentStyle={{
                    background: "var(--cds-layer-02)",
                    borderColor: "var(--cds-border-subtle)",
                    borderRadius: "4px",
                  }}
                  labelStyle={{ color: "var(--cds-text-primary)" }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0f62fe"
                  strokeWidth={2}
                  dot={{ r: 4, stroke: "#0f62fe", strokeWidth: 2, fill: "#ffffff" }}
                  activeDot={{ r: 6, stroke: "#0f62fe", strokeWidth: 2, fill: "#ffffff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Audit Table */}
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--cds-text-secondary)",
              marginBottom: "0.5rem",
            }}
          >
            Score History
          </p>
          <StructuredListWrapper>
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>Date</StructuredListCell>
                <StructuredListCell head>Score</StructuredListCell>
                <StructuredListCell head>Notes</StructuredListCell>
                <StructuredListCell head>Recorded By</StructuredListCell>
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              {[...history].reverse().map((h, i) => (
                <StructuredListRow key={i}>
                  <StructuredListCell>{h.date}</StructuredListCell>
                  <StructuredListCell>{Math.round(h.value * 10)}/100</StructuredListCell>
                  <StructuredListCell>{h.notes ?? "—"}</StructuredListCell>
                  <StructuredListCell>{h.recordedBy ?? "—"}</StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        </>
      )}

      {canRecord && (
        <div
          style={{
            marginTop: "1.5rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--cds-border-subtle)",
          }}
        >
          <Button kind="primary" onClick={onOpenScoreModal}>
            Record New Checkpoint
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ─── Product Adoption Score Entry Modal ──────────────────────────────────────

interface ProductAdoptionModalProps {
  open: boolean;
  product: Client["productPortfolio"][0];
  client: Client;
  onClose: () => void;
  onUpdate?: () => void;
}

function ProductAdoptionModal({
  open,
  product,
  client,
  onClose,
  onUpdate,
}: ProductAdoptionModalProps) {
  // Needed to attribute the checkpoint. Without it the save throws
  // "user is not defined" at the point of writing the score.
  const { user } = useAuth();
  const [adoptionInputRaw, setAdoptionInputRaw] = useState("");
  const [adoptionNotes, setAdoptionNotes] = useState("");
  const [adoptionSaving, setAdoptionSaving] = useState(false);
  const [adoptionSaved, setAdoptionSaved] = useState(false);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  const [adoptionBand, setAdoptionBand] = useState<string | undefined>(undefined);

  // Debug: Log component renders
  console.log("🔄 ProductAdoptionModal render:", {
    open,
    productId: product.productId,
    productName: product.productName,
    adoptionNotes,
    adoptionInputRaw,
  });

  // No useEffect - state persists while modal is open

  const adoptionKpiDef = getKpiDefinition("product_adoption");

  const adoptionHistory = product?.adoptionKpiConfig
    ? [...product.adoptionKpiConfig.history].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
    : [];
  const latestAdoption = adoptionHistory.length
    ? adoptionHistory[adoptionHistory.length - 1]
    : null;

  const parsedAdoptionScore = (() => {
    const n = parseFloat(adoptionInputRaw);
    if (!Number.isFinite(n) || n < 0 || n > 10) return null;
    return Math.round(n * 10) / 10;
  })();

  const handleClose = () => {
    // Reset state when closing
    setAdoptionInputRaw("");
    setAdoptionNotes("");
    setAdoptionSaving(false);
    setAdoptionSaved(false);
    setAdoptionError(null);
    setAdoptionBand(undefined);
    onClose();
  };

  const handleAdoptionBandSelect = (midpoint: number) => {
    setAdoptionInputRaw(String(midpoint));
    const band = adoptionKpiDef?.scoringGuidance?.bands.find((b) => {
      const [lo, hi] = b.range.split("-").map(Number);
      return midpoint >= lo && midpoint <= hi;
    });
    setAdoptionBand(band?.range);
  };

  const handleAdoptionSave = async () => {
    if (!product || parsedAdoptionScore === null) return;
    setAdoptionSaving(true);
    setAdoptionError(null);
    try {
      await addProductAdoptionScore(
        client.clientId,
        product.productId ?? product.productName,
        parsedAdoptionScore,
        adoptionNotes || undefined,
        user?.name ?? "",
        user?.email ?? "",
      );
      setAdoptionSaved(true);
      onUpdate?.();
      setTimeout(() => {
        handleClose();
      }, 900);
    } catch (e) {
      setAdoptionError(e instanceof Error ? e.message : "Failed to save score.");
    } finally {
      setAdoptionSaving(false);
    }
  };

  if (!adoptionKpiDef) return null;

  return (
    <Modal
      open={open}
      modalHeading={adoptionKpiDef.label}
      modalLabel={`Product Checkpoint — ${product.productName}`}
      primaryButtonText={adoptionSaving ? "Saving…" : "Save Checkpoint"}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={adoptionSaving || adoptionSaved || parsedAdoptionScore === null}
      onRequestClose={handleClose}
      onRequestSubmit={handleAdoptionSave}
      size="md"
      onClick={(e) => e.stopPropagation()}
      style={{ zIndex: 9999 }}
    >
      <p
        style={{
          color: "var(--cds-text-secondary)",
          marginTop: 0,
          marginBottom: "1rem",
          fontSize: "0.875rem",
        }}
      >
        {adoptionKpiDef.description}
      </p>

      {adoptionKpiDef.scoringGuidance && (
        <KPIScoringGuidance
          guidance={adoptionKpiDef.scoringGuidance}
          selectedRange={adoptionBand}
          onBandSelect={handleAdoptionBandSelect}
        />
      )}

      <div style={{ marginBottom: "1rem" }}>
        <div style={{ width: "120px" }}>
          <NumberInput
            id={`product-adoption-score-${product.productId}`}
            label="Score (0 – 10)"
            min={0}
            max={10}
            step={0.1}
            value={adoptionInputRaw}
            onChange={(_e: any, { value }: any) =>
              setAdoptionInputRaw(typeof value === "number" ? String(value) : (value ?? ""))
            }
            placeholder="e.g. 7.2"
          />
        </div>
        {latestAdoption !== null && (
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--cds-text-secondary)",
              marginTop: "0.4rem",
              marginBottom: 0,
            }}
          >
            Last recorded: <strong>{Math.round(latestAdoption.value * 10)}/100</strong>
            {latestAdoption.date ? ` on ${latestAdoption.date}` : ""}
          </p>
        )}
      </div>

      <TextArea
        id={`product-adoption-notes-${product.productId}`}
        labelText="Notes (optional)"
        rows={2}
        value={adoptionNotes}
        onChange={(e) => {
          console.log("📝 TextArea onChange triggered:", {
            newValue: e.target.value,
            currentValue: adoptionNotes,
            eventType: e.type,
          });
          setAdoptionNotes(e.target.value);
        }}
        placeholder="Add context or observations…"
        style={{ marginBottom: "0.5rem" }}
      />

      {adoptionSaved && (
        <InlineNotification
          kind="success"
          title="Checkpoint saved"
          subtitle={`${adoptionKpiDef.label}: ${parsedAdoptionScore !== null ? kpiValueToPercent(parsedAdoptionScore) : ""}`}
          hideCloseButton
          style={{ marginTop: "0.75rem" }}
        />
      )}
      {adoptionError && (
        <InlineNotification
          kind="error"
          title="Save failed"
          subtitle={adoptionError}
          hideCloseButton
          style={{ marginTop: "0.75rem" }}
        />
      )}
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProductPortfolioHealth({
  client,
  onUpdate,
}: {
  client: Client;
  onUpdate?: () => void;
}) {
  const { isDemoLive, effectiveRole, effectiveEditAccess } = useDemoData();
  const { viewMode } = useViewMode();
  const { user } = useAuth();
  const [activeProduct, setActiveProduct] = useState<(typeof client.productPortfolio)[0] | null>(
    null,
  );
  const [showAdoptionModal, setShowAdoptionModal] = useState(false);
  const [showAdoptionTrend, setShowAdoptionTrend] = useState(false);
  const [productHealthScores, setProductHealthScores] = useState<
    Map<string, { percent: number; status: string }>
  >(new Map());

  const canRecord = effectiveRole === "delivery" && viewMode === "internal" && effectiveEditAccess;

  // ── EC-product boxes, for clients sourced from Clarizen ────────────────────
  // A sample client carries a hand-maintained productPortfolio; a real one does
  // not, and its products come from the Clarizen → OCC mapping instead. The
  // portfolio wins when present, so sample clients behave exactly as before.
  const [ecProducts, setEcProducts] = useState<EcProductBox[] | null>(null);
  const [ecRemoved, setEcRemoved] = useState<RemovedProduct[]>([]);
  const [ecCanVerify, setEcCanVerify] = useState(false);
  const [cspProducts, setCspProducts] = useState<string[]>([]);
  const [editBox, setEditBox] = useState<EcProductBox | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [removeBox, setRemoveBox] = useState<EcProductBox | null>(null);
  const useEcBoxes = usesEcProducts(client);

  /**
   * EC products as ProductHealth entries, so they render through exactly the
   * same tile and detail modal as a sample client's portfolio.
   *
   * Only the name is real. status "Good" matches how a portfolio row with no
   * status recorded already renders, and leaving liveIntegration undefined is
   * what makes every metric resolve to the standard "No data" empty state.
   */
  const ecPortfolio = useMemo(
    () =>
      (ecProducts ?? []).map((e) => ({
        // id comes from the server so scores are read and written under the
        // same key — deriving it again here is how the two drift apart.
        productId: e.productId,
        productName: e.productName,
        // carried so the tile can find its box without matching on name,
        // which a rename would break.
        ecCode: e.code,
        status: "Good" as const,
        description: "",
        // Attaching the history is what makes a recorded score display; without
        // it the modal reports "Score pending" no matter what was saved.
        adoptionKpiConfig:
          e.adoptionHistory.length > 0
            ? { kpiId: "product_adoption", history: e.adoptionHistory }
            : undefined,
      })),
    [ecProducts],
  );

  /** The portfolio actually rendered: hand-maintained if present, else EC. */
  const portfolio = useEcBoxes ? ecPortfolio : client.productPortfolio;

  /** Verification state by product name; empty for a sample client. */
  const verificationByCode = useMemo(
    () => new Map((ecProducts ?? []).map((e) => [e.code, e])),
    [ecProducts],
  );

  // Health scores for whatever portfolio is on screen. Keyed by product NAME,
  // so an EC product picks up Health Check Tool data whenever the tool holds
  // records under that name — the tile then shows a real score instead of
  // "No data" with no extra wiring.
  const portfolioKey = portfolio.map((p) => p.productName).join("|");
  useEffect(() => {
    let cancelled = false;
    const fetchAllHealthScores = async () => {
      const scores = new Map<string, { percent: number; status: string }>();
      for (const productName of portfolioKey ? portfolioKey.split("|") : []) {
        const healthKpis = await getProductHealthKpis(client.clientId, productName);
        const healthCalculation = calculateProductHealth(healthKpis);
        if (healthCalculation.hasData) {
          scores.set(productName, {
            percent: healthCalculation.healthPercent,
            status: healthCalculation.status,
          });
        }
      }
      if (!cancelled) setProductHealthScores(scores);
    };
    void fetchAllHealthScores();
    return () => {
      cancelled = true;
    };
  }, [client.clientId, portfolioKey]);

  /**
   * Identity headers.
   *
   * With SSO on, the signed session cookie carries identity and these are
   * ignored. With SSO off (static login) there is no cookie, so the server has
   * nothing to go on unless they are sent — and it answers `canVerify: false`,
   * which silently hides the Verify button. Every call to this API needs them,
   * reads included.
   */
  const identityHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (user?.email) h["x-cp-email"] = user.email;
    if (user?.name) h["x-cp-name"] = user.name;
    return h;
  }, [user?.email, user?.name]);

  useEffect(() => {
    if (!useEcBoxes) {
      setEcProducts(null);
      return;
    }
    let cancelled = false;
    setEcProducts(null);
    apiFetch(`/api/demo/product-verification/${encodeURIComponent(client.clientId)}`, {
      headers: identityHeaders,
    })
      .then((r) => (r.ok ? (r.json() as Promise<ProductBoxesPayload>) : null))
      .catch(() => null)
      .then((d) => {
        if (cancelled) return;
        setEcProducts(d?.products ?? []);
        setEcRemoved(d?.removed ?? []);
        setEcCanVerify(d?.canVerify ?? false);
      });
    return () => {
      cancelled = true;
    };
  }, [client.clientId, useEcBoxes, identityHeaders]);

  // Product names offered when adding a product by hand. Same list the Contract
  // tab uses; the source is expected to change, so it is fetched, not derived.
  useEffect(() => {
    if (!useEcBoxes) return;
    let cancelled = false;
    apiFetch("/api/demo/csp-products")
      .then((r) => (r.ok ? (r.json() as Promise<{ products?: string[] }>) : null))
      .catch(() => null)
      .then((d) => {
        if (!cancelled) setCspProducts(d?.products ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [useEcBoxes]);

  /** Re-read EC boxes — used after a score is recorded so it shows immediately. */
  const reloadEcProducts = async () => {
    if (!useEcBoxes) return;
    try {
      const r = await fetch(
        `/api/demo/product-verification/${encodeURIComponent(client.clientId)}`,
        { headers: identityHeaders },
      );
      if (!r.ok) return;
      const d = (await r.json()) as ProductBoxesPayload;
      if (d.products) setEcProducts(d.products);
      if (d.removed) setEcRemoved(d.removed);
    } catch {
      /* leaving the previous list in place is better than clearing it */
    }
  };

  const [verifyBusy, setVerifyBusy] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  /**
   * Every product mutation goes through one call — verify, unverify, add,
   * remove, restore — and the server's reply replaces local state wholesale,
   * so the UI never has to reason about what the change implied.
   */
  const runProductAction = async (
    action: ProductAction,
    opts: { code?: string; productName?: string } = {},
  ) => {
    setVerifyBusy(opts.code ?? "__add__");
    setVerifyError(null);
    try {
      const res = await fetch(
        `/api/demo/product-verification/${encodeURIComponent(client.clientId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...identityHeaders },
          body: JSON.stringify({ action, ...opts }),
        },
      );
      const data = (await res.json()) as ProductBoxesPayload & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setEcProducts(data.products ?? []);
      setEcRemoved(data.removed ?? []);
      setEcCanVerify(data.canVerify ?? false);
      setEditBox(null);
      setAddOpen(false);
      setRemoveBox(null);
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setVerifyBusy(null);
    }
  };

  return (
    <section className="cp-section">
      <h2 className="cp-section-title" style={{ fontWeight: 700 }}>Active Product Integrations</h2>

      {/* Clarizen-sourced client: one box per EC product. */}
      {verifyError && (
        <InlineNotification
          kind="error"
          title="Verification failed"
          subtitle={verifyError}
          lowContrast
          onCloseButtonClick={() => setVerifyError(null)}
          style={{ marginBottom: "0.75rem" }}
        />
      )}

      {useEcBoxes && ecProducts !== null && ecProducts.length === 0 && (
        <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary, #525252)" }}>
          No EC products identified for this client.
        </p>
      )}

      {/* One grid for both sources — a sample client's hand-maintained
          portfolio, or the EC products of a Clarizen-sourced client. */}
      <div className="cp-kpi-grid">
        {portfolio.map((p) => {
          const box = verificationByCode.get((p as { ecCode?: string }).ecCode ?? "");
          const display = resolveProductDisplay(p, isDemoLive);
          const checks = display.checksDisplay;

          // Get calculated health score from state (if available)
          const healthScore = productHealthScores.get(p.productName);
          const calculatedHealthPercent = healthScore?.percent ?? 0;
          const calculatedStatus = healthScore?.status ?? p.status;

          // Show "No data" if no health check data exists
          const pct = healthScore ? Math.round(calculatedHealthPercent) : LIVE_NO_DATA;

          return (
            <ClickableTile
              key={p.productId ?? p.productName}
              onClick={() => setActiveProduct(p)}
              style={{ minHeight: 140, display: "flex", flexDirection: "column" }}
              title={`Click to view details for ${p.productName}`}
            >
              {/* Category / label row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div className="cp-kpi-category" style={{ fontWeight: 600 }}>
                  {p.productName}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    color: getStatusColor(calculatedStatus as any),
                  }}
                >
                  <HeartIcon color={getStatusColor(calculatedStatus as any)} />
                  <span style={{ fontSize: "0.75rem", fontWeight: 400 }}>
                    {pct}
                    {typeof pct === "number" ? "%" : ""}
                  </span>
                </div>
              </div>

              {/* Status tag, with the verification pill alongside for EC products */}
              <div
                style={{
                  marginTop: "0.5rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                {getStatusTag(calculatedStatus as any)}
                {box && <ProductVerificationPill status={box.status} />}
              </div>

              {/* Health check count */}
              <div className="cp-kpi-score" style={{ marginTop: "0.5rem" }}>
                {checks.value}
                <span className="cp-kpi-unit">{checks.unit}</span>
              </div>

              {box && (
                <>
                  <div style={{ flex: 1 }} />
                  {box.status === "verified" && box.verifiedByName && (
                    <div
                      style={{
                        fontSize: "0.6875rem",
                        color: "var(--cds-text-secondary, #525252)",
                      }}
                    >
                      Verified by {box.verifiedByName}
                      {formatVerifiedAt(box.verifiedAt) && ` · ${formatVerifiedAt(box.verifiedAt)}`}
                    </div>
                  )}
                  <ProductBoxActions
                    box={box}
                    busy={verifyBusy === box.code}
                    onEdit={() => setEditBox(box)}
                    onRemove={() => setRemoveBox(box)}
                    onUnverify={() => void runProductAction("unverify", { code: box.code })}
                  />
                </>
              )}
            </ClickableTile>
          );
        })}

        {/* Add a product that never came through automatically. */}
        {useEcBoxes && ecCanVerify && ecProducts !== null && (
          <AddProductTile onClick={() => setAddOpen(true)} />
        )}
      </div>

      {useEcBoxes && ecCanVerify && (
        <RemovedProductsBar
          removed={ecRemoved}
          busy={verifyBusy}
          onRestore={(code) => void runProductAction("restore", { code })}
        />
      )}

      <EditAndVerifyModal
        box={editBox}
        open={editBox !== null}
        saving={verifyBusy === editBox?.code}
        onClose={() => setEditBox(null)}
        onSave={(code, productName) => void runProductAction("verify", { code, productName })}
      />

      <ConfirmRemoveModal
        box={removeBox}
        open={removeBox !== null}
        saving={verifyBusy === removeBox?.code}
        onClose={() => setRemoveBox(null)}
        onConfirm={(code) => void runProductAction("remove", { code })}
      />

      <AddProductModal
        open={addOpen}
        saving={verifyBusy === "__add__"}
        products={cspProducts}
        onClose={() => setAddOpen(false)}
        onSave={(productName) => void runProductAction("add", { productName })}
      />

      {/* Detail modal */}
      <ProductDetailModal
        product={activeProduct}
        client={client}
        isDemoLive={isDemoLive}
        canRecord={canRecord}
        onClose={() => setActiveProduct(null)}
        onUpdate={onUpdate}
        onOpenAdoptionModal={() => setShowAdoptionModal(true)}
        onOpenAdoptionTrend={() => setShowAdoptionTrend(true)}
      />

      {/* Product Adoption Modals - rendered outside to avoid z-index issues */}
      {activeProduct && (
        <>
          <ProductAdoptionModal
            open={showAdoptionModal}
            product={activeProduct}
            client={client}
            onClose={() => setShowAdoptionModal(false)}
            onUpdate={() => {
              // EC boxes carry their own adoption history, so they need an
              // explicit re-read — the client payload refresh does not cover them.
              void reloadEcProducts();
              onUpdate?.();
            }}
          />
          <ProductAdoptionTrendDrawer
            open={showAdoptionTrend}
            product={activeProduct}
            canRecord={canRecord}
            onClose={() => setShowAdoptionTrend(false)}
            onOpenScoreModal={() => {
              setShowAdoptionTrend(false);
              setShowAdoptionModal(true);
            }}
          />
        </>
      )}
    </section>
  );
}
