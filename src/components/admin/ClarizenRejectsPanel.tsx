/**
 * Discarded Clarizen rows — persistent view.
 *
 * The upload result already shows what was refused, but that disappears on the
 * next page load. A customer that never made it into the system leaves no other
 * trace, so without this the only way to notice would be to spot the absence.
 *
 * Shows the most recent upload only: this is a worklist for the current file,
 * not an audit log.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Tag, Tile } from "@carbon/react";
import { WarningFilled, Renew } from "@carbon/icons-react";
import { apiFetch } from "@/lib/apiFetch";

interface RejectedCustomer {
  customerName: string;
  rowCount: number;
  geo: string;
  market: string;
  country: string;
  reason: string;
}

interface RejectReport {
  uploadedAt?: string;
  uploadedBy?: string;
  fileName?: string;
  totalRows?: number;
  acceptedRows?: number;
  rejectedRows?: number;
  customers: RejectedCustomer[];
}

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function ClarizenRejectsPanel() {
  const [report, setReport] = useState<RejectReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/clarizen-rejects");
      setReport(res.ok ? ((await res.json()) as RejectReport) : null);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Nothing refused on the last upload is the good case — stay out of the way.
  if (loading || !report || !report.customers?.length) return null;

  return (
    <section style={{ marginTop: "1.25rem" }}>
      <Tile style={{ borderLeft: "3px solid #f1c21b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          <WarningFilled size={18} style={{ color: "#b28600" }} />
          <strong style={{ fontSize: "0.9rem" }}>
            Discarded on the last Clarizen upload — no customer number
          </strong>
          <Tag type="warm-gray" size="sm">
            {report.rejectedRows ?? 0} row{report.rejectedRows === 1 ? "" : "s"} · {report.customers.length} customer
            {report.customers.length === 1 ? "" : "s"}
          </Tag>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Renew}
            hasIconOnly
            iconDescription="Refresh"
            onClick={() => void load()}
            style={{ marginLeft: "auto" }}
          />
        </div>

        <p style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", margin: "0 0 0.75rem", maxWidth: "76ch" }}>
          These rows were not imported and no client pages were created for them. The customer number
          is required — it is the key that case data, geography and contracts all join on. Fix them at
          source in Clarizen and upload again.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--cds-text-secondary)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th style={{ padding: "0.3rem 0.75rem 0.4rem 0" }}>Customer</th>
                <th style={{ padding: "0.3rem 0.75rem 0.4rem 0" }}>Rows</th>
                <th style={{ padding: "0.3rem 0.75rem 0.4rem 0" }}>Geo</th>
                <th style={{ padding: "0.3rem 0.75rem 0.4rem 0" }}>Market</th>
                <th style={{ padding: "0.3rem 0.75rem 0.4rem 0" }}>Country</th>
              </tr>
            </thead>
            <tbody>
              {report.customers.map((c) => (
                <tr key={c.customerName} style={{ borderTop: "1px solid var(--cds-border-subtle-01)" }}>
                  <td style={{ padding: "0.35rem 0.75rem 0.35rem 0" }}>{c.customerName}</td>
                  <td style={{ padding: "0.35rem 0.75rem 0.35rem 0", fontVariantNumeric: "tabular-nums" }}>{c.rowCount}</td>
                  <td style={{ padding: "0.35rem 0.75rem 0.35rem 0" }}>{c.geo || "—"}</td>
                  <td style={{ padding: "0.35rem 0.75rem 0.35rem 0" }}>{c.market || "—"}</td>
                  <td style={{ padding: "0.35rem 0.75rem 0.35rem 0" }}>{c.country || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)", margin: "0.75rem 0 0" }}>
          From <strong>{report.fileName || "—"}</strong>, uploaded {fmt(report.uploadedAt)} by{" "}
          {report.uploadedBy || "—"} · {report.acceptedRows ?? 0} of {report.totalRows ?? 0} rows imported
        </p>
      </Tile>
    </section>
  );
}
