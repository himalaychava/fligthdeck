import { Tile, Tag } from "@carbon/react";
import type { Client } from "@/data/clients";
import { useViewMode } from "@/contexts/ViewModeContext";

export function CommercialSnapshot({ client }: { client: Client }) {
  const { viewMode } = useViewMode();
  const internalOnly = viewMode !== "external";
  const cs = client.commercialSnapshot;

  return (
    <section className="cp-section">
      <h2 className="cp-section-title">Commercial Snapshot</h2>
      <Tile style={{ padding: "1.5rem" }}>
        <div className="cp-metric-row" style={{ borderTop: "none", paddingTop: 0 }}>
          <div><div className="cp-metric-label">ARR</div><div className="cp-metric-value">{cs.arr}</div></div>
          <div><div className="cp-metric-label">Renewal Date</div><div className="cp-metric-value">{cs.renewalDate}</div></div>
          <div><div className="cp-metric-label">Days to Renewal</div><div className="cp-metric-value">{cs.daysToRenewal}</div></div>
          {internalOnly && (
            <div><div className="cp-metric-label">Renewal Confidence</div><div className="cp-metric-value">{cs.renewalConfidence}</div></div>
          )}
          {internalOnly && (
            <div><div className="cp-metric-label">Expansion Pipeline</div><div className="cp-metric-value">{cs.expansionPipeline}</div></div>
          )}
        </div>
      </Tile>
    </section>
  );
}