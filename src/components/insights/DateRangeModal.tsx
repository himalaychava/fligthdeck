/**
 * DateRangeModal
 * ──────────────
 * Shown before generating fresh insights. Lets the user optionally
 * filter the CSP case data by open date range and/or close date range.
 * All fields are optional — clicking "Generate with all data" skips filtering.
 */
import { useState } from "react";
import { Button } from "@carbon/react";
import { Close, Analytics, Filter } from "@carbon/icons-react";

export interface DateRangeFilter {
  openFrom:  string; // YYYY-MM-DD or ""
  openTo:    string;
  closeFrom: string;
  closeTo:   string;
  hwSwSaas:  string; // "Software" | "Hardware" | "SaaS" | "" (all)
}

interface DateRangeModalProps {
  clientName: string;
  onGenerate: (filter: DateRangeFilter) => void;
  onCancel: () => void;
}

// Default: Software + SaaS (excludes Hardware cases)
const EMPTY: DateRangeFilter = { openFrom: "", openTo: "", closeFrom: "", closeTo: "", hwSwSaas: "Software,SaaS" };

// Quick preset helpers
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoMonthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

const PRESETS: { label: string; filter: DateRangeFilter }[] = [
  { label: "Last 1 month",  filter: { openFrom: isoMonthsAgo(1),  openTo: isoToday(), closeFrom: "", closeTo: "", hwSwSaas: "" } },
  { label: "Last 3 months", filter: { openFrom: isoMonthsAgo(3),  openTo: isoToday(), closeFrom: "", closeTo: "", hwSwSaas: "" } },
  { label: "Last 6 months", filter: { openFrom: isoMonthsAgo(6),  openTo: isoToday(), closeFrom: "", closeTo: "", hwSwSaas: "" } },
  { label: "Last 12 months",filter: { openFrom: isoMonthsAgo(12), openTo: isoToday(), closeFrom: "", closeTo: "", hwSwSaas: "" } },
];

function isFilterActive(f: DateRangeFilter): boolean {
  return !!(f.openFrom || f.openTo || f.closeFrom || f.closeTo || f.hwSwSaas);
}

export function DateRangeModal({ clientName, onGenerate, onCancel }: DateRangeModalProps) {
  const [filter, setFilter] = useState<DateRangeFilter>(EMPTY);

  const set = (key: keyof DateRangeFilter, val: string) =>
    setFilter((prev) => ({ ...prev, [key]: val }));

  const active = isFilterActive(filter);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", width: 560,
        borderRadius: 2,
        boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
        fontFamily: "'IBM Plex Sans', sans-serif",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1rem 1.5rem", borderBottom: "1px solid #e0e0e0",
          background: "#f4f4f4",
        }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "#161616", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Filter size={18} /> Generate Insights — Select Date Range
            </div>
            <div style={{ fontSize: "0.75rem", color: "#525252", marginTop: 2 }}>
              {clientName} · Filter which CSP cases to include
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <Close size={20} />
          </button>
        </div>

        <div style={{ padding: "1.25rem 1.5rem" }}>

          {/* Quick presets */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#525252", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.5rem" }}>
              Quick Presets (by Open Date)
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setFilter(p.filter)}
                  style={{
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.8125rem",
                    border: "1px solid",
                    borderColor: filter.openFrom === p.filter.openFrom && filter.openTo === p.filter.openTo ? "#0f62fe" : "#c6c6c6",
                    background: filter.openFrom === p.filter.openFrom && filter.openTo === p.filter.openTo ? "#e8f1ff" : "#fff",
                    color: filter.openFrom === p.filter.openFrom && filter.openTo === p.filter.openTo ? "#0f62fe" : "#161616",
                    cursor: "pointer",
                    borderRadius: 2,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                >
                  {p.label}
                </button>
              ))}
              {active && (
                <button
                  onClick={() => setFilter(EMPTY)}
                  style={{
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.8125rem",
                    border: "1px solid #da1e28",
                    background: "#fff1f1",
                    color: "#da1e28",
                    cursor: "pointer",
                    borderRadius: 2,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: "1px solid #e0e0e0", marginBottom: "1.25rem" }} />

          {/* Open Date Range */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#525252", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.625rem" }}>
              Open Date Range
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <label style={{ flex: 1 }}>
                <div style={{ fontSize: "0.75rem", color: "#525252", marginBottom: "0.3rem" }}>From</div>
                <input
                  type="date"
                  value={filter.openFrom}
                  onChange={(e) => set("openFrom", e.target.value)}
                  style={{
                    width: "100%", padding: "0.5rem 0.75rem",
                    border: "1px solid #c6c6c6", borderRadius: 2,
                    fontSize: "0.875rem", fontFamily: "'IBM Plex Sans', sans-serif",
                    color: "#161616", background: "#fff",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <span style={{ color: "#525252", marginTop: "1.25rem", flexShrink: 0 }}>→</span>
              <label style={{ flex: 1 }}>
                <div style={{ fontSize: "0.75rem", color: "#525252", marginBottom: "0.3rem" }}>To</div>
                <input
                  type="date"
                  value={filter.openTo}
                  onChange={(e) => set("openTo", e.target.value)}
                  style={{
                    width: "100%", padding: "0.5rem 0.75rem",
                    border: "1px solid #c6c6c6", borderRadius: 2,
                    fontSize: "0.875rem", fontFamily: "'IBM Plex Sans', sans-serif",
                    color: "#161616", background: "#fff",
                    boxSizing: "border-box",
                  }}
                />
              </label>
            </div>
          </div>

          {/* HW/SW/SaaS filter */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#525252", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.625rem" }}>
              Case Type (HW / SW / SaaS)
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {/* "All types" clears the filter */}
              <button
                key="all"
                onClick={() => set("hwSwSaas", "")}
                style={{
                  padding: "0.3rem 0.875rem",
                  fontSize: "0.8125rem",
                  border: "1px solid",
                  borderColor: !filter.hwSwSaas ? "#0f62fe" : "#c6c6c6",
                  background: !filter.hwSwSaas ? "#e8f1ff" : "#fff",
                  color: !filter.hwSwSaas ? "#0f62fe" : "#161616",
                  cursor: "pointer", borderRadius: 2,
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  fontWeight: !filter.hwSwSaas ? 600 : 400,
                }}
              >
                All types
              </button>
              {/* Individual type toggles — multiple can be selected simultaneously */}
              {(["Software", "Hardware", "SaaS"] as const).map((val) => {
                const selected = filter.hwSwSaas.split(",").map(v => v.trim()).includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => {
                      const current = filter.hwSwSaas.split(",").map(v => v.trim()).filter(Boolean);
                      const next = selected
                        ? current.filter(v => v !== val)          // deselect
                        : [...current, val];                       // select
                      set("hwSwSaas", next.join(","));
                    }}
                    style={{
                      padding: "0.3rem 0.875rem",
                      fontSize: "0.8125rem",
                      border: "1px solid",
                      borderColor: selected ? "#0f62fe" : "#c6c6c6",
                      background: selected ? "#e8f1ff" : "#fff",
                      color: selected ? "#0f62fe" : "#161616",
                      cursor: "pointer", borderRadius: 2,
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      fontWeight: selected ? 600 : 400,
                    }}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: "1px solid #e0e0e0", marginBottom: "1.25rem" }} />

          {/* Close Date Range */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#525252", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.625rem" }}>
              Close Date Range <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — only filters cases with a close date)</span>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <label style={{ flex: 1 }}>
                <div style={{ fontSize: "0.75rem", color: "#525252", marginBottom: "0.3rem" }}>From</div>
                <input
                  type="date"
                  value={filter.closeFrom}
                  onChange={(e) => set("closeFrom", e.target.value)}
                  style={{
                    width: "100%", padding: "0.5rem 0.75rem",
                    border: "1px solid #c6c6c6", borderRadius: 2,
                    fontSize: "0.875rem", fontFamily: "'IBM Plex Sans', sans-serif",
                    color: "#161616", background: "#fff",
                    boxSizing: "border-box",
                  }}
                />
              </label>
              <span style={{ color: "#525252", marginTop: "1.25rem", flexShrink: 0 }}>→</span>
              <label style={{ flex: 1 }}>
                <div style={{ fontSize: "0.75rem", color: "#525252", marginBottom: "0.3rem" }}>To</div>
                <input
                  type="date"
                  value={filter.closeTo}
                  onChange={(e) => set("closeTo", e.target.value)}
                  style={{
                    width: "100%", padding: "0.5rem 0.75rem",
                    border: "1px solid #c6c6c6", borderRadius: 2,
                    fontSize: "0.875rem", fontFamily: "'IBM Plex Sans', sans-serif",
                    color: "#161616", background: "#fff",
                    boxSizing: "border-box",
                  }}
                />
              </label>
            </div>
          </div>

          {/* Active filter summary */}
          {active && (
            <div style={{
              padding: "0.625rem 0.875rem", background: "#e8f1ff",
              border: "1px solid #a6c8ff", borderLeft: "4px solid #0f62fe",
              fontSize: "0.8125rem", color: "#0043ce", marginBottom: "0.5rem",
            }}>
              <strong>Filter active:</strong>{" "}
              {filter.openFrom && <>Open from <strong>{filter.openFrom}</strong></>}
              {filter.openFrom && filter.openTo && " → "}
              {filter.openTo && <strong>{filter.openTo}</strong>}
              {(filter.openFrom || filter.openTo) && (filter.closeFrom || filter.closeTo) && " · "}
              {filter.closeFrom && <>Close from <strong>{filter.closeFrom}</strong></>}
              {filter.closeFrom && filter.closeTo && " → "}
              {filter.closeTo && <strong>{filter.closeTo}</strong>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "1rem 1.5rem", borderTop: "1px solid #e0e0e0",
          background: "#f4f4f4",
          gap: "0.75rem",
        }}>
          <Button kind="ghost" size="sm" renderIcon={Close} onClick={onCancel}>
            Cancel
          </Button>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Button kind="secondary" size="sm" renderIcon={Analytics} onClick={() => onGenerate(EMPTY)}>
              Generate with all data
            </Button>
            <Button
              kind="primary" size="sm" renderIcon={Analytics}
              disabled={!active}
              onClick={() => onGenerate(filter)}
            >
              Generate with filter
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
