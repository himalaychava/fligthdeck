import { TierTag } from "@/components/shared/TierTag";
import { TIER_FEATURE_ENABLED } from "@/constants/tierFeature";
import type { Client } from "@/data/clients";

export function CurrentAccountBadge({ client }: { client: Client }) {
  return (
    <div style={{ 
      display: "flex", 
      alignItems: "center", 
      gap: "0.5rem",
      padding: "0.5rem 0.75rem",
      background: "var(--cds-layer-01)",
      borderRadius: "4px",
      border: "1px solid var(--cds-border-subtle)"
    }}>
      <span style={{ 
        fontSize: "0.875rem", 
        color: "var(--cds-text-secondary)",
        fontWeight: 400
      }}>
        Current Account:
      </span>
      <span style={{ 
        fontSize: "0.875rem", 
        color: "var(--cds-text-primary)",
        fontWeight: 600
      }}>
        {client.clientName}
      </span>
      {client.cmrNumber && (
        <span style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "#0f62fe",
          background: "#edf5ff",
          border: "1px solid #d0e2ff",
          borderRadius: "3px",
          padding: "0.1rem 0.45rem",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}>
          {client.cmrNumber}
        </span>
      )}
      {TIER_FEATURE_ENABLED && <TierTag tier={client.tier} />}
    </div>
  );
}

// Made with Bob
