import { Tile, Tag } from "@carbon/react";
import type { Client } from "@/data/clients";
import { useViewMode } from "@/contexts/ViewModeContext";

const SEV: Record<string, "green" | "blue" | "magenta" | "red"> = {
  Low: "green", Medium: "magenta", High: "red", Critical: "red",
};

export function RiskIntervention({ client }: { client: Client }) {
  const { viewMode } = useViewMode();
  if (viewMode === "external") return null;
  if (!client.risks.length) return null;

  return (
    <section className="cp-section">
      <h2 className="cp-section-title">Risk &amp; Intervention</h2>
      <Tile style={{ padding: "1rem" }}>
        {client.risks.map((r, i) => (
          <div key={i} className="cp-risk-card">
            <div className="cp-risk-severity">
              <Tag type={SEV[r.severity]}>{r.severity.toUpperCase()}</Tag>
            </div>
            <p style={{ margin: 0, paddingRight: "5rem" }}>{r.description}</p>
            <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--cds-border-subtle)" }}>
              <div className="cp-metric-label">Mitigation</div>
              <p style={{ margin: "0.25rem 0 0.75rem" }}>{r.mitigation}</p>
              <Tag type="outline">Likelihood: {r.likelihood}%</Tag>
              <Tag type="outline">Impact: {r.impact}%</Tag>
              <Tag type="cool-gray">Risk Score: {r.riskScore}</Tag>
            </div>
          </div>
        ))}
      </Tile>
    </section>
  );
}