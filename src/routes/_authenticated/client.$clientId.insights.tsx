import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { InlineLoading, InlineNotification, Tag, Button } from "@carbon/react";
import { Renew, Save, CheckmarkFilled, Filter } from "@carbon/icons-react";
import { PageReportHeader } from "@/components/layout/PageReportHeader";
import { useLiveOverviewClient } from "@/demo-integration/useLiveOverviewClient";
import { InsightsSummaryBar } from "@/components/insights/InsightsSummaryBar";
import { InsightCard } from "@/components/insights/InsightCard";
import { OpportunityView } from "@/components/insights/OpportunityView";
import { OfferingsSection } from "@/components/insights/OfferingsSection";
import { UpgradesSection } from "@/components/insights/UpgradesSection";
import { ConfigurableInsights } from "@/components/insights/ConfigurableInsights";
import { DateRangeModal, type DateRangeFilter } from "@/components/insights/DateRangeModal";
import { useAuth } from "@/contexts/AuthContext";
import { getImpersonatedEmail } from "@/lib/impersonation";
import type { CaseAnalysis, InsightResult, InsightType, LongResolutionProductGroup } from "@/server/aiInsightsService";
import type { CaseDateFilter } from "@/server/caseDataReader";
import { apiFetch } from "@/lib/apiFetch";
import { ISC_CLOUD_OPPORTUNITY_NOTE } from "@/constants/insightsNotes";

export const Route = createFileRoute("/_authenticated/client/$clientId/insights")({
  component: InsightsPage,
});

export interface InsightsApiResponse {
  hasCaseData: boolean;
  noSoftwareCases?: boolean;
  clientId: string;
  analysis?: CaseAnalysis;
  aiInsights?: Record<InsightType, InsightResult>;
  // Present only when loaded from saved cache
  savedAt?: string;
  generatedBy?: string;
  hasSaved?: boolean;
  // Date filter that was applied when generating
  dateFilter?: {
    openFrom?: string;
    openTo?: string;
    closeFrom?: string;
    closeTo?: string;
    hwSwSaas?: string;
  } | null;
  // Actual date range of the cases used
  dataRange?: {
    earliest: string;
    latest: string;
    totalCases: number;
  };
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchSavedInsights(clientId: string): Promise<InsightsApiResponse> {
  const res = await apiFetch(`/api/demo/insights/${encodeURIComponent(clientId)}/saved`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load saved insights");
  return res.json() as Promise<InsightsApiResponse>;
}

async function fetchFreshInsights(clientId: string, dateFilter?: CaseDateFilter): Promise<InsightsApiResponse> {
  const params = new URLSearchParams();
  if (dateFilter?.openFrom)  params.set("openFrom",  dateFilter.openFrom);
  if (dateFilter?.openTo)    params.set("openTo",    dateFilter.openTo);
  if (dateFilter?.closeFrom) params.set("closeFrom", dateFilter.closeFrom);
  if (dateFilter?.closeTo)   params.set("closeTo",   dateFilter.closeTo);
  if (dateFilter?.hwSwSaas)  params.set("hwSwSaas",  dateFilter.hwSwSaas);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await apiFetch(`/api/demo/insights/${encodeURIComponent(clientId)}${qs}`, { cache: "no-store" });
  if (!res.ok) {
    const e = await res.json() as { error?: string };
    throw new Error(e.error ?? "Failed to generate insights");
  }
  return res.json() as Promise<InsightsApiResponse>;
}

async function saveInsights(clientId: string, data: InsightsApiResponse, generatedBy: string): Promise<string> {
  const res = await apiFetch(`/api/demo/insights/${encodeURIComponent(clientId)}/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      hasCaseData: true,
      analysis: data.analysis,
      aiInsights: data.aiInsights,
      generatedBy,
      dateFilter: data.dateFilter ?? null,
      dataRange: data.dataRange ?? null,
    }),
  });
  if (!res.ok) throw new Error("Save failed");
  const body = await res.json() as { savedAt: string };
  return body.savedAt;
}

// ─── Parse helpers ────────────────────────────────────────────────────────────

function parseSev1Insights(aiText: string | null): Record<string, string> {
  if (!aiText) return {};
  try {
    const arr = JSON.parse(aiText) as { product: string; insight: string }[];
    return Object.fromEntries(arr.map((r) => [r.product.toLowerCase(), r.insight]));
  } catch { return {}; }
}

function parsePainPointInsights(aiText: string | null): Record<string, { signal: string; insight: string }> {
  if (!aiText) return {};
  try {
    const arr = JSON.parse(aiText) as { product: string; signal: string; insight: string }[];
    return Object.fromEntries(arr.map((r) => [r.product.toLowerCase(), { signal: r.signal, insight: r.insight }]));
  } catch { return {}; }
}

// ─── Long Resolution Cases sub-component ──────────────────────────────────────

function fmtDateShort(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function LongResolutionGroup({ group }: { group: LongResolutionProductGroup }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: "0.875rem", border: "1px solid #e0e0e0", borderLeft: "3px solid #da1e28" }}>
      {/* Product header row — clickable to toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.5rem 0.75rem", background: "#fff8f8", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "#161616" }}>
          {group.productName}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{
            background: "#fff1f1", color: "#da1e28", border: "1px solid #ffd7d9",
            padding: "0.15rem 0.5rem", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 600,
          }}>
            {group.caseCount} case{group.caseCount !== 1 ? "s" : ""}
          </span>
          <span style={{ fontSize: "0.75rem", color: "#6f6f6f" }}>{expanded ? "▲ hide" : "▼ show"}</span>
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0.6rem 0.75rem", background: "#fcfcfc" }}>
          <div style={{ fontSize: "0.75rem", color: "#da1e28", fontWeight: 600, marginBottom: "0.5rem" }}>
            Showing top {Math.min(5, group.cases.length)} cases taking more than 30 days to resolve:
          </div>
          <div style={{ overflowX: "auto", border: "1px solid #e0e0e0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ background: "#f4f4f4", borderBottom: "1px solid #e0e0e0" }}>
                  {["Case Number", "Status", "Days Open", "Open Date", "Close Date"].map((h) => (
                    <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "#525252", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.cases.slice(0, 5).map((c) => (
                  <tr key={c.caseNumber} style={{ borderBottom: "1px solid #f4f4f4" }}>
                    <td style={{ padding: "0.45rem 0.75rem", fontWeight: 500, color: "#0f62fe", fontFamily: "monospace", fontSize: "0.8rem" }}>
                      {c.caseNumber}
                    </td>
                    <td style={{ padding: "0.45rem 0.75rem" }}>
                      <span style={{
                        background: c.isStillOpen ? "#fff8e1" : "#e8f5e9",
                        color: c.isStillOpen ? "#b45309" : "#1b5e20",
                        border: `1px solid ${c.isStillOpen ? "#fde68a" : "#a5d6a7"}`,
                        padding: "0.1rem 0.45rem", borderRadius: "10px", fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap",
                      }}>
                        {c.isStillOpen ? "🔴 Open" : "✅ Closed"} — {c.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.45rem 0.75rem", fontWeight: 700, color: c.resolutionDays > 90 ? "#da1e28" : c.resolutionDays > 60 ? "#b45309" : "#161616" }}>
                      {c.resolutionDays} days
                    </td>
                    <td style={{ padding: "0.45rem 0.75rem", color: "#525252", whiteSpace: "nowrap" }}>{fmtDateShort(c.openDate)}</td>
                    <td style={{ padding: "0.45rem 0.75rem", color: "#525252", whiteSpace: "nowrap" }}>{c.closeDate ? fmtDateShort(c.closeDate) : "Still open"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function InsightsPage() {
  const { clientId } = Route.useParams();
  const { client, isLoading: clientLoading } = useLiveOverviewClient(clientId, 0);
  const { user } = useAuth();

  const [data, setData] = useState<InsightsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("Loading saved insights…");
  const [error, setError] = useState<string | null>(null);

  // Source of currently displayed data
  const [isSaved, setIsSaved] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [generatedBy, setGeneratedBy] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Date range filter modal + active filter + actual data range
  const [showDateModal, setShowDateModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<DateRangeFilter | null>(null);
  const [dataRange, setDataRange] = useState<InsightsApiResponse["dataRange"] | null>(null);

  // Helper — apply response data to all relevant state
  const applyResponse = useCallback((resp: InsightsApiResponse) => {
    setData(resp);
    // Restore date filter from response (present on both fresh and saved)
    const f = resp.dateFilter;
    setActiveFilter(f && (f.openFrom || f.openTo || f.closeFrom || f.closeTo || f.hwSwSaas) ? {
      openFrom:  f.openFrom  ?? "",
      openTo:    f.openTo    ?? "",
      closeFrom: f.closeFrom ?? "",
      closeTo:   f.closeTo   ?? "",
      hwSwSaas:  f.hwSwSaas  ?? "",
    } : null);
    setDataRange(resp.dataRange ?? null);
  }, []);

  // ── Load saved on mount ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadingMsg("Loading saved insights…");
    setError(null);
    setData(null);
    setIsSaved(false);
    setSavedAt(null);
    setActiveFilter(null);
    setDataRange(null);

    fetchSavedInsights(clientId)
      .then((saved) => {
        if (cancelled) return;
        if (saved.hasSaved && saved.analysis && (saved.hasCaseData !== false)) {
          applyResponse(saved);
          setIsSaved(true);
          setSavedAt(saved.savedAt ?? null);
          setGeneratedBy(saved.generatedBy ?? null);
        } else {
          // No saved data — auto-generate fresh (no filter on first load)
          setLoadingMsg("Generating AI insights… this may take up to 60 seconds.");
          return fetchFreshInsights(clientId).then((fresh) => {
            if (cancelled) return;
            applyResponse(fresh);
            setIsSaved(false);
          });
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clientId, applyResponse]);

  // ── Called after user picks dates in the modal ────────────────────────────
  const runGenerate = useCallback(async (filter: DateRangeFilter) => {
    setShowDateModal(false);
    const hasFilter = !!(filter.openFrom || filter.openTo || filter.closeFrom || filter.closeTo);
    setLoading(true);
    setLoadingMsg("Generating AI insights… Bob is analysing the selected case data.");
    setError(null);
    setIsSaved(false);
    setSavedAt(null);
    setSaveSuccess(false);
    try {
      const fresh = await fetchFreshInsights(clientId, hasFilter ? filter : undefined);
      applyResponse(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }, [clientId, applyResponse]);

  // ── Regenerate — opens date range modal ──────────────────────────────────
  const handleRegenerate = useCallback(() => {
    setShowDateModal(true);
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!data?.analysis) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const ts = await saveInsights(clientId, data, user?.email ?? "");
      setSavedAt(ts);
      setIsSaved(true);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [clientId, data, user?.email]);

  if (clientLoading || !client) return <InlineLoading description="Loading client…" />;

  // ── Top-right action bar (shown when data is present) ─────────────────────
  const actionBar = data?.hasCaseData && !loading ? (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
      {/* Saved status */}
      {isSaved && savedAt && (
        <span style={{ fontSize: "0.75rem", color: "#525252" }}>
          Saved {new Date(savedAt).toLocaleString()}
          {generatedBy && ` by ${generatedBy}`}
        </span>
      )}
      {saveSuccess && (
        <span style={{ fontSize: "0.75rem", color: "#198038", display: "flex", alignItems: "center", gap: 3 }}>
          <CheckmarkFilled size={14} /> Saved
        </span>
      )}
      {/* Save button — only when showing fresh unsaved data */}
      {!isSaved && !saving && (
        <Button kind="tertiary" size="sm" renderIcon={Save} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Insights"}
        </Button>
      )}
      {isSaved && !saving && (
        <Button kind="ghost" size="sm" renderIcon={Save} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Again"}
        </Button>
      )}
      {/* Regenerate button — opens date picker modal */}
      <Button kind="primary" size="sm" renderIcon={Renew} onClick={handleRegenerate} disabled={loading}>
        Regenerate Insights
      </Button>
    </div>
  ) : null;

  return (
    <PageReportHeader title="Insights" pageSlug="insights" client={client} trailing={actionBar}>

      {/* Date range picker modal */}
      {showDateModal && (
        <DateRangeModal
          clientName={client.clientName}
          onGenerate={runGenerate}
          onCancel={() => setShowDateModal(false)}
        />
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: "3rem 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          <InlineLoading description={loadingMsg} status="active" />
          <p style={{ fontSize: "0.8125rem", color: "#525252" }}>
            {loadingMsg.includes("Bob") ? "Bob is reading the case data and writing analysis. Please wait." : ""}
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <InlineNotification kind="error" title="Failed to load insights" subtitle={error} lowContrast hideCloseButton />
      )}

      {/* No software cases — client exists in CSP but only has Hardware/SaaS cases */}
      {!loading && !error && data && !data.hasCaseData && data.noSoftwareCases && (
        <InlineNotification
          kind="warning"
          title="No software cases found in CSP data for this client"
          subtitle="This client has cases in the CSP data but none are classified as Software. Insights are generated for Software cases only."
          lowContrast
          hideCloseButton
        />
      )}

      {/* No case data at all — client not found in CSP */}
      {!loading && !error && data && !data.hasCaseData && !data.noSoftwareCases && (
        <InlineNotification
          kind="info"
          title="No case data available for this client yet"
          subtitle="Case data is mapped via CMR number. Upload the latest Salesforce CSP export from the Admin panel."
          lowContrast
          hideCloseButton
        />
      )}

      {/* ISC Cloud note — pinned below the app header so it stays visible
          while scrolling through the opportunity sections. */}
      {!loading && !error && data?.hasCaseData && data.analysis && (
        <div style={{
          position: "sticky", top: getImpersonatedEmail() ? "5.5rem" : "3.5rem", zIndex: 50,
          marginBottom: "1rem", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.18)",
        }}>
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={ISC_CLOUD_OPPORTUNITY_NOTE.title}
            style={{ maxWidth: "100%", margin: 0 }}
          >
            {/* Rendered as children — Carbon's `subtitle` only accepts a string. */}
            <span className="cds--inline-notification__subtitle">
              {ISC_CLOUD_OPPORTUNITY_NOTE.body}{" "}
              <code style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8125rem", fontWeight: 600,
                color: "#0043ce", background: "none", padding: 0, whiteSpace: "nowrap",
              }}>
                {ISC_CLOUD_OPPORTUNITY_NOTE.tag}
              </code>.
            </span>
          </InlineNotification>
        </div>
      )}

      {/* Data range banner — always shown when data is present */}
      {!loading && !error && data?.hasCaseData && dataRange && (() => {
        /** Convert YYYY-MM-DD → dd/mm/yyyy for display. Passes through anything else. */
        function fmtDate(d: string | null | undefined): string {
          if (!d) return "";
          const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
        }
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            background: activeFilter ? "#e8f1ff" : "#f4f4f4",
            border: "1px solid",
            borderColor: activeFilter ? "#a6c8ff" : "#e0e0e0",
            borderLeft: `4px solid ${activeFilter ? "#0f62fe" : "#6f6f6f"}`,
            padding: "0.5rem 0.875rem", marginBottom: "1rem",
            fontSize: "0.8125rem",
            color: activeFilter ? "#0043ce" : "#525252",
          }}>
            <Filter size={16} />
            <span>
              {activeFilter ? (
                <>
                  <strong>Filters applied —</strong>{" "}
                  {activeFilter.hwSwSaas && <><strong>{activeFilter.hwSwSaas}</strong> only{(activeFilter.openFrom || activeFilter.openTo) && " · "}</>}
                  {activeFilter.openFrom && <>open from <strong>{fmtDate(activeFilter.openFrom)}</strong></>}
                  {activeFilter.openFrom && activeFilter.openTo && " → "}
                  {activeFilter.openTo && <strong>{fmtDate(activeFilter.openTo)}</strong>}
                  {(activeFilter.openFrom || activeFilter.openTo) && (activeFilter.closeFrom || activeFilter.closeTo) && " · "}
                  {activeFilter.closeFrom && <>close from <strong>{fmtDate(activeFilter.closeFrom)}</strong></>}
                  {activeFilter.closeFrom && activeFilter.closeTo && " → "}
                  {activeFilter.closeTo && <strong>{fmtDate(activeFilter.closeTo)}</strong>}
                  {" · "}
                </>
              ) : (
                <><strong>All available data —</strong>{" "}</>
              )}
              Showing <strong>{dataRange.totalCases}</strong> cases
              {dataRange.earliest && dataRange.latest && (
                <> with open dates <strong>{fmtDate(dataRange.earliest)}</strong> → <strong>{fmtDate(dataRange.latest)}</strong></>
              )}
            </span>
          </div>
        );
      })()}

      {/* Saved badge */}
      {!loading && !error && data?.hasCaseData && isSaved && savedAt && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          background: "#defbe6", border: "1px solid #a7f0ba",
          padding: "0.5rem 0.875rem", marginBottom: "1rem",
          fontSize: "0.8125rem", color: "#0e6027",
        }}>
          <CheckmarkFilled size={16} />
          <span>
            Showing saved insights from <strong>{new Date(savedAt).toLocaleString()}</strong>
            {generatedBy && <> · generated by <strong>{generatedBy}</strong></>}.
            {" "}Click <strong>Regenerate Insights</strong> to get fresh analysis from Bob.
          </span>
        </div>
      )}

      {/* Main insights */}
      {!loading && !error && data?.hasCaseData && data.analysis && (
        <div>
          {/* ── Customer ID + EC/Non-EC Reference Panel ─────────────────────────────── */}
          {data.analysis.customerId && (
            <div style={{
              background: "#f4f9ff",
              border: "1px solid #d0e2ff",
              borderLeft: "4px solid #0f62fe",
              padding: "1rem 1.25rem",
              marginBottom: "1.25rem",
              display: "grid",
              gridTemplateColumns: data.analysis.serviceCategories.length > 0 ? "auto 1fr 1fr 1fr" : "auto 1fr 1fr",
              gap: "1.25rem 2rem",
              alignItems: "start",
            }}>
              {/* Customer ID badge */}
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0f62fe", marginBottom: "0.25rem" }}>
                  Customer ID
                </div>
                <div style={{
                  fontSize: "1.25rem", fontWeight: 700, color: "#0f62fe",
                  background: "#ffffff", border: "2px solid #0f62fe",
                  borderRadius: "2px", padding: "0.2rem 0.75rem", display: "inline-block",
                  letterSpacing: "0.04em",
                }}>
                  {data.analysis.customerId}
                </div>
              </div>

              {/* EC Products from Clarizen */}
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#198038", marginBottom: "0.35rem" }}>
                  EC/EM Products (Clarizen → OCC)
                </div>
                {data.analysis.ecProducts.length > 0 ? (
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {data.analysis.ecProducts.map((p) => (
                      <span key={p} style={{
                        fontSize: "0.75rem", background: "#defbe6", color: "#0e6027",
                        border: "1px solid #a7f0ba", borderRadius: "2px", padding: "0.1rem 0.5rem",
                        fontWeight: 500,
                      }}>{p}</span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: "0.8125rem", color: "#525252", fontStyle: "italic" }}>None found in Clarizen/OCC</span>
                )}
              </div>

              {/* Non-EC Products from CSP */}
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#da1e28", marginBottom: "0.35rem" }}>
                  Non-EC Products in CSP (Expansion Candidates) ({data.analysis.nonEcProducts.length})
                </div>
                {data.analysis.nonEcProducts.length > 0 ? (
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {data.analysis.nonEcProducts.map((p) => (
                      <span key={p} style={{
                        fontSize: "0.75rem", background: "#fff1f1", color: "#da1e28",
                        border: "1px solid #ffd7d9", borderRadius: "2px", padding: "0.1rem 0.5rem",
                        fontWeight: 500,
                      }}>{p}</span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: "0.8125rem", color: "#198038", fontStyle: "italic" }}>All CSP products are EC-covered ✓</span>
                )}
              </div>

              {/* Service categories (e.g. Essential Management Service) — not products */}
              {data.analysis.serviceCategories.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a3ffc", marginBottom: "0.35rem" }}>
                    Service Category (Not a Product)
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {data.analysis.serviceCategories.map((s) => (
                      <span key={s.label} style={{
                        fontSize: "0.75rem", background: "#f6f2ff", color: "#6929c4",
                        border: "1px solid #e8daff", borderRadius: "2px", padding: "0.1rem 0.5rem",
                        fontWeight: 500,
                      }}>{s.label} · {s.totalCases} case{s.totalCases !== 1 ? "s" : ""}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <InsightsSummaryBar analysis={data.analysis} />

          <InsightCard
            title="Account Case Summary"
            aiText={data.aiInsights?.summary?.aiText ?? null}
            aiAvailable={data.aiInsights?.summary?.aiAvailable ?? false}
          >
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: "0.8125rem" }}>
              <span><strong>{data.analysis.totalCases}</strong> total cases</span>

              <span><strong style={{ color: "#da1e28" }}>{data.analysis.sev1Cases}</strong> Sev1</span>
              <span><strong style={{ color: "#f1c21b" }}>{data.analysis.openCases.length}</strong> open</span>
              <span><strong style={{ color: "#198038" }}>{data.analysis.closedCases.length}</strong> resolved</span>
            </div>
          </InsightCard>

          <InsightCard
            title="Sev1 Closed Cases per Product"
            aiText={null}
            aiAvailable={data.aiInsights?.sev1?.aiAvailable ?? false}
          >
            {(() => {
              const sev1Map = parseSev1Insights(data.aiInsights?.sev1?.aiText ?? null);
              const sev1Products = data.analysis.productStats
                .filter((p) => p.sev1Cases > 0)
                .sort((a, b) => b.sev1Cases - a.sev1Cases)
                .slice(0, 5);
              return (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ background: "#f4f4f4" }}>
                      {["Product", "Sev1 Raised", "Sev1 Closed", "AI Observation"].map((h) => (
                        <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "#525252" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sev1Products.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: "0.75rem", color: "#525252", fontStyle: "italic" }}>No Sev1 cases recorded for this period.</td></tr>
                    ) : sev1Products.map((p) => (
                      <tr key={p.productName} style={{ borderBottom: "1px solid #f4f4f4" }}>
                        <td style={{ padding: "0.5rem 0.75rem", fontWeight: 500 }}>{p.productName}</td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "#da1e28", fontWeight: 600 }}>{p.sev1Cases}</td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>{Math.min(p.sev1Cases, p.closedCases)}</td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "#525252", fontStyle: sev1Map[p.productName.toLowerCase()] ? "normal" : "italic" }}>
                          {sev1Map[p.productName.toLowerCase()] ?? (data.aiInsights?.sev1?.aiAvailable === false ? "AI unavailable" : "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </InsightCard>

          <InsightCard
            title="Pain Points — Top 5 Products with Frequent Incidents"
            aiText={null}
            aiAvailable={false}
          >
            {(() => {
              return (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ background: "#f4f4f4" }}>
                      {["#", "Product", "Total Cases", "Sev 1", "Sev 2", "Sev 3", "Sev 4"].map((h) => (
                        <th key={h} style={{ padding: "0.4rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "#525252" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.analysis.top5ByTotal.map((p, i) => {
                      return (
                        <tr key={p.productName} style={{ borderBottom: "1px solid #f4f4f4" }}>
                          <td style={{ padding: "0.5rem 0.75rem", color: "#8d8d8d" }}>{i + 1}</td>
                          <td style={{ padding: "0.5rem 0.75rem", fontWeight: 500 }}>{p.productName}</td>
                          <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>{p.totalCases}</td>
                          <td style={{ padding: "0.5rem 0.75rem", color: p.sev1Cases > 0 ? "#da1e28" : "#161616", fontWeight: p.sev1Cases > 0 ? 600 : 400 }}>{p.sev1Cases}</td>
                          <td style={{ padding: "0.5rem 0.75rem", color: p.sev2Cases > 0 ? "#ff8300" : "#161616", fontWeight: p.sev2Cases > 0 ? 600 : 400 }}>{p.sev2Cases ?? 0}</td>
                          <td style={{ padding: "0.5rem 0.75rem", color: "#161616" }}>{p.sev3Cases ?? 0}</td>
                          <td style={{ padding: "0.5rem 0.75rem", color: "#161616" }}>{p.sev4Cases ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </InsightCard>

          {/* ── Long Resolution Cases (> 30 days) ── */}
          {(() => {
            const groups: LongResolutionProductGroup[] = data.analysis.longResolutionCases ?? [];
            const totalLongCases = groups.reduce((s, g) => s + g.caseCount, 0);
            return (
              <InsightCard
                title="Top 5 Cases per Product based on Resolution Time > 30 Days"
                aiText={null}
                aiAvailable={false}
              >
                {totalLongCases === 0 ? (
                  <div style={{ fontSize: "0.8125rem", color: "#198038", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    ✅ No cases found with resolution time exceeding 30 days.
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: "0.75rem", fontSize: "0.8125rem", color: "#525252" }}>
                      <strong style={{ color: "#da1e28" }}>{totalLongCases}</strong> case{totalLongCases !== 1 ? "s" : ""} across{" "}
                      <strong>{groups.length}</strong> product{groups.length !== 1 ? "s" : ""} have taken or are taking more than 30 days to resolve.
                      <span style={{ color: "#8d8d8d", marginLeft: "0.5rem" }}>(Showing top 5 products. Expanding a product displays its top 5 longest-running cases.)</span>
                    </div>
                    {groups.slice(0, 5).map((group) => (
                      <LongResolutionGroup key={group.productName} group={group} />
                    ))}
                  </div>
                )}
              </InsightCard>
            );
          })()}

          <OpportunityView
            analysis={data.analysis}
            opportunityInsight={data.aiInsights?.opportunity ?? null}
            loading={false}
          />

          <OfferingsSection analysis={data.analysis} />

          <UpgradesSection analysis={data.analysis} />

          <ConfigurableInsights analysis={data.analysis} />
        </div>
      )}
    </PageReportHeader>
  );
}
