import { Tile } from "@carbon/react";
import type { CaseAnalysis, UpgradeCandidate } from "@/server/aiInsightsService";

interface Props {
  analysis: CaseAnalysis;
}

/** Badge palette per lifecycle status — red for Expired, amber for Expiring Soon. */
const STATUS_STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  Expired: { bg: "#fff1f1", fg: "#a2191f", border: "#da1e28" },
  "Expiring Soon": { bg: "#fef7dc", fg: "#8a6d00", border: "#f1c21b" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.Expired;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.6875rem",
        fontWeight: 600,
        color: s.fg,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: "10px",
        padding: "0.1rem 0.5rem",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

const cell = { padding: "0.625rem 0.75rem", verticalAlign: "middle" as const };
const headCell = {
  padding: "0.6rem 0.75rem",
  textAlign: "left" as const,
  fontWeight: 600,
  fontSize: "0.6875rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  color: "#525252",
};

/**
 * One upgrade table. Rendered twice — EC products first as the priority list,
 * then Non-EC. Rows arrive pre-sorted with each product's versions contiguous,
 * so the Product Name cell merges across them via rowSpan while the table stays
 * flat for static and exported reports.
 */
function UpgradeTable({
  title,
  blurb,
  rows,
  accent,
}: {
  title: string;
  blurb: string;
  rows: UpgradeCandidate[];
  accent: string;
}) {
  const groupSizes = new Map<number, number>();
  let groupStart = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i === rows.length || rows[i].productName !== rows[groupStart].productName) {
      groupSizes.set(groupStart, i - groupStart);
      groupStart = i;
    }
  }

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ marginBottom: "0.5rem" }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: accent }}>
          {title} <span style={{ fontWeight: 400, color: "#6f6f6f" }}>({rows.length})</span>
        </div>
        <div style={{ fontSize: "0.75rem", color: "#6f6f6f" }}>{blurb}</div>
      </div>

      <div style={{ border: "1px solid #e0e0e0", borderRadius: "4px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ background: "#f4f4f4", borderBottom: "2px solid #e0e0e0" }}>
              {[
                "Product Name",
                "Product Version",
                "Status",
                "End of Support",
                "Division",
                "Segment",
              ].map((h) => (
                <th key={h} style={headCell}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const groupSize = groupSizes.get(i) ?? 0;
              const isGroupStart = groupSize > 0;
              const isGroupEnd = i === rows.length - 1 || rows[i + 1].productName !== r.productName;
              const bg = r.isMultiVersion ? "#fff8e1" : "#ffffff";
              return (
                <tr
                  key={`${r.productName}-${r.productVersion}-${i}`}
                  style={{
                    background: bg,
                    borderBottom: isGroupEnd ? "2px solid #e0e0e0" : "1px solid #eef0f2",
                  }}
                >
                  {isGroupStart && (
                    <td
                      rowSpan={groupSize}
                      style={{
                        ...cell,
                        fontWeight: 600,
                        color: "#161616",
                        verticalAlign: "top",
                        borderLeft: r.isMultiVersion
                          ? "3px solid #f1c21b"
                          : "3px solid transparent",
                        borderRight: "1px solid #eef0f2",
                      }}
                    >
                      {r.productName}
                      <div
                        style={{
                          marginTop: "0.35rem",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.3rem",
                        }}
                      >
                        {r.isMultiVersion && (
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                              color: "#8a6d00",
                              background: "#fef7dc",
                              borderRadius: "10px",
                              padding: "0.05rem 0.5rem",
                            }}
                          >
                            {groupSize} versions
                          </span>
                        )}
                        {/* Saved insights persist the whole analysis object, so a
                            file written before this field existed has it undefined —
                            read defensively rather than crashing the page. */}
                        {(r.hiddenSupportedVersions ?? []).length > 0 && (
                          <span
                            title={`Also on: ${(r.hiddenSupportedVersions ?? []).join(", ")} — Supported, no action needed`}
                            style={{
                              display: "inline-block",
                              fontSize: "0.6875rem",
                              fontWeight: 500,
                              color: "#0e6027",
                              background: "#e6f4ec",
                              border: "1px dashed #a7d6b8",
                              borderRadius: "10px",
                              padding: "0.05rem 0.5rem",
                              cursor: "help",
                            }}
                          >
                            +{(r.hiddenSupportedVersions ?? []).length} more (Supported)
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  <td
                    style={{
                      ...cell,
                      fontFamily: "monospace",
                      color: "#161616",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.productVersion}
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    <StatusBadge status={r.lifecycleStatus} />
                  </td>
                  <td style={{ ...cell, color: "#525252", whiteSpace: "nowrap" }}>
                    {r.endOfSupport || "—"}
                  </td>
                  <td style={{ ...cell, color: "#525252" }}>{r.division || "—"}</td>
                  <td style={{ ...cell, color: "#525252" }}>{r.segment || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Products whose support status could not be determined.
 *
 * Deliberately free of internal detail — which catalog entry was tried, and why
 * it didn't fit, is an admin concern and appears in the admin panel instead.
 * The reader gets the product, the version, and one clear next action.
 */
function UnmappedTable({ rows }: { rows: CaseAnalysis["unmappedProducts"] }) {
  const c = { padding: "0.4rem 0.75rem", verticalAlign: "middle" as const };
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div
        style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6f6f6f", marginBottom: "0.4rem" }}
      >
        Not checked ({rows.length})
      </div>
      <div style={{ border: "1px solid #e0e0e0", borderRadius: "4px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
          <thead>
            <tr style={{ background: "#f4f4f4", borderBottom: "1px solid #e0e0e0" }}>
              {["Product Name", "Product Version", "Status"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "0.4rem 0.75rem",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: "0.625rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#525252",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.productName}-${r.productVersion}-${i}`}
                style={{ borderBottom: "1px solid #eef0f2" }}
              >
                <td style={{ ...c, fontWeight: 600, color: "#161616" }}>{r.productName}</td>
                <td
                  style={{ ...c, fontFamily: "monospace", color: "#525252", whiteSpace: "nowrap" }}
                >
                  {r.productVersion}
                </td>
                <td style={{ ...c, color: "#6f6f6f" }}>
                  Could not be checked for support status — not found in the lifecycle catalog.
                  Contact Admin to add a mapping.
                  {/* Only shown when a specific catalog entry would resolve the
                      row, so the admin has somewhere to start rather than a
                      search across 4,000+ names. */}
                  {r.alternativeProductName && (
                    <div style={{ fontSize: "0.6875rem", color: "#8d8d8d", marginTop: "0.2rem" }}>
                      Suggested: {r.alternativeProductName}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UpgradesSection({ analysis }: Props) {
  const all = analysis.upgradeCandidates ?? [];
  const unmapped = analysis.unmappedProducts ?? [];
  const ecRows = all.filter((r) => r.isEC);
  const nonEcRows = all.filter((r) => !r.isEC);

  // Nothing actionable and no data gap to report — the section has nothing to say.
  if (all.length === 0 && unmapped.length === 0) return null;

  return (
    <Tile style={{ padding: "1.5rem", marginBottom: "1.25rem", borderLeft: "4px solid #f1c21b" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#8a6d00", margin: 0 }}>Upgrade Opportunities</h2>
      </div>

      {all.length === 0 && (
        <div style={{ fontSize: "0.8125rem", color: "#525252", marginBottom: "1rem" }}>
          No upgrade opportunities identified for this client at this time.
        </div>
      )}

      {ecRows.length > 0 && (
        <UpgradeTable
          title="EC Products"
          blurb="Already under Expert Care — an upgrade conversation with an existing engagement."
          rows={ecRows}
          accent="#0e6027"
        />
      )}

      {nonEcRows.length > 0 && (
        <UpgradeTable
          title="Non EC Products"
          blurb="Not currently under contract — a new opportunity requiring a different approach."
          rows={nonEcRows}
          accent="#0043ce"
        />
      )}

      {unmapped.length > 0 && <UnmappedTable rows={unmapped} />}
    </Tile>
  );
}
