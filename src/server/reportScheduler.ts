/**
 * Report Scheduler
 * ────────────────
 * Runs the report batch unattended — on a clock, and after an upload.
 *
 * ── Two triggers ──
 *  1. TIME OF DAY. A daily slot, intended for a low-usage window. Checked once
 *     a minute against the server's local clock.
 *  2. AFTER UPLOAD. A Clarizen or CSP upload changes the inputs for some
 *     customers, so a stale-scoped run straight afterwards refreshes exactly
 *     those and nothing else. Debounced, because an admin uploading six monthly
 *     CSP files in a row should produce one run, not six.
 *
 * ── Why an interval and not cron ──
 * No cron dependency is installed, and a minute-resolution check is accurate
 * enough for an overnight job. The trade-off is that the timer lives in the
 * process: a restart stops it. The CONFIG is persisted, so the next boot
 * restores the schedule; only a run that would have fired while the process was
 * down is missed.
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";
import { startRun, isRunInProgress, type RunScope } from "./reportBatchService";

export interface ScheduleConfig {
  enabled: boolean;
  /** 24h local time, "HH:MM". */
  timeOfDay: string;
  scope: RunScope;
  /** Skip Bob — a fast, free refresh of the deterministic analysis only. */
  skipAi: boolean;
  /** Kick off a stale-scoped run shortly after any data upload. */
  runAfterUpload: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

const DEFAULTS: ScheduleConfig = {
  enabled: false,
  timeOfDay: "02:00",
  scope: "stale",
  skipAi: false,
  runAfterUpload: false,
};

function configPath(): string {
  return path.join(path.dirname(getExcelFilePath()), "report_schedule.json");
}

export function readSchedule(): ScheduleConfig {
  try {
    const p = configPath();
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<ScheduleConfig>;
      return { ...DEFAULTS, ...raw };
    }
  } catch {
    /* fall through to defaults rather than breaking the admin page */
  }
  return { ...DEFAULTS };
}

export function writeSchedule(next: Partial<ScheduleConfig>, updatedBy: string): ScheduleConfig {
  const merged: ScheduleConfig = {
    ...readSchedule(),
    ...next,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  // Reject a malformed time rather than storing one that never matches.
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(merged.timeOfDay)) {
    merged.timeOfDay = DEFAULTS.timeOfDay;
  }
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

/** "HH:MM" for right now, local time — compared against the configured slot. */
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Guards against firing repeatedly inside the same minute. */
let lastFiredSlot = "";
let timer: NodeJS.Timeout | null = null;

function tick(): void {
  try {
    const cfg = readSchedule();
    if (!cfg.enabled || isRunInProgress()) return;

    const slot = `${new Date().toDateString()} ${cfg.timeOfDay}`;
    if (nowHHMM() !== cfg.timeOfDay || lastFiredSlot === slot) return;

    lastFiredSlot = slot;
    const res = startRun({
      scope: cfg.scope,
      trigger: "scheduled",
      startedBy: "scheduler",
      skipAi: cfg.skipAi,
    });
    console.log(
      res.ok
        ? `[report-scheduler] started ${res.runId} (scope=${cfg.scope}, skipAi=${cfg.skipAi})`
        : `[report-scheduler] not started: ${res.error}`,
    );
  } catch (e) {
    console.error("[report-scheduler] tick failed", e);
  }
}

/** Start the minute timer. Safe to call more than once. */
export function initReportScheduler(): void {
  if (timer) return;
  timer = setInterval(tick, 60_000);
  // Do not hold the process open purely for the scheduler.
  timer.unref?.();
  console.log("[report-scheduler] initialised");
}

// ─── Post-upload trigger ──────────────────────────────────────────────────────

let uploadDebounce: NodeJS.Timeout | null = null;

/**
 * Called by the upload handlers once new data has landed.
 *
 * Debounced by five minutes: an admin loading several monthly CSP files back to
 * back should produce one run once they have finished, not one per file. Always
 * stale-scoped — the point is to refresh what the upload actually changed.
 */
export function notifyDataUploaded(source: "clarizen" | "csp" | "occ" | "lifecycle"): void {
  const cfg = readSchedule();
  if (!cfg.runAfterUpload) return;

  if (uploadDebounce) clearTimeout(uploadDebounce);
  uploadDebounce = setTimeout(
    () => {
      uploadDebounce = null;
      if (isRunInProgress()) return;
      const res = startRun({
        scope: "stale",
        trigger: "upload",
        startedBy: `upload:${source}`,
        skipAi: cfg.skipAi,
      });
      console.log(
        res.ok
          ? `[report-scheduler] post-upload run ${res.runId} started after ${source}`
          : `[report-scheduler] post-upload run skipped: ${res.error}`,
      );
    },
    5 * 60_000,
  );
  uploadDebounce.unref?.();
}
