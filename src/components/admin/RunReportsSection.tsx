/**
 * Run Reports — admin control for batch insight generation.
 *
 * Reports are pre-generated so the Insights page loads from disk instead of
 * waiting on Bob. This panel starts a run, shows its progress, and configures
 * the schedule.
 *
 * The run does NOT lock the app: each client's report is replaced whole, so a
 * user always sees a complete report — the previous one or the new one. A
 * client with no report yet still generates live on first view, exactly as
 * before, so a first run leaves nobody worse off.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  InlineNotification,
  ProgressBar,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import { Play, Stop, Time, Renew } from "@carbon/icons-react";
import { apiFetch } from "@/lib/apiFetch";

type RunScope = "stale" | "all";
type RunState = "idle" | "running" | "completed" | "failed" | "cancelled";

interface FailedClient {
  clientId: string;
  clientName: string;
  reason: string;
}

interface RunStatus {
  runId: string;
  state: RunState;
  trigger: string;
  scope: RunScope;
  aiIncluded: boolean;
  startedAt: string;
  finishedAt: string | null;
  startedBy: string;
  total: number;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  failures: FailedClient[];
  currentClient: string | null;
  storageBackend: string;
  fatalError: string | null;
}

interface Schedule {
  enabled: boolean;
  timeOfDay: string;
  scope: RunScope;
  skipAi: boolean;
  runAfterUpload: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

interface StatusResponse {
  current: RunStatus | null;
  lastCompleted: RunStatus | null;
  running: boolean;
  storageBackend: string;
  schedule: Schedule;
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  marginBottom: "0.75rem",
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function stateTag(state: RunState) {
  const map: Record<RunState, { type: "blue" | "green" | "red" | "gray"; label: string }> = {
    idle: { type: "gray", label: "Idle" },
    running: { type: "blue", label: "In progress" },
    completed: { type: "green", label: "Completed" },
    failed: { type: "red", label: "Failed" },
    cancelled: { type: "gray", label: "Cancelled" },
  };
  const s = map[state] ?? map.idle;
  return <Tag type={s.type} size="sm">{s.label}</Tag>;
}

export function RunReportsSection() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [scope, setScope] = useState<RunScope>("stale");
  const [skipAi, setSkipAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/reports/status");
      if (!res.ok) throw new Error(`Status failed (${res.status})`);
      const data = (await res.json()) as StatusResponse;
      setStatus(data);
      // Only seed the form from the server once, so typing is not overwritten
      // by the poll that runs every few seconds while a job is going.
      setSchedule((prev) => prev ?? data.schedule);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load report status");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while a run is live — no point hammering the endpoint when idle.
  useEffect(() => {
    const running = status?.running;
    if (running && !pollRef.current) {
      pollRef.current = setInterval(() => void load(), 3000);
    } else if (!running && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status?.running, load]);

  async function startRun() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/reports/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, skipAi }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not start the run");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the run");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRun() {
    setBusy(true);
    try {
      await apiFetch("/api/admin/reports/cancel", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    if (!schedule) return;
    setBusy(true);
    setSavedMsg(null);
    try {
      const res = await apiFetch("/api/admin/reports/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(schedule),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const data = (await res.json()) as { schedule: Schedule };
      setSchedule(data.schedule);
      setSavedMsg("Schedule saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the schedule");
    } finally {
      setBusy(false);
    }
  }

  const run = status?.current ?? null;
  const last = status?.lastCompleted ?? null;
  const running = !!status?.running;
  const pct = run && run.total > 0 ? Math.round((run.processed / run.total) * 100) : 0;

  return (
    <section style={{ marginTop: "2rem" }}>
      <div style={sectionTitleStyle}>Run Reports</div>
      <p style={{ fontSize: "0.82rem", color: "var(--cds-text-secondary)", marginBottom: "1rem", maxWidth: "68ch" }}>
        Pre-generates the full insights report for every customer and saves it, so the Insights page
        loads instantly instead of calling Bob live. Runs in the background — the app stays usable,
        and each customer's report is replaced whole, so nobody ever sees a half-generated report.
      </p>

      {error && (
        <InlineNotification
          kind="error"
          title="Report run"
          subtitle={error}
          lowContrast
          onCloseButtonClick={() => setError(null)}
          style={{ marginBottom: "0.75rem", maxWidth: "none" }}
        />
      )}
      {savedMsg && (
        <InlineNotification
          kind="success"
          title="Saved"
          subtitle={savedMsg}
          lowContrast
          onCloseButtonClick={() => setSavedMsg(null)}
          style={{ marginBottom: "0.75rem", maxWidth: "none" }}
        />
      )}

      {/* ── Manual trigger ── */}
      <Tile style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 260 }}>
            <Select
              id="run-scope"
              labelText="What to generate"
              value={scope}
              disabled={running}
              onChange={(e) => setScope(e.target.value as RunScope)}
            >
              <SelectItem value="stale" text="Changed customers only (recommended)" />
              <SelectItem value="all" text="All customers — full rebuild" />
            </Select>
          </div>
          <div style={{ paddingBottom: "0.4rem" }}>
            <Checkbox
              id="run-skip-ai"
              labelText="Skip AI sections (much faster, no cost)"
              checked={skipAi}
              disabled={running}
              onChange={(_: unknown, { checked }: { checked: boolean }) => setSkipAi(checked)}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", paddingBottom: "0.1rem" }}>
            <Button
              kind="primary"
              size="md"
              renderIcon={Play}
              disabled={busy || running}
              onClick={() => void startRun()}
            >
              Run reports
            </Button>
            {running && (
              <Button kind="danger--tertiary" size="md" renderIcon={Stop} disabled={busy} onClick={() => void cancelRun()}>
                Cancel
              </Button>
            )}
            <Button kind="ghost" size="md" renderIcon={Renew} hasIconOnly iconDescription="Refresh status" onClick={() => void load()} />
          </div>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.75rem", marginBottom: 0 }}>
          A full rebuild runs the AI for every customer with case data. That is thousands of Bob calls
          and several hours — use "changed customers only" unless you specifically need everything rebuilt.
          Storage backend: <strong>{status?.storageBackend ?? "—"}</strong>
        </p>
      </Tile>

      {/* ── Live progress ── */}
      {run && (
        <Tile style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.6rem" }}>
            <strong>Current run</strong>
            {stateTag(run.state)}
            <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
              {run.scope === "all" ? "full rebuild" : "changed only"} · {run.aiIncluded ? "with AI" : "no AI"} · started {fmt(run.startedAt)} by {run.startedBy}
            </span>
          </div>
          <ProgressBar
            label={`${run.processed} of ${run.total} customers`}
            helperText={run.currentClient ? `Generating: ${run.currentClient}` : undefined}
            value={pct}
            max={100}
          />
          <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.75rem", fontSize: "0.8rem" }}>
            <span>✅ {run.succeeded} generated</span>
            <span>⏭️ {run.skipped} skipped (no case data)</span>
            <span style={{ color: run.failed ? "#da1e28" : undefined }}>❌ {run.failed} failed</span>
          </div>
        </Tile>
      )}

      {/* ── Last completed run ── */}
      {last && (
        <Tile style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
            <strong>Last run</strong>
            {stateTag(last.state)}
            <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
              finished {fmt(last.finishedAt)} · triggered by {last.trigger}
            </span>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.8rem", marginBottom: last.failures.length ? "0.75rem" : 0 }}>
            <span>{last.succeeded} generated</span>
            <span>{last.skipped} skipped</span>
            <span style={{ color: last.failed ? "#da1e28" : undefined }}>{last.failed} failed</span>
            <span>of {last.total} selected</span>
          </div>
          {last.fatalError && (
            <InlineNotification kind="error" title="Run aborted" subtitle={last.fatalError} lowContrast hideCloseButton style={{ maxWidth: "none" }} />
          )}
          {last.failures.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>
                {last.failures.length} failed customer{last.failures.length === 1 ? "" : "s"}
              </summary>
              <div style={{ maxHeight: 220, overflow: "auto", marginTop: "0.5rem", fontSize: "0.78rem" }}>
                {last.failures.map((f) => (
                  <div key={f.clientId} style={{ padding: "0.3rem 0", borderBottom: "1px solid var(--cds-border-subtle-01)" }}>
                    <strong>{f.clientName || f.clientId}</strong>
                    <div style={{ color: "var(--cds-text-secondary)" }}>{f.reason}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Tile>
      )}

      {/* ── Schedule ── */}
      {schedule && (
        <Tile>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Time size={16} />
            <strong>Schedule</strong>
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <Checkbox
              id="sched-enabled"
              labelText="Run on a daily schedule"
              checked={schedule.enabled}
              onChange={(_: unknown, { checked }: { checked: boolean }) => setSchedule({ ...schedule, enabled: checked })}
            />
            <div style={{ width: 130 }}>
              <TextInput
                id="sched-time"
                labelText="Time (24h)"
                value={schedule.timeOfDay}
                placeholder="02:00"
                disabled={!schedule.enabled}
                onChange={(e) => setSchedule({ ...schedule, timeOfDay: e.target.value })}
              />
            </div>
            <div style={{ minWidth: 240 }}>
              <Select
                id="sched-scope"
                labelText="Scope"
                value={schedule.scope}
                disabled={!schedule.enabled}
                onChange={(e) => setSchedule({ ...schedule, scope: e.target.value as RunScope })}
              >
                <SelectItem value="stale" text="Changed customers only" />
                <SelectItem value="all" text="All customers" />
              </Select>
            </div>
            <Checkbox
              id="sched-skip-ai"
              labelText="Skip AI sections"
              checked={schedule.skipAi}
              disabled={!schedule.enabled}
              onChange={(_: unknown, { checked }: { checked: boolean }) => setSchedule({ ...schedule, skipAi: checked })}
            />
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <Checkbox
              id="sched-after-upload"
              labelText="Also refresh changed customers after a data upload"
              checked={schedule.runAfterUpload}
              onChange={(_: unknown, { checked }: { checked: boolean }) => setSchedule({ ...schedule, runAfterUpload: checked })}
            />
            <p style={{ fontSize: "0.73rem", color: "var(--cds-text-secondary)", margin: "0.15rem 0 0 1.6rem" }}>
              Starts five minutes after the last upload finishes, so loading several files in a row
              produces one run rather than one per file.
            </p>
          </div>

          <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
            <Button kind="tertiary" size="sm" disabled={busy} onClick={() => void saveSchedule()}>
              Save schedule
            </Button>
            <span style={{ fontSize: "0.73rem", color: "var(--cds-text-secondary)" }}>
              {schedule.updatedAt ? `Last changed ${fmt(schedule.updatedAt)} by ${schedule.updatedBy ?? "—"}` : "Never changed"}
            </span>
          </div>

          <p style={{ fontSize: "0.73rem", color: "var(--cds-text-secondary)", marginTop: "0.75rem", marginBottom: 0 }}>
            The schedule timer lives in the server process. Its settings are saved, but a run that
            would have fired while the server was down is skipped rather than caught up.
          </p>
        </Tile>
      )}
    </section>
  );
}
