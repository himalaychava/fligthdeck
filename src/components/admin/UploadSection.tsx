/**
 * UploadSection
 * ─────────────
 * Reusable upload card for the Admin data ingestion panel.
 * Handles: file pick → column mapping modal → upload → result display.
 *
 * For CSP uploads the server returns a jobId (HTTP 202) and processing
 * happens in the background. This component connects to the SSE progress
 * stream and shows a live progress bar until the job completes.
 *
 * Props control the endpoint, field definitions, labels, and styling —
 * so adding a new upload type in future requires zero changes here.
 */
import { useState, useRef, useEffect } from "react";
import { Button, InlineLoading, Tag } from "@carbon/react";
import { Upload, CheckmarkFilled, WarningFilled, DocumentImport } from "@carbon/icons-react";
import { ColumnMappingModal, type FieldDef } from "./ColumnMappingModal";

export interface UploadSectionProps {
  /** "clarizen" | "csp" */
  uploadType: "clarizen" | "csp";
  title: string;
  description: string;
  /** Fields the admin must map from the uploaded file */
  fieldDefs: FieldDef[];
  /** Currently saved column mapping (pre-fills the modal) */
  savedMapping: Record<string, string>;
  /** Current store status — shown as a status badge */
  statusBadge: { label: string; count: number; lastUpdated: string | null } | null;
  /** Called after a successful upload so parent can refresh status */
  onUploadComplete: () => void;
  accentColor?: string;
  /** Caller email to include as X-CP-Email header (static login mode) */
  callerEmail?: string;
}

type UploadState = "idle" | "mapping" | "uploading" | "processing" | "success" | "error";

interface JobProgress {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  phase: string;
  processed: number;
  total: number;
  added: number;
  skipped: number;
  error?: string;
  result?: { rows: number; merge: { added: number; skipped: number }; headers: string[] };
}

interface UploadResult {
  rows?: number;
  jobId?: string;       // present for async CSP jobs
  merge?: { added?: number; updated?: number; skipped?: number };
  onboarding?: { newClients?: string[]; skipped?: string[]; errors?: string[]; total?: number };
  /** Rows the upload refused — Clarizen only. See clarizenRejects on the server. */
  discarded?: {
    rejectedRows?: number;
    acceptedRows?: number;
    customers?: {
      customerName: string;
      rowCount: number;
      geo: string;
      market: string;
      country: string;
      reason: string;
    }[];
  };
  /** Which row the header was found on, and in which sheet — Clarizen only. */
  headerRow?: number;
  sheetName?: string;
  headers?: string[];
  error?: string;
  /** Reseller-held contracts filed under their end customers — Clarizen only. */
  endCustomers?: {
    holder: string;
    assigned: number;
    endCustomers: { customerNumber: string; name: string; contracts: number }[];
    keptOnHolder: { workOrder: string; reason: string }[];
    unnamed: { customerNumber: string; name: string }[];
  }[];
}

export function UploadSection({
  uploadType,
  title,
  description,
  fieldDefs,
  savedMapping,
  statusBadge,
  onUploadComplete,
  accentColor = "#0f62fe",
  callerEmail = "",
}: UploadSectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadedHeaders, setUploadedHeaders] = useState<string[]>([]);
  const [savedTempPath, setSavedTempPath] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const sseRef = useRef<{ close: () => void } | null>(null);

  // Cancel any in-flight poll on unmount
  useEffect(() => () => { sseRef.current?.close(); }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setState("uploading"); // show spinner while sending to server
    setErrorMsg(null);
    if (fileRef.current) fileRef.current.value = "";
    try {
      const reqHeaders: Record<string, string> = {};
      if (callerEmail) reqHeaders["x-cp-email"] = callerEmail;
      // For CSP: send file to server to extract headers (avoids parsing 700MB xlsx in browser)
      if (uploadType === "csp") {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/upload/csp/peek-headers", {
          method: "POST", headers: reqHeaders, body: fd,
        });
        const data = await res.json() as { headers?: string[]; tempPath?: string; error?: string };
        if (!res.ok || !data.headers) {
          setErrorMsg(data.error ?? "Failed to read file headers");
          setState("error");
          return;
        }
        setUploadedHeaders(data.headers);
        setSavedTempPath(data.tempPath ?? null);
      } else {
        // For clarizen/occ (smaller files): parse headers in browser
        try {
          const headers = await peekFileHeaders(file);
          setUploadedHeaders(headers);
        } catch {
          setUploadedHeaders([]);
        }
        setSavedTempPath(null);
      }
      setState("mapping");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to read file");
      setState("error");
    }
  };

  const doUpload = async (file: File, mapping: Record<string, string>) => {
    setState("uploading");
    setErrorMsg(null);
    setJobProgress(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      // Pass tempPath so server doesn't re-upload the giant file
      if (savedTempPath) formData.append("tempPath", savedTempPath);
      const headers: Record<string, string> = {};
      if (callerEmail) headers["x-cp-email"] = callerEmail;
      const res = await fetch(`/api/admin/upload/${uploadType}`, {
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
      // CSP returns a jobId (HTTP 202) — connect to SSE progress stream
      if (data.jobId) {
        setResult(data);
        setState("processing");
        startProgressStream(data.jobId, headers);
        return;
      }
      // Clarizen (synchronous) — done immediately
      setResult(data);
      setState("success");
      onUploadComplete();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Upload failed");
      setState("error");
    }
  };

  // Use polling instead of EventSource — works through Vite dev proxy and all reverse proxies
  const startProgressStream = (jobId: string, _extraHeaders: Record<string, string>) => {
    let stopped = false;
    sseRef.current = null; // not using EventSource

    const headers: Record<string, string> = {};
    if (callerEmail) headers["x-cp-email"] = callerEmail;

    async function poll() {
      if (stopped) return;
      try {
        const res = await fetch(
          `/api/admin/upload/csp/progress/${encodeURIComponent(jobId)}`,
          { headers, cache: "no-store" }
        );
        if (!res.ok) {
          setErrorMsg(`Progress check failed (${res.status})`);
          setState("error");
          return;
        }
        const job = (await res.json()) as JobProgress;
        setJobProgress(job);

        if (job.status === "done") {
          stopped = true;
          setResult({
            rows: job.result?.rows,
            merge: { added: job.result?.merge.added, skipped: job.result?.merge.skipped },
            headers: job.result?.headers,
          });
          setState("success");
          onUploadComplete();
        } else if (job.status === "error") {
          stopped = true;
          setErrorMsg(job.error ?? "Processing failed");
          setState("error");
        } else {
          // Still running — poll again in 800ms
          setTimeout(poll, 800);
        }
      } catch (e) {
        if (!stopped) {
          setErrorMsg(e instanceof Error ? e.message : "Lost connection");
          setState("error");
        }
      }
    }

    poll();

    // Store cancel fn so cleanup on unmount works
    sseRef.current = { close: () => { stopped = true; } };
  };

  const handleMappingSave = async (mapping: Record<string, string>) => {
    setState("idle"); // close modal first
    if (pendingFile) await doUpload(pendingFile, mapping);
  };

  const reset = () => {
    setState("idle");
    setResult(null);
    setErrorMsg(null);
    setPendingFile(null);
    setSavedTempPath(null);
  };

  return (
    <div style={{
      border: "1px solid #e0e0e0",
      borderTop: `4px solid ${accentColor}`,
      padding: "1.5rem",
      marginBottom: "1.25rem",
      background: "#fff",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.875rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#161616", marginBottom: "0.25rem" }}>
            {title}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "#525252", maxWidth: 520 }}>{description}</div>
        </div>
        {/* Status badge */}
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

      {/* Upload trigger */}
      {state === "idle" && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={DocumentImport}
            onClick={() => fileRef.current?.click()}
          >
            Choose File (.xlsx / .csv)
          </Button>
          {result && (
            <span style={{ fontSize: "0.8125rem", color: "#198038", display: "flex", alignItems: "center", gap: 4 }}>
              <CheckmarkFilled size={16} /> Upload complete — click to upload again
            </span>
          )}
        </div>
      )}

      {/* Uploading — transferring file to server */}
      {state === "uploading" && (
        <InlineLoading description="Uploading file to server…" status="active" />
      )}

      {/* Processing — background job running, show live progress bar */}
      {state === "processing" && (
        <div style={{ marginTop: "0.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "#161616", fontWeight: 500 }}>
              {jobProgress?.phase ?? "Processing…"}
            </span>
            {jobProgress && jobProgress.total > 0 && (
              <span style={{ fontSize: "0.75rem", color: "#525252" }}>
                {jobProgress.processed.toLocaleString()} / {jobProgress.total.toLocaleString()} rows
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, background: "#e0e0e0", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              borderRadius: 3,
              background: accentColor,
              width: jobProgress && jobProgress.total > 0
                ? `${Math.round((jobProgress.processed / jobProgress.total) * 100)}%`
                : "100%",
              transition: "width 0.3s ease",
              animation: (!jobProgress || jobProgress.total === 0) ? "cp-indeterminate 1.4s ease infinite" : "none",
            }} />
          </div>
          {jobProgress && jobProgress.total > 0 && (
            <div style={{ fontSize: "0.75rem", color: "#525252", marginTop: "0.375rem" }}>
              {Math.round((jobProgress.processed / jobProgress.total) * 100)}% complete
              {jobProgress.added > 0 && ` · ${jobProgress.added.toLocaleString()} new cases added so far`}
            </div>
          )}
          <style>{`
            @keyframes cp-indeterminate {
              0%   { transform: translateX(-100%); width: 40%; }
              100% { transform: translateX(350%);  width: 40%; }
            }
          `}</style>
        </div>
      )}

      {/* Success result */}
      {state === "success" && result && (
        <div style={{ marginTop: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <CheckmarkFilled size={20} style={{ color: "#198038" }} />
            <span style={{ fontWeight: 600, color: "#198038", fontSize: "0.875rem" }}>Upload successful</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <Tag type="green" size="sm">{result.rows ?? 0} rows processed</Tag>
            {result.merge?.added != null && <Tag type="blue" size="sm">{result.merge.added} added</Tag>}
            {result.merge?.updated != null && <Tag type="teal" size="sm">{result.merge.updated} updated</Tag>}
            {result.merge?.skipped != null && <Tag type="gray" size="sm">{result.merge.skipped} skipped (duplicate)</Tag>}
          </div>
          {/* Where the header was found — confirms the banner rows were
              skipped, rather than leaving the admin to trust it silently. */}
          {result.headerRow != null && (
            <div style={{ fontSize: "0.75rem", color: "#525252", marginBottom: "0.5rem" }}>
              Header detected on row <strong>{result.headerRow}</strong>
              {result.sheetName && <> of sheet <strong>{result.sheetName}</strong></>}
            </div>
          )}

          {/* Onboarding result (Clarizen only) */}
          {result.onboarding && (
            <div style={{ fontSize: "0.8125rem", color: "#525252", marginBottom: "0.5rem" }}>
              <strong>Client onboarding:</strong>{" "}
              {result.onboarding.newClients?.length ?? 0} new client(s) created
              {(result.onboarding.skipped?.length ?? 0) > 0 && `, ${result.onboarding.skipped!.length} already existed`}
              {(result.onboarding.errors?.length ?? 0) > 0 && (
                <span style={{ color: "#da1e28" }}>{" "}— {result.onboarding.errors!.join("; ")}</span>
              )}
            </div>
          )}
          {/* End-customer filing (Clarizen only) */}
          {result.endCustomers?.map((e) => (
            <div key={e.holder} style={{ fontSize: "0.8125rem", color: "#525252", marginBottom: "0.5rem" }}>
              <strong>{e.holder}:</strong> {e.assigned} contract(s) filed under their end customers
              {e.endCustomers.length > 0 &&
                ` (${e.endCustomers.map((x) => `${x.name} ${x.customerNumber}: ${x.contracts}`).join(", ")})`}
              {e.keptOnHolder.length > 0 && (
                <div style={{ color: "#8a3800" }}>
                  {e.keptOnHolder.length} left on {e.holder}:{" "}
                  {e.keptOnHolder.map((k) => `${k.workOrder || "(no work order)"} — ${k.reason}`).join("; ")}
                </div>
              )}
              {e.unnamed.length > 0 && (
                <div style={{ color: "#8a3800" }}>
                  No display name yet for: {e.unnamed.map((u) => `${u.name} (${u.customerNumber})`).join(", ")}
                </div>
              )}
            </div>
          ))}
          {/* Discarded rows (Clarizen only) — shown prominently rather than
              buried, because a silently dropped customer is invisible in the
              app afterwards and nobody would think to look for it. */}
          {result.discarded && (result.discarded.rejectedRows ?? 0) > 0 && (
            <div
              style={{
                border: "1px solid #f1c21b",
                background: "#fcf4d6",
                padding: "0.75rem 0.9rem",
                marginBottom: "0.75rem",
                fontSize: "0.8125rem",
                color: "#1c1c1c",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.4rem" }}>
                <WarningFilled size={16} style={{ color: "#b28600" }} />
                <strong>
                  {result.discarded.rejectedRows} row
                  {result.discarded.rejectedRows === 1 ? "" : "s"} discarded — no customer number
                </strong>
              </div>
              <p style={{ margin: "0 0 0.5rem", color: "#525252" }}>
                These were not imported and no client pages were created for them. The customer
                number is required — it is the key that case data, geography and contracts join on.
                Fix them in Clarizen and upload again.
              </p>
              <div style={{ maxHeight: 190, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#525252" }}>
                      <th style={{ padding: "0.2rem 0.4rem 0.3rem 0" }}>Customer</th>
                      <th style={{ padding: "0.2rem 0.4rem 0.3rem 0" }}>Rows</th>
                      <th style={{ padding: "0.2rem 0.4rem 0.3rem 0" }}>Geo</th>
                      <th style={{ padding: "0.2rem 0.4rem 0.3rem 0" }}>Country</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.discarded.customers?.map((c) => (
                      <tr key={c.customerName} style={{ borderTop: "1px solid #e8dfb8" }}>
                        <td style={{ padding: "0.25rem 0.4rem 0.25rem 0" }}>{c.customerName}</td>
                        <td style={{ padding: "0.25rem 0.4rem 0.25rem 0" }}>{c.rowCount}</td>
                        <td style={{ padding: "0.25rem 0.4rem 0.25rem 0" }}>{c.geo || "—"}</td>
                        <td style={{ padding: "0.25rem 0.4rem 0.25rem 0" }}>{c.country || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Button kind="ghost" size="sm" renderIcon={Upload} onClick={reset}>Upload Another File</Button>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div style={{ marginTop: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <WarningFilled size={20} style={{ color: "#da1e28" }} />
            <span style={{ fontWeight: 600, color: "#da1e28", fontSize: "0.875rem" }}>{errorMsg}</span>
          </div>
          <Button kind="ghost" size="sm" onClick={reset}>Try Again</Button>
        </div>
      )}

      {/* Column mapping modal */}
      {state === "mapping" && (
        <ColumnMappingModal
          uploadType={uploadType}
          uploadedHeaders={uploadedHeaders}
          fieldDefs={fieldDefs}
          savedMapping={savedMapping}
          onSave={handleMappingSave}
          onCancel={() => { reset(); }}
        />
      )}
    </div>
  );
}

// ─── Helper: peek at first row of uploaded file to get column headers ─────────

async function peekFileHeaders(file: File): Promise<string[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();

  // For CSV files, read as text and split the first line — much faster and more reliable
  // than piping through xlsx for a potentially huge file
  const isCSV = file.name.toLowerCase().endsWith(".csv");
  if (isCSV) {
    const text = new TextDecoder().decode(new Uint8Array(buf).slice(0, 8192));
    const firstLine = text.split(/\r?\n/)[0];
    if (!firstLine) return [];
    // Handle quoted CSV fields
    const headers: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { headers.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    headers.push(cur.trim());
    return headers.filter(Boolean);
  }

  // For Excel files — read header row only using raw array mode
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", sheetRows: 2 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  // Use header:1 to get array of arrays — first row is the headers
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  if (rows.length === 0) return [];
  return (rows[0] as unknown[]).map(String).filter(Boolean);
}
