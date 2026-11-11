import { useState, useEffect } from "react";
import { Tile } from "@carbon/react";
import { Launch } from "@carbon/icons-react";
import { apiFetch } from "@/lib/apiFetch";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface OfferingRow {
  productName: string;
  offeringName: string;
  frameworkCategory: string;
  supportedProduct: string;
  offeringId: string;
  tagLine: string;
  duration: string;
}

interface Props {
  productNames: string[];
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function OfferingsView({ productNames }: Props) {
  const [rows, setRows] = useState<OfferingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const productKey = productNames.join(",");

  useEffect(() => {
    if (!productNames || productNames.length === 0) return;
    setLoading(true);
    setFetchError(null);
    const controller = new AbortController();
    const encoded = encodeURIComponent(productKey);
    apiFetch(`/api/demo/offerings?products=${encoded}`, { cache: "no-store", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<OfferingRow[]>;
      })
      .then((data) => { setRows(data); setLoading(false); })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setFetchError("Failed to load offerings data.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [productKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function viewDetailsUrl(offeringId: string): string {
    return `https://solconfig-backend-prod.expert-labs-solution-tool.dal.app.cirrus.ibm.com/offerings/${offeringId}`;
  }

  return (
    <Tile style={{ padding: "1.5rem", marginBottom: "1.25rem", borderLeft: "4px solid #6929c4" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#6929c4", margin: 0 }}>
            Offerings
          </h2>
          <span style={{
            fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
            background: "#f6f2ff", color: "#6929c4", border: "1px solid #d4bbff",
            borderRadius: "2px", padding: "0.2rem 0.6rem",
          }}>
            Subscription Only
          </span>
        </div>
        <p style={{ fontSize: "0.8125rem", color: "#525252", margin: 0 }}>
          IBM Solution Builder offerings tagged <strong>Subscription</strong> matching the top non-EC products listed above.
          Click <em>View Details</em> to open in Solution Builder.
        </p>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1.5rem", background: "#f6f2ff", border: "1px solid #d4bbff" }}>
          <span style={{
            width: "18px", height: "18px", border: "3px solid #d4bbff",
            borderTopColor: "#6929c4", borderRadius: "50%",
            display: "inline-block", animation: "spin 0.8s linear infinite",
          }} />
          <span style={{ fontSize: "0.8125rem", color: "#6929c4", fontWeight: 500 }}>Fetching offerings from Solution Builder…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!loading && fetchError && (
        <div style={{ padding: "0.75rem 1rem", background: "#fff1f1", border: "1px solid #ffd7d9", fontSize: "0.8125rem", color: "#da1e28" }}>
          ⚠️ {fetchError}
        </div>
      )}

      {!loading && !fetchError && rows.length === 0 && productNames.length > 0 && (
        <div style={{ padding: "0.75rem 1rem", background: "#f6f2ff", border: "1px solid #d4bbff", fontSize: "0.8125rem", color: "#6929c4" }}>
          No Subscription offerings found for the listed non-EC products.
        </div>
      )}

      {!loading && !fetchError && rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ background: "#f6f2ff", borderBottom: "2px solid #d4bbff" }}>
                {["Product", "Offering Name", "Category", "Supported Platform", "View Details"].map((h) => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "#4d1fa2", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={`${row.productName}-${row.offeringId}`}
                  style={{ borderBottom: "1px solid #e8e0f7", background: idx % 2 === 0 ? "#fdfaff" : "#ffffff", verticalAlign: "middle" }}
                >
                  <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                    <span style={{ background: "#fff1f1", color: "#da1e28", border: "1px solid #ffd7d9", borderRadius: "2px", padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: 600 }}>
                      {row.productName}
                    </span>
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", maxWidth: "320px" }}>
                    <div style={{ fontWeight: 600, color: "#161616", lineHeight: 1.3 }}>{row.offeringName}</div>
                    {row.tagLine && (
                      <div style={{ fontSize: "0.75rem", color: "#6f6f6f", marginTop: "0.2rem", lineHeight: 1.35, fontStyle: "italic" }}>
                        {row.tagLine}
                      </div>
                    )}
                    {row.duration && (
                      <div style={{ marginTop: "0.25rem" }}>
                        <span style={{ fontSize: "0.7rem", background: "#e8e0f7", color: "#4d1fa2", borderRadius: "2px", padding: "0.1rem 0.4rem", fontWeight: 500 }}>
                          {row.duration}
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#6929c4", background: "#f6f2ff", border: "1px solid #d4bbff", borderRadius: "2px", padding: "0.2rem 0.5rem" }}>
                      {row.frameworkCategory || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    {row.supportedProduct ? (
                      <span style={{ fontSize: "0.8rem", background: "#defbe6", color: "#0e6027", border: "1px solid #a7f0ba", borderRadius: "2px", padding: "0.15rem 0.5rem" }}>
                        {row.supportedProduct}
                      </span>
                    ) : (
                      <span style={{ color: "#8d8d8d", fontSize: "0.8rem" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                    <a
                      href={viewDetailsUrl(row.offeringId)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", fontWeight: 600, color: "#6929c4", textDecoration: "none", padding: "0.3rem 0.65rem", border: "1px solid #d4bbff", borderRadius: "2px", background: "#f6f2ff" }}
                    >
                      View Details <Launch size={12} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#8d8d8d" }}>
            Showing {rows.length} Subscription offering{rows.length !== 1 ? "s" : ""} across{" "}
            {new Set(rows.map((r) => r.productName)).size} product{new Set(rows.map((r) => r.productName)).size !== 1 ? "s" : ""}.
            Data sourced from IBM Solution Builder API.
          </div>
        </div>
      )}
    </Tile>
  );
}
