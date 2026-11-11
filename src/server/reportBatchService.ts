/**
 * Report Batch Service
 * ────────────────────
 * Generates and saves insight reports for every customer, one by one, in the
 * background.
 *
 * ── Why this exists ──
 * The Insights page calls Bob live on every first view, which costs the user a
 * minute of waiting. Pre-generating means the page loads from disk instead.
 *
 * ── Why it does not lock the app ──
 * Reports are written one file per client via an atomic rename, so a reader
 * during a run sees either the previous complete report or the new complete
 * report — never a mixture. There is no half-generated state to protect users
 * from, and a lock would mean a multi-hour outage for a job that costs hours.
 * A client with NO report yet falls back to live generation exactly as today,
 * so a first run leaves nobody worse off than before it started.
 *
 * ── Cost control ──
 * A full run is ~6 Bob CLI processes per client across ~600 eligible clients.
 * That is thousands of AI calls and real money, so the default scope is
 * "stale only": a client is regenerated when its source fingerprint has moved
 * since its last report. An upload that touches one customer costs one report.
 *
 * ── Concurrency ──
 * Clients are processed through a small worker pool. Each client already
 * spawns six Bob processes in parallel, so the pool size multiplies that —
 * keep it low. REPORT_BATCH_CONCURRENCY overrides the default of 2.
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";
import { safeReadClientOverview } from "./caseDataReader";
import { cspDataFingerprint } from "./dataFingerprint";
import {
  getPrimedCspDateRange,
  primeCspCaseIndex,
  releaseCspCaseIndex,
} from "./dataIngestionService";
import { generateReportForClient } from "./insightsGenerator";
import { clientSourceFingerprint } from "./reportFingerprint";
import { readReport, saveReport, activeBackendName } from "./reportStore";
import { writeOpportunitySummary } from "./opportunitySummary";

export type RunScope = "stale" | "all";
export type RunTrigger = "manual" | "scheduled" | "upload";
export type RunState = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface FailedClient {
  clientId: string;
  clientName: string;
  reason: string;
}

export interface RunStatus {
  runId: string;
  state: RunState;
  trigger: RunTrigger;
  scope: RunScope;
  aiIncluded: boolean;
  startedAt: string;
  finishedAt: string | null;
  startedBy: string;

  /** Clients selected for this run — the denominator in "x of y". */
  total: number;
  processed: number;
  succeeded: number;
  /** Eligible but had no case data — expected, not an error. */
  skipped: number;
  /** Customers with no cases that still got a contract-only summary. */
  contractOnly: number;
  failed: number;
  failures: FailedClient[];

  /** Name of the client currently being generated, for the progress line. */
  currentClient: string | null;
  storageBackend: string;
  /** Populated when the run itself died rather than an individual client. */
  fatalError: string | null;
}

/** Persisted so "last successful run" survives a restart. */
interface StatusFile {
  current: RunStatus | null;
  lastCompleted: RunStatus | null;
}

function statusPath(): string {
  return path.join(path.dirname(getExcelFilePath()), "report_runs.json");
}

function readStatusFile(): StatusFile {
  try {
    const p = statusPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as StatusFile;
    }
  } catch {
    /* a corrupt status file must not stop a new run from starting */
  }
  return { current: null, lastCompleted: null };
}

function writeStatusFile(file: StatusFile): void {
  try {
    const p = statusPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(file, null, 2), "utf-8");
  } catch (e) {
    console.error("[report-batch] could not persist status", e);
  }
}

/**
 * The live run. Held in memory because it changes every few seconds and
 * writing 600 times would be pointless churn; it is flushed to disk on
 * milestones and at the end, which is what survives a restart.
 */
let active: RunStatus | null = null;
let cancelRequested = false;

/** A run interrupted by a restart is reported as failed, not left "running". */
function reconcileOnBoot(): void {
  const file = readStatusFile();
  if (file.current && file.current.state === "running") {
    file.current.state = "failed";
    file.current.fatalError = "Server restarted while the run was in progress.";
    file.current.finishedAt = new Date().toISOString();
    file.lastCompleted = file.lastCompleted ?? null;
    writeStatusFile({ current: null, lastCompleted: file.lastCompleted });
  }
}
reconcileOnBoot();

export function getRunStatus(): { current: RunStatus | null; lastCompleted: RunStatus | null } {
  const file = readStatusFile();
  return { current: active, lastCompleted: file.lastCompleted };
}

export function isRunInProgress(): boolean {
  return active !== null && active.state === "running";
}

export function requestCancel(): boolean {
  if (!isRunInProgress()) return false;
  cancelRequested = true;
  return true;
}

/**
 * Give the event loop a turn.
 *
 * Report generation is CPU-bound between awaits — analysing thousands of cases
 * is synchronous. setImmediate lets pending HTTP requests be served, which is
 * what keeps "runs in the background" true rather than nominal.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function concurrency(): number {
  const raw = Number(process.env.REPORT_BATCH_CONCURRENCY ?? "2");
  return Number.isFinite(raw) && raw >= 1 && raw <= 8 ? Math.floor(raw) : 2;
}

/** Every client in the system, with the CMR needed to prime the case index. */
function allClients(): { clientId: string; clientName: string; cmr: string }[] {
  return safeReadClientOverview()
    .map((r) => ({
      clientId: String(r.client_id ?? "").trim(),
      clientName: String(r.client_name ?? "").trim(),
      cmr: String(r.cmr_number ?? "").trim(),
    }))
    .filter((c) => c.clientId);
}

/**
 * Decide which clients this run will touch.
 *
 * "all"   — every client with a CMR.
 * "stale" — only those whose source fingerprint differs from the one stored on
 *           their last report, plus any client with no report at all.
 *
 * Requires the case index to be primed, or the fingerprint check is as
 * expensive as the generation it is trying to avoid.
 */
async function selectClients(
  scope: RunScope,
  clients: ReturnType<typeof allClients>,
  cspToken: string,
): Promise<ReturnType<typeof allClients>> {
  if (scope === "all") return clients.filter((c) => c.cmr);

  const out: typeof clients = [];
  let sinceYield = 0;
  for (const c of clients) {
    // Hand the event loop back regularly. Fingerprinting ~950 clients is
    // synchronous work, and without this the server answers nothing until the
    // whole selection finishes.
    if (++sinceYield >= 25) {
      sinceYield = 0;
      await yieldToEventLoop();
    }
    if (!c.cmr) continue;
    const existing = await readReport(c.clientId);
    if (!existing) {
      out.push(c);
      continue;
    }
    if (!existing.sourceFingerprint) {
      // Written before fingerprinting existed — cannot prove it is current.
      out.push(c);
      continue;
    }
    if (existing.sourceFingerprint !== clientSourceFingerprint(c.clientId, cspToken)) {
      out.push(c);
    }
  }
  return out;
}

export interface StartRunOptions {
  scope: RunScope;
  trigger: RunTrigger;
  startedBy: string;
  /** Skip the Bob calls — a fast, free run that still refreshes the analysis. */
  skipAi?: boolean;
}

/**
 * Start a run. Returns immediately with the run id; the work continues in the
 * background so the HTTP request never blocks or times out.
 */
export function startRun(opts: StartRunOptions): { ok: true; runId: string } | { ok: false; error: string } {
  if (isRunInProgress()) {
    return { ok: false, error: "A report run is already in progress." };
  }

  const runId = `run-${Date.now().toString(36)}`;
  cancelRequested = false;

  active = {
    runId,
    state: "running",
    trigger: opts.trigger,
    scope: opts.scope,
    aiIncluded: !opts.skipAi,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    startedBy: opts.startedBy || "unknown",
    total: 0,
    processed: 0,
    succeeded: 0,
    skipped: 0,
    contractOnly: 0,
    failed: 0,
    failures: [],
    currentClient: null,
    storageBackend: activeBackendName(),
    fatalError: null,
  };
  writeStatusFile({ current: active, lastCompleted: readStatusFile().lastCompleted });

  // Deliberately not awaited — this is the background job.
  void execute(opts).catch((e) => {
    if (active) {
      active.state = "failed";
      active.fatalError = e instanceof Error ? e.message : String(e);
      active.finishedAt = new Date().toISOString();
      finish();
    }
  });

  return { ok: true, runId };
}

function finish(): void {
  if (!active) return;
  const done = { ...active };
  writeStatusFile({ current: null, lastCompleted: done });
  active = null;
  releaseCspCaseIndex();
}

async function execute(opts: StartRunOptions): Promise<void> {
  const clients = allClients();

  // One pass over the CSP store for the whole run. Without this each client
  // re-parses ~550MB and a 600-client run spends hours purely on JSON.
  const fingerprint = cspDataFingerprint();
  primeCspCaseIndex(clients.map((c) => c.cmr).filter(Boolean), fingerprint);
  // One window for the whole run, so every customer is judged over the same
  // twelve months of CSP data.
  const cspDateRange = getPrimedCspDateRange();

  const selected = await selectClients(opts.scope, clients, fingerprint);
  if (!active) return;
  active.total = selected.length;
  writeStatusFile({ current: active, lastCompleted: readStatusFile().lastCompleted });

  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      if (cancelRequested) return;
      const i = cursor++;
      if (i >= selected.length) return;
      const client = selected[i];
      if (!active) return;
      active.currentClient = client.clientName || client.clientId;

      // Human-readable: this string is shown verbatim on the Insights page
      // ("generated by ..."), so it must read as an explanation, not a code.
      const label =
        opts.trigger === "scheduled"
          ? "Scheduled report run"
          : opts.trigger === "upload"
            ? "Automatic run after data upload"
            : `Report run started by ${opts.startedBy}`;

      const outcome = await generateReportForClient(client.clientId, {
        generatedBy: label,
        skipAi: opts.skipAi,
        // The Executive Account Summary is written HERE and nowhere else, so
        // every user sees the same wording until the next run.
        withExecutiveSummary: !opts.skipAi,
        // A customer with no cases still has contracts and still needs a
        // summary saying so, rather than an empty panel.
        allowNoCaseData: true,
        // Sales opportunity rules — calculated here and saved with the report,
        // on AI and no-AI runs alike; the page only ever reads the result.
        cspDateRange: cspDateRange ?? undefined,
      });

      if (!active) return;
      if (outcome.ok) {
        try {
          let toSave = outcome.report;

          // A no-AI run refreshes the deterministic analysis. It must not
          // DESTROY AI sections a previous run paid for: without this, running
          // "skip AI" once would silently strip the written narrative from
          // every report that had one. Carry the old sections forward and let
          // the report say they are older than the figures beside them.
          if (opts.skipAi) {
            const previous = await readReport(client.clientId);
            // Detect real AI content rather than trusting the aiIncluded flag:
            // reports written before that flag existed do not carry it, and
            // testing it stripped the narrative from every pre-existing report
            // the first time a no-AI run went through.
            const previousHasAi =
              !!previous?.aiInsights &&
              Object.values(previous.aiInsights).some((v) => v && v.aiText);
            if (previous && previousHasAi) {
              toSave = {
                ...outcome.report,
                aiInsights: previous.aiInsights,
                aiIncluded: true,
                aiGeneratedAt: previous.aiGeneratedAt ?? previous.savedAt,
              } as typeof outcome.report;
            }
            // The summary is skipped too on a no-AI run; keep the previous one
            // rather than dropping the section entirely.
            if (previous?.executiveSummary && !toSave.executiveSummary) {
              toSave = { ...toSave, executiveSummary: previous.executiveSummary };
            }
          }

          await saveReport(client.clientId, toSave);
          if (outcome.contractOnly) active.contractOnly++;
          else active.succeeded++;
        } catch (e) {
          active.failed++;
          active.failures.push({
            clientId: client.clientId,
            clientName: client.clientName,
            reason: `Save failed: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      } else if (outcome.skipped) {
        // No case data is the normal state for ~360 clients, not a failure.
        active.skipped++;
      } else {
        active.failed++;
        active.failures.push({
          clientId: client.clientId,
          clientName: client.clientName,
          reason: outcome.error,
        });
      }

      active.processed++;
      await yieldToEventLoop();
      // Flush periodically so the admin panel survives a restart mid-run with
      // a roughly accurate picture, without writing on every single client.
      if (active.processed % 10 === 0) {
        writeStatusFile({ current: active, lastCompleted: readStatusFile().lastCompleted });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency() }, () => worker()));

  if (!active) return;
  active.currentClient = null;
  active.finishedAt = new Date().toISOString();
  active.state = cancelRequested ? "cancelled" : "completed";

  // The consolidated opportunity summary for the landing page — an extra file,
  // assembled from the per-customer reports just saved. Completed runs only,
  // so "Last generated" always names a run that finished.
  if (active.state === "completed") {
    active.currentClient = "Building consolidated opportunity summary";
    try {
      await writeOpportunitySummary(active.finishedAt);
    } catch (e) {
      console.error("[report-batch] opportunity summary failed", e);
    }
    active.currentClient = null;
  }
  finish();
}
