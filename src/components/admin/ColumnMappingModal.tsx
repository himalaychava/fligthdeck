/**
 * ColumnMappingModal
 * ──────────────────
 * Shows the uploaded file's column headers alongside a dropdown for each
 * required internal field. Allows the admin to map uploaded headers to
 * internal fields before processing.
 *
 * Saved mappings are pre-filled on future uploads.
 */
import { useState } from "react";
import { Button, Select, SelectItem, Tag } from "@carbon/react";
import { Close, Save } from "@carbon/icons-react";

export interface FieldDef {
  key: string;         // internal field name
  label: string;       // human-readable label
  required: boolean;
}

interface ColumnMappingModalProps {
  uploadType: "clarizen" | "csp" | "occ" | "lifecycle";
  uploadedHeaders: string[];
  fieldDefs: FieldDef[];
  savedMapping: Record<string, string>;
  onSave: (mapping: Record<string, string>) => void;
  onCancel: () => void;
}

export function ColumnMappingModal({
  uploadType,
  uploadedHeaders,
  fieldDefs,
  savedMapping,
  onSave,
  onCancel,
}: ColumnMappingModalProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    // Pre-fill from saved mapping, then try auto-matching by similarity
    const initial: Record<string, string> = { ...savedMapping };
    for (const field of fieldDefs) {
      if (initial[field.key]) continue;
      // Try exact match first (case-insensitive)
      const exact = uploadedHeaders.find(
        (h) => h.toLowerCase() === field.label.toLowerCase()
      );
      if (exact) { initial[field.key] = exact; continue; }
      // Try partial match
      const partial = uploadedHeaders.find(
        (h) =>
          h.toLowerCase().includes(field.key.toLowerCase()) ||
          field.key.toLowerCase().includes(h.toLowerCase().replace(/\s+/g, ""))
      );
      if (partial) initial[field.key] = partial;
    }
    return initial;
  });

  const missingRequired = fieldDefs
    .filter((f) => f.required && !mapping[f.key])
    .map((f) => f.label);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", width: 680, maxHeight: "88vh",
        overflowY: "auto", borderRadius: 2,
        boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1rem 1.5rem", borderBottom: "1px solid #e0e0e0",
          background: "#f4f4f4",
        }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "#161616" }}>
              Map Columns — {uploadType === "clarizen" ? "Clarizen" : uploadType === "occ" ? "OCC" : "CSP"} Upload
            </div>
            <div style={{ fontSize: "0.75rem", color: "#525252", marginTop: 2 }}>
              Match uploaded file columns to internal fields. Mapping is saved for future uploads.
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <Close size={20} />
          </button>
        </div>

        {/* Mapping table */}
        <div style={{ padding: "1.25rem 1.5rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "#f4f4f4" }}>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "#525252", width: "45%" }}>
                  INTERNAL FIELD
                </th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "#525252" }}>
                  UPLOADED COLUMN
                </th>
              </tr>
            </thead>
            <tbody>
              {fieldDefs.map((field) => (
                <tr key={field.key} style={{ borderBottom: "1px solid #f4f4f4" }}>
                  <td style={{ padding: "0.5rem 0.75rem", verticalAlign: "middle" }}>
                    <span style={{ fontWeight: 500 }}>{field.label}</span>
                    {field.required && (
                      <Tag type="red" size="sm" style={{ marginLeft: 6 }}>Required</Tag>
                    )}
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>
                    <Select
                      id={`mapping-${field.key}`}
                      labelText=""
                      hideLabel
                      size="sm"
                      value={mapping[field.key] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMapping((prev) => ({ ...prev, [field.key]: val }));
                      }}
                    >
                      <SelectItem value="" text="— not mapped —" />
                      {uploadedHeaders.map((h) => (
                        <SelectItem key={h} value={h} text={h} />
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {missingRequired.length > 0 && (
            <div style={{ marginTop: "0.75rem", padding: "0.625rem 0.875rem", background: "#fff1f1", border: "1px solid #da1e28", fontSize: "0.8125rem", color: "#da1e28" }}>
              Required fields not mapped: {missingRequired.join(", ")}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: "0.75rem",
          padding: "1rem 1.5rem", borderTop: "1px solid #e0e0e0",
        }}>
          <Button kind="ghost" size="sm" renderIcon={Close} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            kind="primary" size="sm" renderIcon={Save}
            disabled={missingRequired.length > 0}
            onClick={() => onSave(mapping)}
          >
            Apply Mapping &amp; Process
          </Button>
        </div>
      </div>
    </div>
  );
}
