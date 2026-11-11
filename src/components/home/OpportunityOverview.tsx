/**
 * Landing page — consolidated opportunity view for Management and Sales.
 *
 * Everything here reads the saved opportunity summary written by Run Reports
 * (server/opportunitySummary.ts) through access-filtered endpoints. Nothing is
 * calculated in the browser or on page load, and the server — not this
 * component — decides which customers a user may see in charts and files.
 */
import { memo, useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Button,
  Checkbox,
  Dropdown,
  InlineLoading,
  InlineNotification,
  RadioButton,
  RadioButtonGroup,
  SkeletonPlaceholder,
  Tag,
} from "@carbon/react";
import { Download, Collaborate, ServiceDesk, Upgrade, Layers, Filter } from "@carbon/icons-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/apiFetch";

type OpportunityType = "essentialManagement" | "expertiseConnect" | "upgrade";
type ReportKind = OpportunityType | "multi" | "all";

interface Overview {
  available: true;
  generatedAt: string;
  window: { start: string; end: string; lookbackMonths: number } | null;
  thresholds: { essentialManagementSev1Above: number; expertiseConnectCasesAbove: number };
  canFilter: boolean;
  filterOptions: { geo: string; markets: string[] }[];
  divisionOptions: string[];
  totals: Record<OpportunityType, { customers: number; products: number }>;
  top5: Record<OpportunityType, { clientId: string; customerName: string; products: number }[]>;
  byGeo: { geo: string; essentialManagement: number; expertiseConnect: number; upgrade: number }[];
  multiType: { twoOrMore: number; allThree: number };
}

/** One colour per opportunity type — tiles, bars and legend all use these. */
const OPPORTUNITY_COLORS: Record<OpportunityType, { main: string; soft: string; text: string }> = {
  essentialManagement: { main: "#8a3ffc", soft: "#f6f2ff", text: "#6929c4" },
  expertiseConnect: { main: "#009d9a", soft: "#d9fbfb", text: "#005d5d" },
  upgrade: { main: "#d02670", soft: "#fff0f7", text: "#9f1853" },
};

const TYPE_META: Record<OpportunityType, { label: string; icon: typeof Upgrade }> = {
  essentialManagement: { label: "Essential Management", icon: ServiceDesk },
  expertiseConnect: { label: "Expertise Connect", icon: Collaborate },
  upgrade: { label: "Upgrade (EC & Migration)", icon: Upgrade },
};

const TYPE_ORDER: OpportunityType[] = ["expertiseConnect", "essentialManagement", "upgrade"];

const REPORT_NOTE =
  "Reports list customers and products where an opportunity exists. For detailed information, please reach out to the admin of this application.";

function ruleText(kind: ReportKind, o: Overview | null): string {
  const months = o?.window?.lookbackMonths ?? 12;
  const em = o?.thresholds.essentialManagementSev1Above ?? 10;
  const ec = o?.thresholds.expertiseConnectCasesAbove ?? 50;
  switch (kind) {
    case "expertiseConnect":
      return `Non-EC products with more than ${ec} cases (all severities) in the last ${months} months.`;
    case "essentialManagement":
      return `Non-EC products with more than ${em} Sev1 cases in the last ${months} months.`;
    case "upgrade":
      return "Non-EC products running a version past or nearing end of support, with any supported versions the customer also runs.";
    case "multi":
      return "Every opportunity for customers that qualify for two or more opportunity types.";
    case "all":
      return "All three opportunity types, one row per customer, product and opportunity type.";
  }
}

const REPORT_ITEMS: { id: ReportKind; text: string }[] = [
  { id: "expertiseConnect", text: "Expertise Connect opportunities" },
  { id: "essentialManagement", text: "Essential Management opportunities" },
  { id: "upgrade", text: "Upgrade (EC & Migration) opportunities" },
  { id: "multi", text: "Multiple opportunity types" },
  { id: "all", text: "Full consolidated report" },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const card: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e0e0e0",
  padding: "1rem 1.25rem",
};
const cardTitle: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "#161616",
  margin: 0,
};
const muted: React.CSSProperties = { fontSize: "0.8125rem", color: "#6f6f6f", fontStyle: "italic" };

export function OpportunityOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState<Overview | { available: false } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState("");
  const [market, setMarket] = useState("");
  const [division, setDivision] = useState("");
  /** Which control is downloading — a chart's type, or "panel". */
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (geo) params.set("geo", geo);
    if (market) params.set("market", market);
    if (division) params.set("division", division);
    apiFetch(`/api/demo/opportunities/overview${params.size ? `?${params}` : ""}`)
      .then(async (res) => {
        if (!res.ok)
          throw new Error(
            ((await res.json().catch(() => ({}))) as { error?: string }).error ||
              `Could not load (${res.status})`,
          );
        return res.json();
      })
      .then((d) => !cancelled && setData(d))
      .catch(
        (e: unknown) =>
          !cancelled && setError(e instanceof Error ? e.message : "Could not load opportunities"),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [geo, market, division]);

  /** Fetch one Excel file holding the given reports (one sheet each when several) and save it. */
  const saveFile = useCallback(
    async (kinds: ReportKind[]) => {
      const params = new URLSearchParams({ type: kinds.join(",") });
      if (geo) params.set("geo", geo);
      if (market) params.set("market", market);
      if (division) params.set("division", division);
      const res = await apiFetch(`/api/demo/opportunities/export?${params}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `The report file is not available (${res.status}).`);
      }
      const blob = await res.blob();
      const name =
        res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `Opportunity_Report.xlsx`;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    },
    [geo, market, division],
  );

  /** Download a list of files in turn — each entry is the reports for one file. */
  const download = useCallback(
    async (key: string, files: ReportKind[][]) => {
      setDownloading(key);
      setDownloadError(null);
      try {
        for (const kinds of files) await saveFile(kinds);
      } catch (e) {
        setDownloadError(e instanceof Error ? e.message : "Download failed");
      } finally {
        setDownloading(null);
      }
    },
    [saveFile],
  );

  // Stable, so the memoised charts below never redraw because of it.
  const openCustomer = useCallback(
    (clientId: string) => navigate({ to: "/client/$clientId" as any, params: { clientId } as any }),
    [navigate],
  );
  const dismissError = useCallback(() => setDownloadError(null), []);

  const overview = data && data.available ? data : null;
  const markets = overview?.filterOptions.find((f) => f.geo === geo)?.markets ?? [];

  // A new Geo/Market can leave the chosen Division with nothing in it — reset
  // rather than show an empty page the user did not ask for.
  useEffect(() => {
    if (overview && division && !overview.divisionOptions.includes(division)) setDivision("");
  }, [overview, division]);
  const hasAny = overview ? TYPE_ORDER.some((t) => overview.totals[t].customers > 0) : false;

  return (
    <section style={{ margin: "1.5rem 1.5rem 0" }}>
      {/* Header: title, last generated, filters */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#161616", margin: 0 }}>
            Opportunity Overview
          </h2>
          <div style={{ fontSize: "0.75rem", color: "#6f6f6f", marginTop: "0.25rem" }}>
            {overview ? (
              <>
                Last generated: <strong>{fmtDate(overview.generatedAt)}</strong>
                {overview.window && (
                  <>
                    {" "}
                    · cases {overview.window.start} to {overview.window.end}
                  </>
                )}{" "}
                · across the customers you can access
              </>
            ) : (
              "Across the customers you can access"
            )}
          </div>
        </div>
        {overview && (
          <div
            style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}
          >
            {overview.canFilter && (
              <>
                <div style={{ width: 180 }}>
                  <Dropdown
                    id="opp-geo"
                    titleText="Geo"
                    label="All geos"
                    size="sm"
                    items={["", ...overview.filterOptions.map((f) => f.geo)]}
                    itemToString={(i: string | null) => (i ? i : "All geos")}
                    selectedItem={geo}
                    onChange={({ selectedItem }: { selectedItem: string | null }) => {
                      setGeo(selectedItem ?? "");
                      setMarket("");
                    }}
                  />
                </div>
                <div style={{ width: 220 }}>
                  <Dropdown
                    id="opp-market"
                    titleText="Market"
                    label="All markets"
                    size="sm"
                    disabled={!geo}
                    items={["", ...markets]}
                    itemToString={(i: string | null) => (i ? i : "All markets")}
                    selectedItem={market}
                    onChange={({ selectedItem }: { selectedItem: string | null }) =>
                      setMarket(selectedItem ?? "")
                    }
                  />
                </div>
              </>
            )}
            {/* Division: open to every report user — it narrows by product only. */}
            <div style={{ width: 240 }}>
              <Dropdown
                id="opp-division"
                titleText="Division"
                label="All divisions"
                size="sm"
                items={["", ...overview.divisionOptions]}
                itemToString={(i: string | null) => (i ? i : "All divisions")}
                selectedItem={division}
                onChange={({ selectedItem }: { selectedItem: string | null }) =>
                  setDivision(selectedItem ?? "")
                }
              />
            </div>
          </div>
        )}
      </div>

      {loading && !overview && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonPlaceholder key={i} style={{ width: "100%", height: 110 }} />
          ))}
        </div>
      )}

      {error && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Opportunities unavailable"
          subtitle={error}
          style={{ maxWidth: "none" }}
        />
      )}

      {!loading && !error && data && !data.available && (
        <div style={{ ...card, ...muted }}>
          Reports not available yet. They appear here after the next completed Run Reports job.
        </div>
      )}

      {overview && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity 150ms" }}>
          {/* Count tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
            {TYPE_ORDER.map((t) => {
              const c = OPPORTUNITY_COLORS[t];
              const Icon = TYPE_META[t].icon;
              const tot = overview.totals[t];
              return (
                <div
                  key={t}
                  style={{
                    ...card,
                    borderTop: `3px solid ${c.main}`,
                    display: "flex",
                    gap: "0.875rem",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: c.soft,
                      color: c.main,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: c.text,
                      }}
                    >
                      {TYPE_META[t].label}
                    </div>
                    {tot.customers === 0 ? (
                      <div style={{ ...muted, marginTop: "0.3rem" }}>
                        No opportunities identified
                      </div>
                    ) : (
                      <div style={{ marginTop: "0.2rem", color: "#161616" }}>
                        <span style={{ fontSize: "1.6rem", fontWeight: 400 }}>{tot.customers}</span>
                        <span style={{ fontSize: "0.8rem", color: "#525252" }}> customers · </span>
                        <span style={{ fontSize: "1.1rem" }}>{tot.products}</span>
                        <span style={{ fontSize: "0.8rem", color: "#525252" }}> products</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div
              style={{
                ...card,
                borderTop: "3px solid #0f62fe",
                display: "flex",
                gap: "0.875rem",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "#edf5ff",
                  color: "#0f62fe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Layers size={20} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#0043ce",
                  }}
                >
                  Multiple opportunity types
                </div>
                {overview.multiType.twoOrMore === 0 ? (
                  <div style={{ ...muted, marginTop: "0.3rem" }}>
                    No customers with more than one type
                  </div>
                ) : (
                  <div style={{ marginTop: "0.2rem", color: "#161616" }}>
                    <span style={{ fontSize: "1.6rem" }}>{overview.multiType.twoOrMore}</span>
                    <span style={{ fontSize: "0.8rem", color: "#525252" }}>
                      {" "}
                      customers with 2+ types · {overview.multiType.allThree} with all 3
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {!hasAny && (
            <div style={{ ...card, ...muted, marginTop: "1rem" }}>
              No opportunities identified for your access.
            </div>
          )}

          {/* Top 5 per type */}
          {hasAny && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "1rem",
                marginTop: "1rem",
              }}
            >
              {TYPE_ORDER.map((t) => {
                const rows = overview.top5[t];
                const c = OPPORTUNITY_COLORS[t];
                return (
                  <div key={t} style={card}>
                    <p style={cardTitle}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          background: c.main,
                          marginRight: 8,
                        }}
                      />
                      Top 5 — {TYPE_META[t].label}
                    </p>
                    <div
                      style={{ fontSize: "0.72rem", color: "#6f6f6f", margin: "0.15rem 0 0.5rem" }}
                    >
                      Ranked by number of opportunity products
                    </div>
                    <Top5Chart type={t} rows={rows} onOpen={openCustomer} />
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Download}
                      disabled={downloading !== null || overview.totals[t].customers === 0}
                      onClick={() => void download(t, [[t]])}
                      style={{ marginTop: "0.25rem", paddingLeft: 0 }}
                    >
                      {downloading === t ? "Preparing…" : "Download full report"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Geo breakdown + Reports */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: "1rem",
              marginTop: "1rem",
            }}
          >
            <div style={{ ...card, display: "flex", flexDirection: "column" }}>
              <p style={cardTitle}>Customers with opportunities by Geo</p>
              <div style={{ fontSize: "0.72rem", color: "#6f6f6f", margin: "0.15rem 0 0.5rem" }}>
                Number of customers per opportunity type in each Geo
              </div>
              <GeoChart data={overview.byGeo} />
            </div>

            <ReportsPanel
              overview={overview}
              downloading={downloading}
              downloadError={downloadError}
              onDismissError={dismissError}
              onDownload={download}
              filters={{ geo, market, division }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// ── Charts ───────────────────────────────────────────────────────────────────
// Memoised: they redraw only when their data changes (a new filter), never
// because something else on the page — ticking a report, a download starting —
// re-rendered the section. Without this every click replayed the bar animation.

const TOP5_MARGIN = { top: 0, right: 28, bottom: 0, left: 0 };
const TOP5_TICK = { fontSize: 11, fill: "#393939" };
const TOP5_LABEL = { position: "right" as const, fontSize: 11, fill: "#161616" };
const BAR_CURSOR = { fill: "#f4f4f4" };
const shortName = (v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v);

const Top5Chart = memo(function Top5Chart({
  type,
  rows,
  onOpen,
}: {
  type: OpportunityType;
  rows: Overview["top5"][OpportunityType];
  onOpen: (clientId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div style={{ ...muted, height: 190, display: "flex", alignItems: "center" }}>
        No opportunities identified for your access
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={rows} layout="vertical" margin={TOP5_MARGIN}>
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis
          type="category"
          dataKey="customerName"
          width={150}
          tick={TOP5_TICK}
          tickFormatter={shortName}
        />
        <Tooltip
          cursor={BAR_CURSOR}
          formatter={(v) => [`${v} product${Number(v) === 1 ? "" : "s"}`, TYPE_META[type].label]}
        />
        <Bar
          dataKey="products"
          fill={OPPORTUNITY_COLORS[type].main}
          barSize={18}
          label={TOP5_LABEL}
          cursor="pointer"
          onClick={(d) => {
            const clientId = (d as { payload?: { clientId?: string } })?.payload?.clientId;
            if (clientId) onOpen(clientId);
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
});

const GEO_MARGIN = { top: 4, right: 8, bottom: 0, left: -12 };
const GEO_X_TICK = { fontSize: 12, fill: "#393939" };
const GEO_Y_TICK = { fontSize: 11, fill: "#6f6f6f" };
const LEGEND_STYLE = { fontSize: 12 };

/**
 * Fills its card, so it lines up with the Reports panel beside it. The panel's
 * height is constant (nothing in it appears or disappears on a click), so this
 * never resizes while someone is choosing reports.
 */
const GeoChart = memo(function GeoChart({ data }: { data: Overview["byGeo"] }) {
  if (data.length === 0) {
    return (
      <div style={{ ...muted, flex: 1, minHeight: 260, display: "flex", alignItems: "center" }}>
        No opportunities identified for your access
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minHeight: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={GEO_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
          <XAxis dataKey="geo" tick={GEO_X_TICK} />
          <YAxis allowDecimals={false} tick={GEO_Y_TICK} />
          <Tooltip cursor={BAR_CURSOR} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {TYPE_ORDER.map((t) => (
            <Bar
              key={t}
              dataKey={t}
              name={TYPE_META[t].label}
              stackId="geo"
              fill={OPPORTUNITY_COLORS[t].main}
              maxBarSize={56}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

// ── Reports panel ────────────────────────────────────────────────────────────

/**
 * Report picker and download. Holds its own selection, so ticking a report
 * re-renders only this panel — the charts beside it are untouched.
 */
function ReportsPanel({
  overview,
  downloading,
  downloadError,
  onDismissError,
  onDownload,
  filters,
}: {
  overview: Overview;
  downloading: string | null;
  downloadError: string | null;
  onDismissError: () => void;
  onDownload: (key: string, files: ReportKind[][]) => Promise<void>;
  /** The page filters the download follows. */
  filters: { geo: string; market: string; division: string };
}) {
  // The full report already holds every type, so it is exclusive: ticking it
  // clears the others and vice versa.
  const [selected, setSelected] = useState<ReportKind[]>(["all"]);
  const [fileMode, setFileMode] = useState<"combined" | "separate">("combined");

  const toggleReport = (kind: ReportKind, checked: boolean) =>
    setSelected((cur) => {
      if (kind === "all") return checked ? ["all"] : [];
      const rest = cur.filter((k) => k !== "all" && k !== kind);
      return checked ? [...rest, kind] : rest;
    });
  // Keep the panel's order regardless of click order.
  const ordered = REPORT_ITEMS.map((i) => i.id).filter((k) => selected.includes(k));
  const several = ordered.length > 1;

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <p style={cardTitle}>Reports</p>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: "0.4rem" }}>
        <legend style={{ fontSize: "0.75rem", color: "#525252", marginBottom: "0.35rem" }}>
          Select one or more reports
        </legend>
        {REPORT_ITEMS.map((item) => {
          const on = selected.includes(item.id);
          return (
            <div
              key={item.id}
              style={{
                padding: "0.45rem 0.65rem 0.5rem",
                border: `1px solid ${on ? "#a6c8ff" : "#e0e0e0"}`,
                background: on ? "#edf5ff" : "#ffffff",
                transition: "background 120ms, border-color 120ms",
              }}
            >
              <Checkbox
                id={`opp-report-${item.id}`}
                labelText={item.text}
                checked={on}
                disabled={downloading !== null}
                onChange={(_: unknown, { checked }: { checked: boolean }) =>
                  toggleReport(item.id, checked)
                }
              />
              {/* 30px = Carbon's checkbox box + gap, so this sits under the label text. */}
              <div
                style={{ paddingLeft: 30, fontSize: "0.75rem", lineHeight: 1.4, color: "#6f6f6f" }}
              >
                {ruleText(item.id, overview)}
              </div>
            </div>
          );
        })}
      </fieldset>
      {/* Always present (disabled until 2+ reports are ticked) so the panel's
          height never jumps when the selection changes. */}
      <RadioButtonGroup
        legendText={several ? "Download as" : "Download as (tick 2 or more reports)"}
        name="opp-file-mode"
        valueSelected={fileMode}
        disabled={!several || downloading !== null}
        onChange={(v) => setFileMode(v as "combined" | "separate")}
      >
        <RadioButton
          id="opp-file-combined"
          labelText="One combined file (a sheet per report)"
          value="combined"
        />
        <RadioButton id="opp-file-separate" labelText="Separate files" value="separate" />
      </RadioButtonGroup>
      {/* What the download will contain — highlighted when a filter narrows it. */}
      <FilterStrip filters={filters} />
      {/* Fixed height: swapping the button for "Preparing file…" must not shift the layout. */}
      <div style={{ minHeight: 48, display: "flex", alignItems: "center" }}>
        {downloading === "panel" ? (
          <InlineLoading description="Preparing file…" />
        ) : (
          <Button
            kind="primary"
            size="md"
            renderIcon={Download}
            disabled={downloading !== null || ordered.length === 0}
            onClick={() =>
              void onDownload(
                "panel",
                fileMode === "separate" && several ? ordered.map((k) => [k]) : [ordered],
              )
            }
          >
            {several && fileMode === "separate" ? `Download ${ordered.length} files` : "Download"}
          </Button>
        )}
      </div>
      {downloadError && (
        <InlineNotification
          kind="error"
          lowContrast
          title="Download failed"
          subtitle={downloadError}
          onCloseButtonClick={onDismissError}
          style={{ maxWidth: "none", margin: 0 }}
        />
      )}
      <div
        style={{
          fontSize: "0.75rem",
          color: "#6f6f6f",
          lineHeight: 1.45,
          borderTop: "1px solid #e0e0e0",
          paddingTop: "0.6rem",
          marginTop: "auto",
        }}
      >
        {REPORT_NOTE}
      </div>
    </div>
  );
}

/** "Download filter" strip: one tag per active filter, or a muted "none". */
function FilterStrip({ filters }: { filters: { geo: string; market: string; division: string } }) {
  const active = (
    [
      ["Geo", filters.geo],
      ["Market", filters.market],
      ["Division", filters.division],
    ] as const
  ).filter(([, v]) => v);
  const on = active.length > 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.4rem",
        padding: "0.5rem 0.75rem",
        background: on ? "#edf5ff" : "#f4f4f4",
        borderLeft: `3px solid ${on ? "#0f62fe" : "#c6c6c6"}`,
        fontSize: "0.8125rem",
      }}
    >
      <Filter size={16} style={{ color: on ? "#0f62fe" : "#6f6f6f", flexShrink: 0 }} />
      <span style={{ fontWeight: 600, color: on ? "#0043ce" : "#525252" }}>Download filter:</span>
      {on ? (
        active.map(([label, value]) => (
          <Tag key={label} type="blue" size="sm" style={{ margin: 0 }}>
            {label}: {value}
          </Tag>
        ))
      ) : (
        <span style={{ color: "#6f6f6f" }}>None — all customers you can access</span>
      )}
    </div>
  );
}
