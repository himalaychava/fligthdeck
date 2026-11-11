import { Accordion, AccordionItem, Tag } from "@carbon/react";
import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import type { CaseAnalysis } from "@/server/aiInsightsService";

interface Props { analysis: CaseAnalysis; }

const PIE_COLORS = ["#0f62fe", "#da1e28", "#f1c21b", "#198038", "#8a3ffc", "#0043ce", "#ff832b"];

export function ConfigurableInsights({ analysis }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Data for open vs closed trend per product
  const openClosedData = analysis.productStats.map((p) => ({
    name: p.productName.length > 18 ? p.productName.slice(0, 18) + "…" : p.productName,
    Open: p.openCases,
    Closed: p.closedCases,
  }));

  // Severity per product data (pie-friendly)
  const severityData = analysis.productStats.map((p) => ({
    name: p.productName.length > 18 ? p.productName.slice(0, 18) + "…" : p.productName,
    "Sev1": p.sev1Cases,
    "Non-Sev1": p.totalCases - p.sev1Cases,
  }));

  // Monthly trend
  const monthlyData = analysis.monthlyTrend.map((m) => ({
    month: m.month,
    Cases: m.count,
  }));

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#525252", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
        Additional Insights
      </h3>
      <Accordion>
        {/* 1 — Open vs Closed */}
        <AccordionItem title="Open vs Closed Cases by Product" open={open["openClosed"]}
          onClick={() => setOpen((s) => ({ ...s, openClosed: !s["openClosed"] }))}>
          <div style={{ padding: "1rem 0" }}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={openClosedData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend verticalAlign="top" />
                <Bar dataKey="Closed" fill="#198038" />
                <Bar dataKey="Open" fill="#da1e28" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AccordionItem>

        {/* 2 — Monthly case volume */}
        <AccordionItem title="Monthly Case Volume Trend" open={open["monthly"]}
          onClick={() => setOpen((s) => ({ ...s, monthly: !s["monthly"] }))}>
          <div style={{ padding: "1rem 0" }}>
            {monthlyData.length < 2 ? (
              <p style={{ color: "#525252", fontSize: "0.875rem" }}>Insufficient data for trend — data covers a single month.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="Cases" stroke="#0f62fe" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </AccordionItem>


        {/* 4 — Historical comparison (placeholder — single month data) */}
        <AccordionItem title="Historical Comparison (Month vs Average)" open={open["historical"]}
          onClick={() => setOpen((s) => ({ ...s, historical: !s["historical"] }))}>
          <div style={{ padding: "1rem 0" }}>
            <p style={{ color: "#525252", fontSize: "0.875rem", fontStyle: "italic" }}>
              Historical comparison requires multiple months of case data. As more monthly exports are imported, this chart will show current month vs last month vs 6-month average automatically.
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={severityData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend verticalAlign="top" />
                <Bar dataKey="Sev1" fill="#da1e28" />
                <Bar dataKey="Non-Sev1" fill="#0f62fe" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
