import { useMemo } from "react";
import {
  Modal,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListBody,
  StructuredListRow,
  StructuredListCell,
  InlineNotification,
  Tag,
} from "@carbon/react";
import type { Client } from "@/data/clients";
import { KPI_LIBRARY, kpiValueToPercent } from "@/data/kpiLibrary";
import { TierTag } from "@/components/shared/TierTag";
import { ALL_GEOS, type GeoFilter } from "@/constants/geos";
import { ALL_MARKETS, type MarketFilter } from "@/constants/markets";
import {
  buildKpiClientBreakdown,
  type GlobalKpiAverage,
} from "@/services/globalViewAggregator";

interface GlobalKpiDetailModalProps {
  kpi: GlobalKpiAverage | null;
  clients: Client[];
  geoFilter: GeoFilter;
  marketFilter: MarketFilter;
  onClose: () => void;
}

function formatValue(value: number, kpiId: string): string {
  if (kpiId === "csat") return `${value}/10`;
  return kpiValueToPercent(value);
}

function formatChange(change: number | null, kpiId: string): string {
  if (change == null) return "—";
  const sign = change > 0 ? "+" : "";
  if (kpiId === "csat") return `${sign}${change}/10`;
  // change is on /10 scale — convert delta to percentage points
  const pct = change * 10;
  const formatted = Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1);
  return `${sign}${formatted}%`;
}

/** Returns the scoring band description that best matches the given numeric value. */
function getScoringBandDescription(
  bands: { range: string; description: string }[],
  value: number
): string | null {
  for (const band of bands) {
    const [lo, hi] = band.range.split("-").map(Number);
    if (!Number.isNaN(lo) && !Number.isNaN(hi) && value >= lo && value <= hi) {
      return band.description;
    }
  }
  return null;
}

export function GlobalKpiDetailModal({
  kpi,
  clients,
  geoFilter,
  marketFilter,
  onClose,
}: GlobalKpiDetailModalProps) {
  const def = kpi ? KPI_LIBRARY.find((k) => k.kpiId === kpi.kpiId) : null;

  const clientBreakdown = useMemo(
    () => (kpi ? buildKpiClientBreakdown(clients, kpi.kpiId, geoFilter, marketFilter) : []),
    [clients, kpi, geoFilter, marketFilter]
  );

  if (!kpi || !def) return null;

  const geoLabel = geoFilter === ALL_GEOS ? "all geos" : geoFilter;

  // Scoring guidance — match the portfolio average against the band descriptions
  const bandDescription =
    def.scoringGuidance?.bands
      ? getScoringBandDescription(def.scoringGuidance.bands, kpi.average)
      : null;

  return (
    <Modal
      open
      modalHeading={kpi.label}
      modalLabel={`Portfolio average · ${geoLabel}`}
      passiveModal
      onRequestClose={onClose}
      size="lg"
    >
      <p style={{ color: "var(--cds-text-secondary)", marginTop: 0, marginBottom: "1.5rem" }}>{def.description}</p>

      <KpiSummaryHeader kpi={kpi} bandDescription={bandDescription} />

      <section>
        <h3 style={{ fontSize: "1rem", fontWeight: 400, margin: "0 0 0.75rem" }}>
          Client breakdown ({clientBreakdown.length})
        </h3>
        {clientBreakdown.length === 0 ? (
          <InlineNotification
            kind="info"
            title="No client scores"
            subtitle="No clients in this geo report this KPI."
            hideCloseButton
            lowContrast
          />
        ) : (
          <StructuredListWrapper>
            <StructuredListHead>
              <StructuredListRow head>
                <StructuredListCell head>Client</StructuredListCell>
                <StructuredListCell head>Geo</StructuredListCell>
                <StructuredListCell head>Tier</StructuredListCell>
                <StructuredListCell head>Latest</StructuredListCell>
                <StructuredListCell head>Previous</StructuredListCell>
                <StructuredListCell head>Change</StructuredListCell>
                <StructuredListCell head>Checkpoint</StructuredListCell>
              </StructuredListRow>
            </StructuredListHead>
            <StructuredListBody>
              {clientBreakdown.map((row) => (
                <StructuredListRow key={row.clientId}>
                  <StructuredListCell>
                    <strong>{row.clientName}</strong>
                    {row.notes ? (
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.75rem",
                          color: "var(--cds-text-secondary)",
                          marginTop: "0.25rem",
                        }}
                      >
                        {row.notes}
                      </span>
                    ) : null}
                  </StructuredListCell>
                  <StructuredListCell>{row.geo}</StructuredListCell>
                  <StructuredListCell>
                    <TierTag tier={row.tier} />
                  </StructuredListCell>
                  <StructuredListCell>
                    {formatValue(row.latestValue, kpi.kpiId)}
                  </StructuredListCell>
                  <StructuredListCell>
                    {row.previousValue != null ? formatValue(row.previousValue, kpi.kpiId) : "—"}
                  </StructuredListCell>
                  <StructuredListCell>
                    <Tag
                      size="sm"
                      type={
                        row.change == null
                          ? "gray"
                          : row.change > 0
                            ? "green"
                            : row.change < 0
                              ? "red"
                              : "gray"
                      }
                    >
                      {formatChange(row.change, kpi.kpiId)}
                    </Tag>
                  </StructuredListCell>
                  <StructuredListCell>{row.checkpointDate}</StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>
        )}
      </section>
    </Modal>
  );
}

function KpiSummaryHeader({
  kpi,
  bandDescription,
}: {
  kpi: GlobalKpiAverage;
  bandDescription: string | null;
}) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>

      {/* "CURRENT PORTFOLIO AVERAGE" — small uppercase muted label */}
      <p style={{
        margin: "0 0 0.5rem 0",
        fontSize: "0.75rem",
        fontWeight: 400,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--cds-text-secondary)",
      }}>
        Current Portfolio Average
      </p>

      {/* Big light score number */}
      <p style={{
        margin: "0 0 0.5rem 0",
        fontSize: "3rem",
        fontWeight: 300,
        lineHeight: 1,
        color: "var(--cds-text-primary)",
      }}>
        {formatValue(kpi.average, kpi.kpiId)}
      </p>

      {/* "N clients in scope" */}
      <p style={{
        margin: "0 0 1.5rem 0",
        fontSize: "0.875rem",
        fontWeight: 400,
        color: "var(--cds-text-secondary)",
      }}>
        {kpi.clientCount} client{kpi.clientCount === 1 ? "" : "s"} in scope
      </p>

      {/* Score Guidance grey tile — full width, bold label, plain description */}
      {bandDescription && (
        <div style={{
          background: "#e0e0e0",
          padding: "1rem 1.25rem",
        }}>
          <p style={{
            margin: "0 0 0.4rem 0",
            fontSize: "0.875rem",
            fontWeight: 700,
            color: "var(--cds-text-primary)",
            letterSpacing: "0.02em",
          }}>
            SCORE GUIDANCE
          </p>
          <p style={{
            margin: 0,
            fontSize: "0.875rem",
            fontWeight: 400,
            lineHeight: 1.6,
            color: "var(--cds-text-primary)",
          }}>
            {bandDescription}
          </p>
        </div>
      )}

    </div>
  );
}
