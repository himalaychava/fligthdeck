import { useState, useEffect } from "react";
import {
  Modal, StructuredListWrapper, StructuredListHead, StructuredListBody,
  StructuredListRow, StructuredListCell, InlineNotification,
  Accordion, AccordionItem, Tile,
} from "@carbon/react";
import { Information, ChevronDown, ChevronUp } from "@carbon/icons-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { KPIDefinition } from "@/data/kpiLibrary";
import { kpiValueToPercent } from "@/data/kpiLibrary";
import type { Client } from "@/data/clients";

/**
 * Parse date string in DD/MM/YYYY or YYYY-MM-DD format to timestamp
 */
function parseDateToTimestamp(dateStr: string): number {
  // Handle DD/MM/YYYY format (e.g., "16/06/2026")
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  // Handle YYYY-MM-DD format (e.g., "2026-06-16")
  return new Date(dateStr).getTime();
}

/**
 * Get the scoring band description for a given score value
 */
function getScoreBandDescription(kpi: KPIDefinition, value: number): string | null {
  if (!kpi.scoringGuidance) return null;
  
  // Determine which band the score falls into (1-2, 3-4, 5-6, 7-8, 9-10)
  let bandIndex = -1;
  if (value >= 1 && value < 3) bandIndex = 0;
  else if (value >= 3 && value < 5) bandIndex = 1;
  else if (value >= 5 && value < 7) bandIndex = 2;
  else if (value >= 7 && value < 9) bandIndex = 3;
  else if (value >= 9 && value <= 10) bandIndex = 4;
  
  if (bandIndex === -1 || !kpi.scoringGuidance.bands[bandIndex]) return null;
  
  const band = kpi.scoringGuidance.bands[bandIndex];
  return band.description;
}

export function KPITrendDrawer({
  kpi, client, onClose,
}: { kpi: KPIDefinition | null; client: Client; onClose: () => void }) {
  const [showGuidanceModal, setShowGuidanceModal] = useState(false);
  
  // Reset guidance state when KPI changes
  useEffect(() => {
    setShowGuidanceModal(false);
  }, [kpi?.kpiId]);
  
  if (!kpi) return null;
  const cfg = client.kpiConfig.find((c) => c.kpiId === kpi.kpiId);
  
  // Sort by parsing dates to timestamps for consistent ordering across environments
  const history = cfg
    ? [...cfg.history].sort((a, b) => {
        const dateA = parseDateToTimestamp(a.date);
        const dateB = parseDateToTimestamp(b.date);
        return dateA - dateB;
      })
    : [];

  // Get current score (latest in history)
  const currentScore = history.length > 0 ? history[history.length - 1].value : null;
  const currentScoreDisplay = currentScore !== null
    ? (kpi.kpiId === 'csat' ? `${currentScore}/10` : `${Math.round(currentScore * 10)}/100`)
    : null;
  
  // Get scoring guidance for current score
  const scoreBandDescription = currentScore !== null ? getScoreBandDescription(kpi, currentScore) : null;

  // Calculate dynamic Y-axis domain based on history values starting from 0
  let yDomain: [number, number] = [0, 10];
  if (history.length > 0) {
    const values = history.map((h) => h.value);
    const maxVal = Math.max(...values);
    // pad by 1 score unit (10%) and clamp max to 10
    const padMax = Math.min(10, Math.ceil(maxVal) + 1);
    // Fall back to a min of 2 if max is 0 to show some scale
    yDomain = [0, Math.max(2, padMax)];
  }

  return (
    <Modal
      open
      modalHeading={kpi.label}
      modalLabel={`${kpi.tierLock} · ${kpi.availability}`}
      passiveModal
      onRequestClose={onClose}
      size="lg"
    >
      {/* KPI Description - moved to top, right after heading */}
      <p style={{ color: "var(--cds-text-secondary)", marginTop: "-0.7rem", marginBottom: "1rem" }}>{kpi.description}</p>

      {/* Current Score with Expandable Guidance */}
      {currentScoreDisplay && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>
              Current Score: {currentScoreDisplay}
            </span>
            {scoreBandDescription && (
              <button
                type="button"
                onClick={() => setShowGuidanceModal(!showGuidanceModal)}
                style={{
                  background: "none",
                  border: "none",
                  padding: "0.25rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  color: "var(--cds-link-primary)",
                  fontSize: "0.875rem",
                  fontWeight: 400,
                }}
                aria-label={showGuidanceModal ? "Hide score details" : "Show score details"}
              >
                <Information size={16} />
                <span>{showGuidanceModal ? "Hide" : "Show"} details</span>
                {showGuidanceModal ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </div>
          
          {/* Expandable Score Guidance Tile */}
          {scoreBandDescription && showGuidanceModal && (
            <Tile style={{
              background: "var(--cds-layer-accent)",
              padding: "1rem",
              borderLeft: "4px solid var(--cds-border-interactive)",
            }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <Information size={20} style={{ color: "var(--cds-icon-primary)", flexShrink: 0, marginTop: "0.125rem" }} />
                <div>
                  <p style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    margin: "0 0 0.5rem 0",
                    color: "var(--cds-text-primary)"
                  }}>
                    Score Guidance
                  </p>
                  <p style={{
                    fontSize: "0.875rem",
                    lineHeight: "1.5",
                    margin: 0,
                    color: "var(--cds-text-secondary)"
                  }}>
                    {scoreBandDescription}
                  </p>
                </div>
              </div>
            </Tile>
          )}
        </div>
      )}

      {history.length === 0 ? (
        <InlineNotification kind="info" title="No score history" subtitle="Record a checkpoint to see trends" hideCloseButton />
      ) : (
        <>
          <div style={{ width: "100%", height: 240, marginBottom: "1.5rem" }}>
            <ResponsiveContainer>
              <LineChart data={history} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cds-border-subtle)" />
                <XAxis dataKey="date" stroke="var(--cds-text-secondary)" fontSize={12} />
                <YAxis
                  stroke="var(--cds-text-secondary)"
                  fontSize={12}
                  domain={yDomain}
                  tickFormatter={(v: number) => kpi.kpiId === 'csat' ? `${v}/10` : `${Math.round(v * 10)}%`}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [kpi.kpiId === 'csat' ? `${Number(value)}/10` : kpiValueToPercent(Number(value)), "Score"]}
                  contentStyle={{ background: "var(--cds-layer-02)", borderColor: "var(--cds-border-subtle)" }}
                />
                <Line type="monotone" dataKey="value" stroke="#0f62fe" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

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
              {history.slice().reverse().map((h, i) => (
                <StructuredListRow key={i}>
                  <StructuredListCell>{h.date}</StructuredListCell>
                  <StructuredListCell>
                    {kpi.kpiId === 'csat' ? `${h.value}/10` : `${Math.round(h.value * 10)}/100`}
                  </StructuredListCell>
                  <StructuredListCell>{h.notes ?? "—"}</StructuredListCell>
                  <StructuredListCell>{h.recordedBy ?? "—"}</StructuredListCell>
                </StructuredListRow>
              ))}
            </StructuredListBody>
          </StructuredListWrapper>

          {/* Per-Product Adoption scores accordion for product_adoption KPI */}
          {kpi.kpiId === "product_adoption" && (
            <div style={{ marginTop: "1.5rem" }}>
              <Accordion>
                <AccordionItem title="Per-Product Adoption History">
                  {client.productPortfolio.every((product) => !product.adoptionKpiConfig?.history?.length) ? (
                    <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)", padding: "0.5rem" }}>
                      No per-product scores recorded yet.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {client.productPortfolio
                        .filter((product) => product.adoptionKpiConfig?.history?.length)
                        .map((product) => {
                          // Sort product history by date descending (latest first)
                          const sortedHistory = [...(product.adoptionKpiConfig?.history ?? [])].sort(
                            (a, b) => parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date)
                          );
                          
                          return (
                            <div key={product.productId} style={{ marginBottom: "0.5rem" }}>
                              <h4 style={{
                                fontSize: "0.875rem",
                                fontWeight: 600,
                                marginBottom: "0.5rem",
                                color: "var(--cds-text-primary)"
                              }}>
                                {product.productName}
                              </h4>
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
                                  {sortedHistory.map((h, idx) => (
                                    <StructuredListRow key={idx}>
                                      <StructuredListCell>{h.date}</StructuredListCell>
                                      <StructuredListCell>
                                        {kpi.kpiId === 'csat' ? `${h.value}/10` : `${Math.round(h.value * 10)}/100`}
                                      </StructuredListCell>
                                      <StructuredListCell>{h.notes ?? "—"}</StructuredListCell>
                                      <StructuredListCell>{h.recordedBy ?? "—"}</StructuredListCell>
                                    </StructuredListRow>
                                  ))}
                                </StructuredListBody>
                              </StructuredListWrapper>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </AccordionItem>
              </Accordion>
            </div>
          )}
        </>
      )}

      <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
        {/* SCALABILITY: Connect to GET /api/clients/:id/kpi/:kpiId/history when backend is ready */}
        SCALABILITY: Connect to <code>/api/clients/:id/kpi/{kpi.kpiId}/history</code> when backend is ready.
      </p>
    </Modal>
  );
}