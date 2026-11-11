/**
 * Report Store
 * ────────────
 * THE single place that decides *where* a generated client report lives.
 *
 * Everything else in the app — the batch runner, the Insights page, the
 * Executive Account Summary — calls this module and never touches a path or a
 * Box SDK directly. That is the whole point: moving reports from local disk to
 * Box is a change to `activeDriver()` and one new file, not a rewrite.
 *
 * ── Backend selection ──
 * Controlled by REPORT_STORAGE_BACKEND ("local" | "box"). Defaults to "local",
 * so nothing changes until the variable is set.
 *
 * ── Versioning ──
 * One report per client, replaced whole. There is deliberately no history:
 * `save` overwrites, and a reader always sees either the previous complete
 * report or the new complete report, never a mixture. That property is what
 * lets a batch run proceed without locking users out.
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";
import { backfillAnalysisShape, type SavedInsights } from "./insightsCacheService";

/** What a stored report looks like on the wire, whatever the backend. */
export type StoredReport = SavedInsights;

/** Listing entry — enough for the admin panel without reading every file. */
export interface ReportSummary {
  clientId: string;
  savedAt: string;
  /** Fingerprint of the source data at generation time. Drives staleness. */
  sourceFingerprint?: string;
  sizeBytes: number;
}

/**
 * A storage backend. Local and Box both implement this, so the rest of the
 * app is written against the interface and never against a filesystem.
 */
interface ReportDriver {
  readonly name: string;
  read(clientId: string): Promise<StoredReport | null>;
  save(clientId: string, report: StoredReport): Promise<void>;
  remove(clientId: string): Promise<void>;
  list(): Promise<ReportSummary[]>;
}

// ─── Local disk driver ────────────────────────────────────────────────────────

function localDir(): string {
  return path.join(path.dirname(getExcelFilePath()), "insights_cache");
}

/** Sanitised so a client id can never escape the directory. */
function localPath(clientId: string): string {
  const safe = clientId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(localDir(), `${safe}.json`);
}

const localDriver: ReportDriver = {
  name: "local",

  async read(clientId) {
    try {
      const p = localPath(clientId);
      if (!fs.existsSync(p)) return null;
      const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as StoredReport;
      // Repair the shape on the way out. Reports written before a field
      // existed replay with it undefined, and a consumer that calls .filter()
      // on it crashes — which is exactly what happened to the Executive
      // Summary on pre-existing files. Doing it here means no future reader
      // has to remember.
      return backfillAnalysisShape(parsed);
    } catch {
      // An unreadable report degrades to "none saved" so the caller falls back
      // to live generation rather than showing an error page.
      return null;
    }
  },

  async save(clientId, report) {
    const dir = localDir();
    fs.mkdirSync(dir, { recursive: true });
    // Write to a temp file and rename. Rename is atomic on the same
    // filesystem, so a reader during a batch run can never observe a
    // half-written report — which is what makes the no-lock design safe.
    const finalPath = localPath(clientId);
    const tmpPath = `${finalPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(report), "utf-8");
    fs.renameSync(tmpPath, finalPath);
  },

  async remove(clientId) {
    try {
      fs.unlinkSync(localPath(clientId));
    } catch {
      /* already gone */
    }
  },

  async list() {
    const dir = localDir();
    if (!fs.existsSync(dir)) return [];
    const out: ReportSummary[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const full = path.join(dir, file);
      try {
        const stat = fs.statSync(full);
        const parsed = JSON.parse(fs.readFileSync(full, "utf-8")) as StoredReport;
        out.push({
          clientId: parsed.clientId ?? file.replace(/\.json$/, ""),
          savedAt: parsed.savedAt ?? new Date(stat.mtimeMs).toISOString(),
          sourceFingerprint: (parsed as { sourceFingerprint?: string }).sourceFingerprint,
          sizeBytes: stat.size,
        });
      } catch {
        /* skip unreadable files rather than failing the whole listing */
      }
    }
    return out;
  },
};

// ─── Box driver — NOT YET IMPLEMENTED ─────────────────────────────────────────

/*
 * TODO(box): Implement the Box-backed driver.
 *
 * Credentials and app setup already exist in the organisation — ask Alok or
 * Manav for the existing Box app registration rather than creating a new one.
 *
 * Expected environment:
 *   BOX_CLIENT_ID
 *   BOX_CLIENT_SECRET
 *   BOX_ENTERPRISE_ID        (for JWT / client-credentials server auth)
 *   BOX_REPORTS_FOLDER_ID    (the folder reports live in)
 *
 * Implementation notes for whoever picks this up:
 *   - Reports are addressed by client id. Store them as "<clientId>.json" in
 *     BOX_REPORTS_FOLDER_ID and keep a cached id map, because Box addresses
 *     files by file id, not by name, and a name lookup per read is a round trip.
 *   - save() must REPLACE, not version: upload a new version of the existing
 *     file id when present, create it when not. Box keeps its own version
 *     history server-side; that is fine and is not the same as us accumulating
 *     report versions.
 *   - Box has no atomic rename. The local driver's temp-file trick does not
 *     translate, so a reader could observe a partial upload. Mitigate by
 *     uploading to a staging name and then moving, or accept it and reinstate
 *     the maintenance lock for Box runs.
 *   - Rate limits are per-app. The batch runner's concurrency limit
 *     (REPORT_BATCH_CONCURRENCY) applies to generation, not upload; add a
 *     separate upload queue if Box starts returning 429.
 *
 * const boxDriver: ReportDriver = { name: "box", ... };
 */

// ─── Driver selection ─────────────────────────────────────────────────────────

function activeDriver(): ReportDriver {
  const backend = (process.env.REPORT_STORAGE_BACKEND ?? "local").trim().toLowerCase();
  if (backend === "box") {
    // TODO(box): return boxDriver once implemented.
    console.warn(
      "[reportStore] REPORT_STORAGE_BACKEND=box but the Box driver is not implemented yet — falling back to local disk.",
    );
    return localDriver;
  }
  return localDriver;
}

/** Which backend is in use. Surfaced in the admin panel so it is never a guess. */
export function activeBackendName(): string {
  return activeDriver().name;
}

export function readReport(clientId: string): Promise<StoredReport | null> {
  return activeDriver().read(clientId);
}

export function saveReport(clientId: string, report: StoredReport): Promise<void> {
  return activeDriver().save(clientId, report);
}

export function removeReport(clientId: string): Promise<void> {
  return activeDriver().remove(clientId);
}

export function listReports(): Promise<ReportSummary[]> {
  return activeDriver().list();
}
