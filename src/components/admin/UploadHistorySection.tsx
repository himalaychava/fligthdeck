import { Fragment, useCallback, useEffect, useState } from "react";
import { Button, InlineLoading, InlineNotification, Tag } from "@carbon/react";
import { Download, View, ViewOff, Renew } from "@carbon/icons-react";
import { apiFetch } from "@/lib/apiFetch";

/** Mirrors UploadSummary / UploadRecord in src/server/uploadHistory.ts. */
interface UploadSummary {
  id: string;
  kind: "clarizen" | "csp";
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  status: "success" | "failed";
  headline: string;
  legacy?: boolean;
}

interface ContractLine {
  workOrder: string;
  contractName: string;
  customerName: string;
  customerNumber: string;
}

interface UploadRecord extends UploadSummary {
  durationMs: number | null;
  error?: string;
  note?: string;
  clarizen?: {
    rowsInFile: number;
    rowsStored: number;
    rowsDiscarded: number;
    headerRow: number | null;
    sheetName: string;
    newPages: { clientId: string; name: string; customerNumber: string }[];
    pagesAlreadyExisting: number;
    discarded: { customerName: string; rowCount: number }[];
    endCustomers: {
      holder: string;
      assigned: number;
      endCustomers: { customerNumber: string; name: string; contracts: number }[];
      keptOnHolder: { workOrder: string; reason: string }[];
    }[];
    changes: {
      added: ContractLine[];
      removed: ContractLine[];
      changed: {
        workOrder: string;
        customerName: string;
        field: string;
        before: string;
        after: string;
      }[];
    } | null;
  };
  csp?: {
    mode: string;
    rowsInFile: number;
    casesInFile: number;
    added: number;
    skipped: number;
    openDateFrom: string;
    openDateTo: string;
  };
}

type Filter = "all" | "clarizen" | "csp";

/** How many entries of each list the inline view shows; the download has them all. */
const PREVIEW = 10;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const cell: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid #e0e0e0",
  fontSize: "0.8125rem",
  verticalAlign: "top",
};

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.8125rem", marginBottom: "0.25rem" }}>
      <span style={{ color: "#525252" }}>{label}:</span> <strong>{value}</strong>
    </div>
  );
}

function List({ title, items, total }: { title: string; items: string[]; total: number }) {
  if (total === 0) return null;
  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
        {title} ({total})
      </div>
      <ul style={{ margin: "0.25rem 0 0 1.25rem", fontSize: "0.8125rem", color: "#393939" }}>
        {items.slice(0, PREVIEW).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      {total > PREVIEW && (
        <div style={{ fontSize: "0.75rem", color: "#6f6f6f", marginTop: "0.25rem" }}>
          Showing {PREVIEW} of {total}. Download the report for the full list.
        </div>
      )}
    </div>
  );
}

function Details({ record }: { record: UploadRecord }) {
  if (record.legacy) {
    return (
      <p style={{ fontSize: "0.8125rem", color: "#525252", margin: 0 }}>
        Recorded before upload reports existed, so only the file, date and uploader are known.
      </p>
    );
  }
  const c = record.clarizen;
  const s = record.csp;
  return (
    <div>
      {record.note && <Fact label="Note" value={record.note} />}
      {record.error && <Fact label="Error" value={record.error} />}
      {record.durationMs !== null && (
        <Fact label="Duration" value={`${Math.round(record.durationMs / 100) / 10} s`} />
      )}
      {c && (
        <>
          <Fact label="Sheet / header row" value={`${c.sheetName} / row ${c.headerRow ?? "?"}`} />
          <Fact
            label="Rows"
            value={`${c.rowsInFile.toLocaleString()} in file · ${c.rowsStored.toLocaleString()} stored · ${c.rowsDiscarded} discarded`}
          />
          <Fact
            label="Customer pages"
            value={`${c.newPages.length} new · ${c.pagesAlreadyExisting.toLocaleString()} already existed`}
          />
          {c.endCustomers.map((e) => (
            <Fact
              key={e.holder}
              label={e.holder}
              value={`${e.assigned} contract(s) filed under end customers${
                e.keptOnHolder.length ? `, ${e.keptOnHolder.length} left on holder` : ""
              }`}
            />
          ))}
          {c.changes ? (
            <Fact
              label="Since previous upload"
              value={`${c.changes.added.length} contracts added · ${c.changes.removed.length} removed · ${c.changes.changed.length} field changes`}
            />
          ) : (
            <Fact label="Since previous upload" value="No previous upload to compare with" />
          )}
          <List
            title="New customer pages"
            total={c.newPages.length}
            items={c.newPages.map((p) => `${p.name} (${p.customerNumber})`)}
          />
          <List
            title="Discarded — no customer number"
            total={c.discarded.length}
            items={c.discarded.map((d) => `${d.customerName} — ${d.rowCount} row(s)`)}
          />
          {c.changes && (
            <>
              <List
                title="Contracts added"
                total={c.changes.added.length}
                items={c.changes.added.map((x) => `${x.workOrder} · ${x.customerName}`)}
              />
              <List
                title="Contracts removed"
                total={c.changes.removed.length}
                items={c.changes.removed.map((x) => `${x.workOrder} · ${x.customerName}`)}
              />
              <List
                title="Contract changes"
                total={c.changes.changed.length}
                items={c.changes.changed.map(
                  (x) =>
                    `${x.workOrder} · ${x.customerName} · ${x.field}: ${x.before || "—"} → ${x.after || "—"}`,
                )}
              />
            </>
          )}
        </>
      )}
      {s && (
        <>
          <Fact label="Mode" value={s.mode} />
          <Fact
            label="Rows"
            value={`${s.rowsInFile.toLocaleString()} in file · ${s.casesInFile.toLocaleString()} with a case number`}
          />
          <Fact
            label="Cases"
            value={`${s.added.toLocaleString()} new · ${s.skipped.toLocaleString()} duplicates skipped`}
          />
          {s.openDateFrom && (
            <Fact label="Case open dates in file" value={`${s.openDateFrom} to ${s.openDateTo}`} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Admin → Upload History: every Clarizen and CSP upload, with what it did.
 * `active` is true while the tab is shown, so the list refreshes on each visit.
 */
export function UploadHistorySection({ active }: { active: boolean }) {
  const [uploads, setUploads] = useState<UploadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, UploadRecord>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/admin/upload-history", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load upload history (${res.status})`);
      const body = (await res.json()) as { uploads: UploadSummary[] };
      setUploads(body.uploads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load upload history");
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const toggle = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (details[id]) return;
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/admin/upload-history/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const record = (await res.json()) as UploadRecord;
        setDetails((d) => ({ ...d, [id]: record }));
      }
    } finally {
      setBusyId(null);
    }
  };

  const download = async (u: UploadSummary) => {
    setBusyId(u.id);
    try {
      const res = await apiFetch(`/api/admin/upload-history/${encodeURIComponent(u.id)}/report`);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `upload-report-${u.kind}-${u.uploadedAt.slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  };

  const shown = (uploads ?? []).filter((u) => filter === "all" || u.kind === filter);

  return (
    <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", padding: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: "1rem", fontWeight: 600 }}>Upload History</div>
          <div style={{ fontSize: "0.8125rem", color: "#525252", marginTop: "0.25rem" }}>
            Every Clarizen and CSP upload, with what it did. View a summary here or download the
            full report as Excel.
          </div>
        </div>
        {(["all", "clarizen", "csp"] as Filter[]).map((f) => (
          <Button
            key={f}
            kind={filter === f ? "primary" : "ghost"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "clarizen" ? "Clarizen" : "CSP"}
          </Button>
        ))}
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Renew}
          hasIconOnly
          iconDescription="Refresh"
          onClick={() => void load()}
        />
      </div>

      {error && (
        <InlineNotification
          kind="error"
          title="Upload history"
          subtitle={error}
          lowContrast
          hideCloseButton
        />
      )}
      {uploads === null && !error && <InlineLoading description="Loading upload history…" />}
      {uploads !== null && shown.length === 0 && (
        <p style={{ fontSize: "0.8125rem", color: "#525252" }}>No uploads recorded yet.</p>
      )}

      {shown.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f4f4f4", textAlign: "left" }}>
              {["Date", "Type", "File", "Uploaded by", "Result", ""].map((h) => (
                <th
                  key={h}
                  style={{ ...cell, fontWeight: 600, fontSize: "0.75rem", color: "#525252" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <Fragment key={u.id}>
                <tr>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{formatWhen(u.uploadedAt)}</td>
                  <td style={cell}>
                    <Tag size="sm" type={u.kind === "clarizen" ? "blue" : "purple"}>
                      {u.kind === "clarizen" ? "Clarizen" : "CSP"}
                    </Tag>
                  </td>
                  <td style={{ ...cell, wordBreak: "break-word" }}>{u.fileName || "—"}</td>
                  <td style={cell}>{u.uploadedBy || "—"}</td>
                  <td style={cell}>
                    <span
                      style={{
                        color: u.status === "success" ? "#198038" : "#da1e28",
                        fontWeight: 600,
                      }}
                    >
                      {u.status === "success" ? "Success" : "Failed"}
                    </span>
                    <div style={{ color: "#525252", marginTop: "0.15rem" }}>{u.headline}</div>
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={openId === u.id ? ViewOff : View}
                      onClick={() => void toggle(u.id)}
                    >
                      {openId === u.id ? "Hide" : "View"}
                    </Button>
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Download}
                      disabled={busyId === u.id}
                      onClick={() => void download(u)}
                    >
                      Download
                    </Button>
                  </td>
                </tr>
                {openId === u.id && (
                  <tr>
                    <td colSpan={6} style={{ ...cell, background: "#fafafa" }}>
                      {details[u.id] ? (
                        <Details record={details[u.id]} />
                      ) : (
                        <InlineLoading description="Loading details…" />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
