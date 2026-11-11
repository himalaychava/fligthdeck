import { useEffect, useState } from "react";
import { Tile, InlineLoading, InlineNotification, Tag } from "@carbon/react";
import { Launch } from "@carbon/icons-react";
import type { CaseAnalysis } from "@/server/aiInsightsService";
import { apiFetch } from "@/lib/apiFetch";

interface OfferingRow {
  productName: string;
  matched: boolean;
  reason: string | null;
  offeringId: string | null;
  offeringName: string | null;
  category: string | null;
  supportedPlatforms: string | null;
  viewDetailsUrl: string | null;
}

/** Maps each group-start row index -> how many consecutive rows share that productName. */
function computeGroupSizes(rows: OfferingRow[]): Map<number, number> {
  const sizes = new Map<number, number>();
  let groupStart = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i === rows.length || rows[i].productName !== rows[groupStart].productName) {
      sizes.set(groupStart, i - groupStart);
      groupStart = i;
    }
  }
  return sizes;
}

// Deterministic color per category string so the same category (e.g. "Data")
// always renders the same tag color across rows, without maintaining a lookup
// table of every possible IBM brand name.
const CATEGORY_TAG_COLORS = [
  "blue",
  "purple",
  "teal",
  "magenta",
  "cyan",
  "green",
  "cool-gray",
  "warm-gray",
  "red",
  "gray",
] as const;

function categoryTagColor(category: string): (typeof CATEGORY_TAG_COLORS)[number] {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_TAG_COLORS[hash % CATEGORY_TAG_COLORS.length];
}

const MAX_VISIBLE_PLATFORMS = 3;

function PlatformBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: "0.6875rem",
        fontWeight: 500,
        background: "#edf5ff",
        color: "#0043ce",
        border: "1px solid #d0e2ff",
        borderRadius: "10px",
        padding: "0.1rem 0.55rem",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function PlatformBadges({ supportedPlatforms }: { supportedPlatforms: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!supportedPlatforms || supportedPlatforms === "—") {
    return <span style={{ color: "#a8a8a8" }}>—</span>;
  }
  const platforms = supportedPlatforms
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const overflow = platforms.length - MAX_VISIBLE_PLATFORMS;
  const visible = expanded || overflow <= 0 ? platforms : platforms.slice(0, MAX_VISIBLE_PLATFORMS);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", alignItems: "center" }}>
      {visible.map((p) => (
        <PlatformBadge key={p} label={p} />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            color: "#0f62fe",
            background: "none",
            border: "none",
            padding: "0.1rem 0.3rem",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {expanded ? "Show less" : `+${overflow} more`}
        </button>
      )}
    </div>
  );
}

async function fetchOfferings(productNames: string[]): Promise<OfferingRow[]> {
  const res = await apiFetch("/api/demo/offerings/by-product-names", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productNames }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? "Failed to load offerings");
  }
  const body = (await res.json()) as { rows: OfferingRow[] };
  return body.rows;
}

interface Props {
  analysis: CaseAnalysis;
}

export function OfferingsSection({ analysis }: Props) {
  // Same top-10 non-EC expansion products shown in the "Subscription Opportunity
  // View" table directly above this section — kept in sync intentionally.
  const top10NonEc = [...analysis.opportunities]
    .filter((o) => !o.isEC)
    .sort((a, b) => b.totalCases - a.totalCases)
    .slice(0, 10);

  const productNames = top10NonEc.map((o) => o.productName);
  const key = productNames.join("|");

  const [rows, setRows] = useState<OfferingRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (productNames.length === 0) {
      setRows(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOfferings(productNames)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (top10NonEc.length === 0) return null;

  return (
    <Tile style={{ padding: "1.5rem", marginBottom: "1.25rem", borderLeft: "4px solid #0f62fe" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <h2
          style={{
            fontSize: "1rem",
            fontWeight: 700,
            color: "#0f62fe",
            margin: 0,
            marginBottom: "0.25rem",
          }}
        >
          Offerings — Subscription Opportunities
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "#525252", margin: 0 }}>
          Subscription-tagged offerings from IBM Solution Builder for the top {top10NonEc.length}{" "}
          expansion product{top10NonEc.length !== 1 ? "s" : ""} above.
        </p>
      </div>

      {loading && (
        <div style={{ padding: "1.5rem 0", display: "flex", justifyContent: "center" }}>
          <InlineLoading description="Loading offerings from Solution Builder…" status="active" />
        </div>
      )}

      {!loading && error && (
        <InlineNotification
          kind="error"
          title="Failed to load offerings"
          subtitle={error}
          lowContrast
          hideCloseButton
        />
      )}

      {!loading &&
        !error &&
        rows &&
        (() => {
          const groupSizes = computeGroupSizes(rows);
          return (
            <div style={{ border: "1px solid #e0e0e0", borderRadius: "4px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                <thead>
                  <tr style={{ background: "#f4f4f4", borderBottom: "2px solid #e0e0e0" }}>
                    {[
                      "Product Name",
                      "Offering Name",
                      "Category",
                      "Supported Products",
                      "View Details",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "0.6rem 0.9rem",
                          textAlign: "left",
                          fontWeight: 600,
                          fontSize: "0.6875rem",
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
                  {rows.map((r, i) => {
                    // Consecutive rows share a productName when a product has multiple
                    // offerings — merge the Product Name cell via rowSpan, alternate a
                    // subtle background per product group, and draw a solid divider
                    // only between different products (not between sibling offerings)
                    // so the table reads as clearly separated product blocks.
                    const groupSize = groupSizes.get(i) ?? 0;
                    const isGroupStart = groupSize > 0;
                    const groupIndex = [...groupSizes.keys()].filter((k) => k <= i).length - 1;
                    const groupBg = groupIndex % 2 === 0 ? "#ffffff" : "#f7f9fc";
                    const isGroupEnd =
                      i === rows.length - 1 || rows[i + 1].productName !== r.productName;

                    return (
                      <tr
                        key={`${r.productName}-${r.offeringId ?? i}`}
                        style={{
                          background: groupBg,
                          borderBottom: isGroupEnd ? "2px solid #e0e0e0" : "1px solid #eef0f2",
                          verticalAlign: "middle",
                        }}
                      >
                        {isGroupStart && (
                          <td
                            rowSpan={groupSize}
                            style={{
                              padding: "0.75rem 0.9rem",
                              fontWeight: 600,
                              color: "#161616",
                              verticalAlign: "top",
                              borderLeft: "3px solid #0f62fe",
                              borderRight: "1px solid #eef0f2",
                            }}
                          >
                            {r.productName}
                            {groupSize > 1 && (
                              <span
                                style={{
                                  display: "inline-block",
                                  fontSize: "0.6875rem",
                                  fontWeight: 600,
                                  color: "#0f62fe",
                                  background: "#edf5ff",
                                  borderRadius: "10px",
                                  padding: "0.05rem 0.5rem",
                                  marginTop: "0.35rem",
                                }}
                              >
                                {groupSize} offerings
                              </span>
                            )}
                          </td>
                        )}
                        {r.matched ? (
                          <>
                            <td
                              style={{
                                padding: "0.75rem 0.9rem",
                                color: "#161616",
                                fontWeight: 500,
                              }}
                            >
                              {r.offeringName}
                            </td>
                            <td style={{ padding: "0.75rem 0.9rem" }}>
                              {r.category ? (
                                <Tag type={categoryTagColor(r.category)} size="sm">
                                  {r.category}
                                </Tag>
                              ) : (
                                <span style={{ color: "#a8a8a8" }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "0.75rem 0.9rem", maxWidth: "280px" }}>
                              <PlatformBadges supportedPlatforms={r.supportedPlatforms} />
                            </td>
                            <td style={{ padding: "0.75rem 0.9rem" }}>
                              {r.viewDetailsUrl ? (
                                <a
                                  href={r.viewDetailsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    color: "#ffffff",
                                    background: "#0f62fe",
                                    borderRadius: "4px",
                                    padding: "0.3rem 0.7rem",
                                    textDecoration: "none",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  View Details <Launch size={14} />
                                </a>
                              ) : (
                                <span
                                  title="Not available yet — the Solution Builder web UI's per-offering details endpoint hasn't been wired in yet."
                                  style={{
                                    display: "inline-block",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    color: "#8d8d8d",
                                    background: "#f4f4f4",
                                    border: "1px solid #e0e0e0",
                                    borderRadius: "4px",
                                    padding: "0.3rem 0.7rem",
                                    cursor: "not-allowed",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  View Details
                                </span>
                              )}
                            </td>
                          </>
                        ) : (
                          <td
                            colSpan={4}
                            style={{
                              padding: "0.75rem 0.9rem",
                              color: "#8d8d8d",
                              fontStyle: "italic",
                            }}
                          >
                            {r.reason ?? "No subscription offering found"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
    </Tile>
  );
}
