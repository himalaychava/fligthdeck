import { Button, ClickableTile, Tag } from "@carbon/react";
import { ChartLineSmooth, ArrowUp, ArrowDown, Subtract, Edit } from "@carbon/icons-react";
import { useState, useEffect } from "react";
import {
  scoreStatus,
  kpiValueToPercent,
  type KPIDefinition,
} from "@/data/kpiLibrary";
import type { Client, ClientKPIConfig } from "@/data/clients";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/demo-integration/DemoDataContext";
import { getOverviewKpiDefinitions } from "@/lib/kpiTierRules";
import { KPISelector } from "./KPISelector";
import { KPIScoreEntry } from "./KPIScoreEntry";
import { KPITrendDrawer } from "./KPITrendDrawer";
import { getProductHealthKpis } from "@/services/productHealthKpiService";
import { calculateProductHealth } from "@/lib/productHealthCalculator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function latest(c: ClientKPIConfig | undefined) {
  if (!c || !c.history.length) return null;
  const sorted = [...c.history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  return sorted[sorted.length - 1];
}

function previous(c: ClientKPIConfig | undefined) {
  if (!c || c.history.length < 2) return null;
  const sorted = [...c.history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  return sorted[sorted.length - 2];
}

/**
 * Compute Product Adoption average from per-product adoptionKpiConfig.
 * Returns null if no product scores have been recorded.
 */
function computeProductAdoptionAvg(client: Client): number | null {
  const latestScores = client.productPortfolio
    .map((p) => latest(p.adoptionKpiConfig)?.value ?? null)
    .filter((v): v is number => v !== null);
  if (!latestScores.length) return null;
  const avg = latestScores.reduce((a, b) => a + b, 0) / latestScores.length;
  return Math.round(avg * 100) / 100; // 2dp
}

const tagTypeMap: Record<string, "green" | "blue" | "magenta" | "red" | "gray"> = {
  excellent: "green",
  good: "blue",
  watch: "magenta",
  critical: "red",
  pending: "gray",
};

// ─── Standard KPI Tile ────────────────────────────────────────────────────────

function KPITile({
  kpi,
  config,
  canRecord,
  onOpen,
  onRecord,
}: {
  kpi: KPIDefinition;
  config?: ClientKPIConfig;
  canRecord: boolean;
  onOpen: () => void;
  onRecord: () => void;
}) {
  const cur = latest(config);
  const prev = previous(config);
  const value = cur?.value ?? null;
  const status = scoreStatus(kpi, value);

  let trendIcon = <Subtract size={14} />;
  let trendColor = "var(--cds-text-secondary)";
  let trendDelta: string | null = null;
  if (cur && prev) {
    const up = cur.value > prev.value;
    const flat = cur.value === prev.value;
    const good = kpi.lowerIsBetter ? !up : up;
    trendIcon = flat ? <Subtract size={14} /> : up ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
    trendColor = flat
      ? "var(--cds-text-secondary)"
      : good
        ? "var(--cds-support-success)"
        : "var(--cds-support-error)";
    // Show delta in percentage points
    const deltaPp = Math.abs(cur.value - prev.value) * 10;
    trendDelta = `${deltaPp % 1 === 0 ? deltaPp.toFixed(0) : deltaPp.toFixed(1)}`;
  }

  return (
    <div style={{ position: "relative" }}>
      <ClickableTile
        onClick={onOpen}
        style={{
          minHeight: 140,
          display: "flex",
          flexDirection: "column",
        }}
        title={kpi.description}
      >
        {/* Trend indicator */}
        {value !== null && (
          <div
            className="cp-kpi-trend"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              color: trendColor,
              minHeight: "1.25rem",
            }}
          >
            {trendIcon}
            {trendDelta && <span style={{ fontSize: "0.75rem", marginLeft: "0.25rem" }}>{trendDelta}</span>}
          </div>
        )}

        {/* Score / Pending */}
        {value === null ? (
          <div style={{ marginTop: "1rem", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
            Score pending — first checkpoint not yet recorded
          </div>
        ) : (
          <>
            <div className="cp-kpi-score">
              {kpi.kpiId === 'csat' ? `${value}/10` : kpiValueToPercent(value)}
            </div>
            <div>
              <Tag type={tagTypeMap[status]} size="sm" style={{ margin: 0 }}>
                {status.toUpperCase()}
              </Tag>
            </div>
          </>
        )}

        <div style={{ marginTop: "auto", paddingTop: "0.5rem", fontSize: "0.875rem" }}>
          {kpi.label}
        </div>
      </ClickableTile>

      {/* Carbon styled icon-only Button for recording checkpoint */}
      {canRecord && (
        <div
          style={{
            position: "absolute",
            bottom: "0.5rem",
            right: "0.5rem",
            zIndex: 3,
            width: "32px",
            height: "32px",
            border: "1px solid #0f62fe",
            borderRadius: "4px",
            backgroundColor: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Button
            hasIconOnly
            renderIcon={Edit}
            iconDescription="Record Checkpoint"
            tooltipPosition="top"
            kind="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRecord();
            }}
            style={{
              minWidth: "28px",
              minHeight: "28px",
              width: "28px",
              height: "28px",
              color: "#0f62fe",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Grid ────────────────────────────────────────────────────────────────

export function KPIWidgetGrid({
  client,
  onUpdate,
  readOnlyReport = false,
}: {
  client: Client;
  onUpdate?: () => void;
  /** Hides Configure / Record actions (full PDF report). */
  readOnlyReport?: boolean;
}) {
  const { viewMode } = useViewMode();
  const { user } = useAuth();
  const { effectiveRole, effectiveEditAccess } = useDemoData();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [activeKpi, setActiveKpi] = useState<KPIDefinition | null>(null);
  const [recordingKpi, setRecordingKpi] = useState<KPIDefinition | null>(null);

  const canConfigure =
    !readOnlyReport && effectiveRole === "delivery" && viewMode === "internal" && effectiveEditAccess;
  const canRecord =
    !readOnlyReport && effectiveRole === "delivery" && viewMode === "internal" && effectiveEditAccess;

  const visibleKpis = getOverviewKpiDefinitions(client, viewMode);

  if (client.tier === "Free") {
    return (
      <section className="cp-section">
        <h2 className="cp-section-title">Key Performance Indicators</h2>
        <div className="cp-kpi-tile pending" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "var(--cds-text-secondary)", margin: 0 }}>
            KPI tracking is not available for Free tier accounts.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="cp-section">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h2 className="cp-section-title" style={{ margin: 0 }}>
          Key Performance Indicators
        </h2>
        {canConfigure && (
          <Button kind="tertiary" size="sm" onClick={() => setSelectorOpen(true)}>
            Configure KPIs
          </Button>
        )}
      </div>

      {visibleKpis.length === 0 ? (
        <div className="cp-kpi-tile pending" style={{ textAlign: "center", padding: "3rem" }}>
          <ChartLineSmooth size={32} />
          <h3 style={{ margin: "1rem 0 0.25rem", fontWeight: 400 }}>No KPIs configured yet</h3>
          <p style={{ color: "var(--cds-text-secondary)", margin: "0 0 1rem" }}>
            Mandatory KPIs appear automatically. Delivery TAM can add rotational KPIs from
            Configure KPIs.
          </p>
          {canConfigure && (
            <Button kind="primary" size="sm" onClick={() => setSelectorOpen(true)}>
              Configure KPIs
            </Button>
          )}
        </div>
      ) : (
        <div className="cp-kpi-grid">
          {visibleKpis.map((kpi) => {
            const cfg = (client.kpiConfig ?? []).find((c) => c.kpiId === kpi.kpiId);

            return (
              <KPITile
                key={kpi.kpiId}
                kpi={kpi}
                config={cfg}
                canRecord={canRecord && kpi.kpiId !== "product_adoption"}
                onOpen={() => setActiveKpi(kpi)}
                onRecord={() => setRecordingKpi(kpi)}
              />
            );
          })}
        </div>
      )}

      {/* Configure KPIs selector */}
      <KPISelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        client={client}
        onUpdate={onUpdate}
      />

      {/* Single-KPI score entry modal */}
      {recordingKpi && (
        <KPIScoreEntry
          open={!!recordingKpi}
          onClose={() => setRecordingKpi(null)}
          client={client}
          kpi={recordingKpi}
          onUpdate={onUpdate}
        />
      )}

      {/* KPI trend / history drawer */}
      <KPITrendDrawer kpi={activeKpi} client={client} onClose={() => setActiveKpi(null)} />
    </section>
  );
}
