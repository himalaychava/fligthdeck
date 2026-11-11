import type { CaseAnalysis } from "@/server/aiInsightsService";

interface Props { analysis: CaseAnalysis; }

export function InsightsSummaryBar({ analysis }: Props) {
  const topByTotal = analysis.top5ByTotal[0];
  const topBySev1 = analysis.top5BySev1[0];

  const tiles = [
    {
      label: "Top Product by Cases",
      value: topByTotal?.productName ?? "—",
      sub: topByTotal ? `${topByTotal.totalCases} cases` : "",
      color: "#0f62fe",
    },
    {
      label: "Top Product by Sev1",
      value: topBySev1?.sev1Cases ? topBySev1.productName : "None",
      sub: topBySev1?.sev1Cases ? `${topBySev1.sev1Cases} Sev1 case(s)` : "No Sev1 cases",
      color: topBySev1?.sev1Cases ? "#da1e28" : "#198038",
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1px", background: "#e0e0e0", marginBottom: "1.5rem" }}>
      {tiles.map((t) => (
        <div key={t.label} style={{ background: "#ffffff", padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#525252", marginBottom: "0.4rem" }}>
            {t.label}
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, color: t.color, marginBottom: "0.25rem", lineHeight: 1.2 }}>
            {t.value}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#525252", lineHeight: 1.4 }}>{t.sub}</div>
        </div>
      ))}
    </div>
  );
}
