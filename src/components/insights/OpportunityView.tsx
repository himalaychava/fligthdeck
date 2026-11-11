import { Tag, Tile } from "@carbon/react";
import type { CaseAnalysis, InsightResult } from "@/server/aiInsightsService";
import type { EcEngagement } from "@/server/caseDataReader";

/**
 * EC/EM engagements, one row per Clarizen project. A product commonly spans
 * several work orders, so the Product Name cell is merged across its projects
 * (same grouped presentation as the Offerings table).
 */
function EcEngagementsTable({ engagements }: { engagements: EcEngagement[] }) {
  // Rows arrive sorted by product; map each group-start index -> group size.
  const groupSizes = new Map<number, number>();
  let groupStart = 0;
  for (let i = 1; i <= engagements.length; i++) {
    if (i === engagements.length || engagements[i].productName !== engagements[groupStart].productName) {
      groupSizes.set(groupStart, i - groupStart);
      groupStart = i;
    }
  }

  const cell = { padding: "0.625rem 0.75rem", verticalAlign: "middle" as const };

  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: "4px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
        <thead>
          <tr style={{ background: "#f4f4f4", borderBottom: "2px solid #e0e0e0" }}>
            {["Product Name", "Project Name", "Work Order Number", "UTL30 Code"].map((h) => (
              <th key={h} style={{
                padding: "0.6rem 0.75rem", textAlign: "left", fontWeight: 600,
                fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "#525252",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {engagements.map((e, i) => {
            const groupSize = groupSizes.get(i) ?? 0;
            const isGroupStart = groupSize > 0;
            const isGroupEnd =
              i === engagements.length - 1 || engagements[i + 1].productName !== e.productName;
            return (
              <tr
                key={`${e.utl30Code}-${e.workOrderNumber}-${i}`}
                style={{
                  background: "#ffffff",
                  borderBottom: isGroupEnd ? "2px solid #e0e0e0" : "1px solid #eef0f2",
                }}
              >
                {isGroupStart && (
                  <td rowSpan={groupSize} style={{
                    ...cell, fontWeight: 600, color: "#0e6027", verticalAlign: "top",
                    borderLeft: "3px solid #198038", borderRight: "1px solid #eef0f2",
                  }}>
                    {e.productName}
                    {groupSize > 1 && (
                      <span style={{
                        display: "inline-block", fontSize: "0.6875rem", fontWeight: 600,
                        color: "#0e6027", background: "#defbe6", borderRadius: "10px",
                        padding: "0.05rem 0.5rem", marginTop: "0.35rem",
                      }}>
                        {groupSize} projects
                      </span>
                    )}
                  </td>
                )}
                <td style={{ ...cell, color: "#161616" }}>{e.projectName || "—"}</td>
                <td style={{ ...cell, fontFamily: "monospace", color: "#0f62fe", whiteSpace: "nowrap" }}>
                  {e.workOrderNumber || "—"}
                </td>
                <td style={{ ...cell, fontFamily: "monospace", color: "#525252", whiteSpace: "nowrap" }}>
                  {e.utl30Code || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  analysis: CaseAnalysis;
  opportunityInsight: InsightResult | null;
  loading?: boolean;
}

export function OpportunityView({ analysis }: Props) {
  const allNonEc = analysis.opportunities.filter((o) => !o.isEC);

  // Sort non-EC products by total cases descending and limit to top 10 products only
  const top10NonEc = [...allNonEc]
    .sort((a, b) => b.totalCases - a.totalCases)
    .slice(0, 10);

  // Build a lookup from productName → ProductStat for fallback details
  const statLookup = new Map(analysis.productStats.map((p) => [p.productName, p]));

  return (
    <Tile style={{ padding: "1.5rem", marginBottom: "1.25rem", borderLeft: "4px solid #0f62fe" }}>

      {/* ── Header ──────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f62fe", margin: 0 }}>
            {analysis.clientName} — Product Support &amp; Subscription Opportunity View
          </h2>
          {analysis.customerId && (
            <span style={{
              fontSize: "0.75rem", fontWeight: 700, color: "#ffffff",
              background: "#0f62fe", borderRadius: "2px",
              padding: "0.2rem 0.6rem", letterSpacing: "0.06em",
            }}>
              ID: {analysis.customerId}
            </span>
          )}
        </div>
        <p style={{ fontSize: "0.8125rem", color: "#525252", margin: 0 }}>
          Based on {analysis.totalCases} support cases · {analysis.sev1Cases} Sev1 · {analysis.openCases.length} open · {analysis.closedCases.length} resolved
        </p>
      </div>

      {/* ── Service categories (e.g. Essential Management Service) ───────────── */}
      {(analysis.serviceCategories ?? []).map((s) => (
        <div key={s.label} style={{ marginBottom: "1.25rem" }}>
          <h4 style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a3ffc", marginBottom: "0.5rem" }}>
            🟣 Service Category — {s.label}
          </h4>
          <div style={{
            background: "#f6f2ff", border: "1px solid #e8daff", borderLeft: "4px solid #8a3ffc",
            borderRadius: "4px", padding: "1rem 1.25rem",
            display: "flex", alignItems: "center", gap: "1.5rem 2.5rem", flexWrap: "wrap",
          }}>
            <div style={{ minWidth: "14rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: "#6929c4" }}>{s.label}</span>
                <Tag size="sm" type="purple" style={{ margin: 0 }}>Service category</Tag>
              </div>
              {s.sourceNames.length > 0 && (
                <div style={{ fontSize: "0.75rem", color: "#6f6f6f", marginTop: "0.25rem" }}>
                  CSP product name: {s.sourceNames.join(", ")}
                </div>
              )}
            </div>
            {[
              { label: "Total Cases", value: s.totalCases, color: "#161616" },
              { label: "Sev 1", value: s.sev1Cases, color: s.sev1Cases > 0 ? "#da1e28" : "#161616" },
              { label: "Open", value: s.openCases, color: "#161616" },
              { label: "Resolved", value: s.closedCases, color: "#161616" },
            ].map((m) => (
              <div key={m.label}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6929c4" }}>
                  {m.label}
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
            <p style={{ flexBasis: "100%", fontSize: "0.8125rem", color: "#525252", margin: 0 }}>
              These cases are included in the account totals above but are not treated as a product, so they are
              excluded from the EC/EM, Non-EC, offering and upgrade breakdowns below.
            </p>
          </div>
        </div>
      ))}

      {/* ── EC Products reference (from Clarizen via OCC) ─────────────────────── */}
      <div style={{ marginBottom: "1.25rem" }}>
        <h4 style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#198038", marginBottom: "0.5rem" }}>
          ✅ EC/EM Products for Customer ID {analysis.customerId || "(unknown)"}
        </h4>
        {analysis.ecEngagements && analysis.ecEngagements.length > 0 ? (
          <EcEngagementsTable engagements={analysis.ecEngagements} />
        ) : analysis.ecProducts.length > 0 ? (
          // Fallback for cached/older analyses saved before ecEngagements existed.
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {analysis.ecProducts.map((p) => (
              <span key={p} style={{
                fontSize: "0.8125rem", background: "#defbe6", color: "#0e6027",
                border: "1px solid #a7f0ba", borderRadius: "2px", padding: "0.2rem 0.6rem", fontWeight: 500,
              }}>{p}</span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: "0.8125rem", color: "#525252", fontStyle: "italic", margin: 0 }}>
            No EC/EM products found in Clarizen data for this customer ID. Upload Clarizen &amp; OCC data from the Admin panel.
          </p>
        )}
      </div>

      {/* ── Non-EC Expansion Opportunities (Top 10) ─────────────────────────────── */}
      {top10NonEc.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <h4 style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#da1e28", marginBottom: "0.5rem" }}>
            🔴 Non-EC Products — Expansion Opportunities ({allNonEc.length > 10 ? `Top 10 of ${allNonEc.length}` : allNonEc.length})
          </h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ background: "#f4f4f4" }}>
                {["Product", "Division", "Segment", "Total Cases", "Sev 1", "Sev 2", "Sev 3", "Sev 4"].map((h) => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "#525252" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top10NonEc.map((o) => {
                const stat = statLookup.get(o.productName);
                const div = o.division || stat?.division || "—";
                const seg = o.segment || stat?.segment || "—";
                const s1 = o.sev1Cases ?? stat?.sev1Cases ?? 0;
                const s2 = o.sev2Cases ?? stat?.sev2Cases ?? 0;
                const s3 = o.sev3Cases ?? stat?.sev3Cases ?? 0;
                const s4 = o.sev4Cases ?? stat?.sev4Cases ?? 0;

                return (
                  <tr key={o.productName} style={{ borderBottom: "1px solid #e0e0e0", verticalAlign: "middle", background: "#fffbfb" }}>
                    <td style={{ padding: "0.625rem 0.75rem", fontWeight: 600, color: "#161616" }}>{o.productName}</td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "#525252" }}>{div}</td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "#525252" }}>{seg}</td>
                    <td style={{ padding: "0.625rem 0.75rem", fontWeight: 700, color: "#161616" }}>{o.totalCases}</td>
                    <td style={{ padding: "0.625rem 0.75rem", color: s1 > 0 ? "#da1e28" : "#161616", fontWeight: s1 > 0 ? 700 : 400 }}>
                      {s1}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: s2 > 0 ? "#ff8300" : "#161616", fontWeight: s2 > 0 ? 600 : 400 }}>
                      {s2}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "#161616" }}>
                      {s3}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "#161616" }}>
                      {s4}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {top10NonEc.length === 0 && (
        <div style={{ background: "#defbe6", border: "1px solid #a7f0ba", padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.8125rem", color: "#0e6027" }}>
          ✓ All products found in CSP for this customer are already covered under EC/EM. No expansion gaps identified.
        </div>
      )}

    </Tile>
  );
}
