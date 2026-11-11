/**
 * CSP Product Catalog
 * ───────────────────
 * The distinct list of Software/SaaS product names appearing anywhere in CSP
 * case data, used to populate the Products dropdown on the Contract tab's
 * Account Team section.
 *
 * Deriving this means reading the whole case store (~550MB), so it is cached
 * on disk against the same data fingerprint used elsewhere — a stat() per
 * file, no reads, and the result survives restarts. Without that this would
 * be a multi-second cost on every Contract tab load.
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";
import type { CspCase } from "./dataIngestionService";
import { cspDataFingerprint, readDiskCache, writeDiskCache } from "./dataFingerprint";

let cached: string[] | null = null;
let cachedFingerprint = "";

function cspDir(): string {
  return path.join(path.dirname(getExcelFilePath()), "csp");
}

function legacyCspPath(): string {
  return path.join(path.dirname(getExcelFilePath()), "csp_data.json");
}

/**
 * Every distinct Software/SaaS product name across all CSP data, sorted.
 *
 * Not restricted to a single client: the dropdown deliberately offers the full
 * catalogue so a team member can be assigned a product the client has not yet
 * raised a case for.
 */
export function getCspProductNames(): string[] {
  const fingerprint = cspDataFingerprint();
  if (cached && cachedFingerprint === fingerprint) return cached;

  const fromDisk = readDiskCache<string[]>("csp_product_names", fingerprint);
  if (fromDisk) {
    cached = fromDisk;
    cachedFingerprint = fingerprint;
    return fromDisk;
  }

  const names = new Set<string>();
  const files: string[] = [];
  try {
    if (fs.existsSync(legacyCspPath())) files.push(legacyCspPath());
  } catch {
    /* ignore */
  }
  try {
    const dir = cspDir();
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".json")) files.push(path.join(dir, f));
      }
    }
  } catch {
    /* ignore */
  }

  for (const file of files) {
    let rows: CspCase[];
    try {
      rows = JSON.parse(fs.readFileSync(file, "utf-8")) as CspCase[];
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) continue;
    for (const c of rows) {
      const hw = String(c.hwSwSaas ?? "").toLowerCase();
      if (hw !== "software" && hw !== "saas") continue;
      const name = String(c.productName ?? "").trim();
      if (name) names.add(name);
    }
    // Release the batch before reading the next file.
    rows.length = 0;
  }

  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  cached = sorted;
  cachedFingerprint = fingerprint;
  writeDiskCache("csp_product_names", fingerprint, sorted);
  return sorted;
}
