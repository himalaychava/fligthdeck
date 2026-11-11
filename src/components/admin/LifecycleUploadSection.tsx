/**
 * LifecycleUploadSection
 * ──────────────────────
 * Upload card for the IBM Product Lifecycle Catalog.
 *
 * Same synchronous clear-and-replace shape as the OCC card. Hardware rows are
 * dropped server-side during ingest, so the reported row count is Software only.
 *
 * The upload response also reports which product-alias targets don't exist in
 * the uploaded catalog — the alias table ships with seeded guesses, and this is
 * how those get validated against real data.
 */
import { useState, useRef } from "react";
import { Button, Tag, InlineLoading } from "@carbon/react";
import { Upload, CheckmarkFilled, WarningFilled, DocumentImport } from "@carbon/icons-react";
import { ColumnMappingModal, type FieldDef } from "./ColumnMappingModal";

export interface LifecycleUploadSectionProps {
  fieldDefs: FieldDef[];
  savedMapping: Record<string, string>;
  statusBadge: { label: string; count: number; lastUpdated: string | null } | null;
  onUploadComplete: () => void;
  callerEmail?: string;
}

type UploadState = "idle" | "mapping" | "uploading" | "success" | "error";

interface UploadResult {
  rows?: number;
  hardwareSkipped?: number;
  error?: string;
}

export function LifecycleUploadSection({
  fieldDefs,
  savedMapping,
  statusBadge,
  onUploadComplete,
  callerEmail = "",
}: LifecycleUploadSectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadedHeaders, setUploadedHeaders] = useState<string[]>([]);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const accentColor = "#8a3ffc"; // purple — distinct from clarizen, CSP and OCC

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    try {
      setUploadedHeaders(await peekFileHeaders(file));
    } catch {
      setUploadedHeaders([]);
    }
    setState("mapping");
    if (fileRef.current) fileRef.current.value = "";
  };

  const doUpload = async (file: File, mapping: Record<string, string>) => {
    setState("uploading");
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      const headers: Record<string, string> = {};
      if (callerEmail) headers["x-cp-email"] = callerEmail;
      const res = await fetch("/api/admin/upload/lifecycle", {
        method: "POST",
        headers,
        body: formData,
      });
      const data = (await res.json()) as UploadResult;
      if (!res.ok) {
        setErrorMsg(data.error ?? `Upload failed (${res.status})`);
        setState("error");
        return;
      }
      setResult(data);
      setState("success");
      onUploadComplete();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Upload failed");
      setState("error");
    }
  };

  const handleMappingSave = async (mapping: Record<string, string>) => {
    setState("idle");
    if (pendingFile) await doUpload(pendingFile, mapping);
  };

  const reset = () => {
    setState("idle");
    setResult(null);
    setErrorMsg(null);
    setPendingFile(null);
  };

  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderTop: `4px solid ${accentColor}`,
        padding: "1.5rem",
        marginBottom: "1.25rem",
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "0.875rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#161616",
              marginBottom: "0.25rem",
            }}
          >
            Upload IBM Product Lifecycle Catalog
          </div>
          <div style={{ fontSize: "0.8125rem", color: "#525252", maxWidth: 520 }}>
            Upload the IBM Product Lifecycle Catalog. Provides End of Support dates that drive the
            status badges in the Insights → Upgrade Opportunities section. Only Software (Type = SW) rows are
            stored — Hardware rows are discarded during processing. Uploading replaces the existing
            catalog entirely.
          </div>
        </div>
        {statusBadge && (
          <div style={{ fontSize: "0.8125rem", textAlign: "right" }}>
            <div style={{ color: "#525252" }}>
              <strong style={{ color: "#161616" }}>{statusBadge.count.toLocaleString()}</strong>{" "}
              {statusBadge.label}
            </div>
            {statusBadge.lastUpdated && (
              <div style={{ color: "#8d8d8d", fontSize: "0.75rem" }}>
                Last updated {new Date(statusBadge.lastUpdated).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      {state === "idle" && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={DocumentImport}
            onClick={() => fileRef.current?.click()}
          >
            Choose Lifecycle Catalog (.csv / .xlsx)
          </Button>
          {result && (
            <span
              style={{
                fontSize: "0.8125rem",
                color: "#198038",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <CheckmarkFilled size={16} /> Upload complete — click to upload again
            </span>
          )}
        </div>
      )}

      {state === "uploading" && (
        <InlineLoading description="Uploading lifecycle catalog…" status="active" />
      )}

      {state === "success" && result && (
        <div style={{ marginTop: "0.5rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.75rem",
            }}
          >
            <CheckmarkFilled size={20} style={{ color: "#198038" }} />
            <span style={{ fontWeight: 600, color: "#198038", fontSize: "0.875rem" }}>
              Lifecycle catalog uploaded
            </span>
          </div>
          <div
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}
          >
            <Tag type="green" size="sm">
              {(result.rows ?? 0).toLocaleString()} software products loaded
            </Tag>
            {(result.hardwareSkipped ?? 0) > 0 && (
              <Tag type="gray" size="sm">
                {(result.hardwareSkipped ?? 0).toLocaleString()} hardware rows skipped
              </Tag>
            )}
          </div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "#525252",
              marginBottom: "0.75rem",
              maxWidth: 560,
            }}
          >
            Use <strong>Product Lifecycle Mapping</strong> below to review which CSP products
            resolve against this catalog and to map the ones that don&apos;t.
          </div>
          <Button kind="ghost" size="sm" renderIcon={Upload} onClick={reset}>
            Upload Another File
          </Button>
        </div>
      )}

      {state === "error" && (
        <div style={{ marginTop: "0.5rem" }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}
          >
            <WarningFilled size={20} style={{ color: "#da1e28" }} />
            <span style={{ fontWeight: 600, color: "#da1e28", fontSize: "0.875rem" }}>
              {errorMsg}
            </span>
          </div>
          <Button kind="ghost" size="sm" onClick={reset}>
            Try Again
          </Button>
        </div>
      )}

      {state === "mapping" && (
        <ColumnMappingModal
          uploadType="lifecycle"
          uploadedHeaders={uploadedHeaders}
          fieldDefs={fieldDefs}
          savedMapping={savedMapping}
          onSave={handleMappingSave}
          onCancel={() => {
            reset();
          }}
        />
      )}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Read just the header row. CSV is sliced so a very large catalog isn't fully decoded. */
async function peekFileHeaders(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();

  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = new TextDecoder().decode(new Uint8Array(buf).slice(0, 16384));
    const firstLine = text.split(/\r?\n/)[0];
    if (!firstLine) return [];
    const headers: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuote = !inQuote;
      else if (ch === "," && !inQuote) {
        headers.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    headers.push(cur.trim());
    return headers.filter(Boolean);
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", sheetRows: 2 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  if (rows.length === 0) return [];
  return (rows[0] as unknown[]).map(String).filter(Boolean);
}
