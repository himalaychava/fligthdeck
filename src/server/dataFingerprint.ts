/**
 * Data fingerprints & disk-backed caches
 * ──────────────────────────────────────
 * Several admin views are derived from the CSP case store, which is ~580MB
 * across a handful of JSON files. Deriving them means reading every file, so
 * the results must not be recomputed on each page load.
 *
 * A fingerprint is built from file names, sizes and mtimes only — a stat() per
 * file, no reads — so checking whether a cached result is still valid is
 * effectively free. Results are cached on DISK rather than in memory so they
 * also survive a server restart and a redeploy.
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";

function dataDir(): string {
  return path.dirname(getExcelFilePath());
}

function cacheDir(): string {
  return path.join(dataDir(), ".cache");
}

/** stat() a file into a compact "size:mtime" token, or "-" when absent. */
function statToken(p: string): string {
  try {
    const s = fs.statSync(p);
    return `${s.size}:${Math.floor(s.mtimeMs)}`;
  } catch {
    return "-";
  }
}

/**
 * Fingerprint of the CSP case store — every JSON file in public/data/csp plus
 * the legacy single-file store. Changes whenever data is uploaded or cleared.
 */
export function cspDataFingerprint(): string {
  const parts: string[] = [];
  const legacy = path.join(dataDir(), "csp_data.json");
  parts.push(`legacy=${statToken(legacy)}`);

  try {
    const dir = path.join(dataDir(), "csp");
    if (fs.existsSync(dir)) {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort();
      for (const f of files) parts.push(`${f}=${statToken(path.join(dir, f))}`);
    }
  } catch {
    /* treat an unreadable dir as empty — the cache simply won't hit */
  }
  return parts.join("|");
}

/**
 * Fingerprint of the Clarizen master store.
 *
 * Stat-only, so it is free to call. Needed because a re-upload can produce the
 * SAME number of rows — keying a cache on row count alone would then serve the
 * previous derivation against new data.
 */
export function clarizenDataFingerprint(): string {
  return statToken(path.join(dataDir(), "clarizen_master.json"));
}

/** Fingerprint of the lifecycle catalog and the admin mapping table. */
export function lifecycleConfigFingerprint(): string {
  return [
    `catalog=${statToken(path.join(dataDir(), "lifecycle_data.json"))}`,
    `mappings=${statToken(path.join(dataDir(), "lifecycle_mappings.json"))}`,
  ].join("|");
}

interface CacheEnvelope<T> {
  fingerprint: string;
  value: T;
  cachedAt: string;
}

/** Read a disk-cached value, or null when absent or stale. */
export function readDiskCache<T>(name: string, fingerprint: string): T | null {
  try {
    const p = path.join(cacheDir(), `${name}.json`);
    if (!fs.existsSync(p)) return null;
    const env = JSON.parse(fs.readFileSync(p, "utf-8")) as CacheEnvelope<T>;
    return env.fingerprint === fingerprint ? env.value : null;
  } catch {
    return null;
  }
}

/** Write a value to the disk cache under the given fingerprint. Never throws. */
export function writeDiskCache<T>(name: string, fingerprint: string, value: T): void {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    const env: CacheEnvelope<T> = { fingerprint, value, cachedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(cacheDir(), `${name}.json`), JSON.stringify(env), "utf-8");
  } catch {
    /* cache is an optimisation — a failure to persist must not break the request */
  }
}
