import { useEffect, useMemo, useState } from "react";
import { Modal, Search } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import type { Client } from "@/data/clients";

/**
 * Customer chooser for the landing page's Quick Access tiles.
 *
 * `customers` must already be the caller's entitled list (DemoDataContext's
 * liveAllClients, filtered server-side by geo/market/assigned clients) — this
 * component only narrows it by search, so it can never offer a customer the
 * user is not entitled to.
 */
export function CustomerPickerModal({
  open,
  sectionLabel,
  customers,
  onSelect,
  onClose,
}: {
  open: boolean;
  /** The Quick Access destination, e.g. "Insights" — used in the heading. */
  sectionLabel: string;
  customers: Client[];
  onSelect: (clientId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  // Fresh search each time the picker opens.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.clientName.toLowerCase().includes(q) || c.clientId.toLowerCase().includes(q),
    );
  }, [customers, query]);

  return (
    <Modal
      open={open}
      passiveModal
      size="sm"
      modalHeading={`Open ${sectionLabel}`}
      modalLabel="Choose a customer"
      onRequestClose={onClose}
    >
      <Search
        size="md"
        labelText="Search customers"
        placeholder="Search by customer name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter opens the top match, so a typed name plus Enter is enough.
          if (e.key === "Enter" && matches.length > 0) onSelect(matches[0].clientId);
        }}
        autoFocus
      />
      <div style={{ fontSize: "0.75rem", color: "#6f6f6f", margin: "0.5rem 0" }}>
        {query.trim()
          ? `${matches.length} of ${customers.length} customers`
          : `${customers.length} customer${customers.length !== 1 ? "s" : ""}`}
      </div>
      <div style={{ maxHeight: "22rem", overflowY: "auto", border: "1px solid #e0e0e0" }}>
        {matches.length === 0 ? (
          <div
            style={{
              padding: "1.25rem",
              fontSize: "0.8125rem",
              color: "#6f6f6f",
              textAlign: "center",
            }}
          >
            No customers match “{query.trim()}”.
          </div>
        ) : (
          matches.map((c, idx) => (
            <button
              key={c.clientId}
              onClick={() => onSelect(c.clientId)}
              style={{
                width: "100%",
                background: "#ffffff",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.625rem 0.875rem",
                borderBottom: idx < matches.length - 1 ? "1px solid #f4f4f4" : "none",
                textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f4f4f4")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  background: "#edf5ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  color: "#0f62fe",
                  letterSpacing: "0.04em",
                }}
              >
                {c.clientName.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#161616",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.clientName}
                </div>
                <div style={{ fontSize: "0.7rem", color: "#6f6f6f", marginTop: "0.1rem" }}>
                  {c.geo || "No geo"} · {c.productCount ?? c.products?.length ?? 0} products
                </div>
              </div>
              <ArrowRight size={16} style={{ color: "#8d8d8d", flexShrink: 0 }} />
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
