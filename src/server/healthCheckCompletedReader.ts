/**
 * Health Check Completed File Reader
 *
 * Reads completed health check Excel files from the shared directory
 * and provides the data to the Control Plane UI.
 */

import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { HEALTH_CHECK_SHARED_CONFIG } from "@/config/healthCheckShared";

/**
 * Normalise a product name for matching: lowercase, punctuation collapsed to
 * spaces, generic connector words dropped, whitespace collapsed.
 *
 * The Product Portfolio sheet (hand-edited per client) and a completed Health
 * Check file (typed by the Health Check Tool operator from its own template)
 * are maintained independently, and punctuation/wording drifts between them
 * even when both sides mean the same product:
 *
 *   "Db2 for Linux, UNIX and Windows"  →  "db2 linux unix windows"
 *   "Db2 Linux Unix and Windows"       →  "db2 linux unix windows"
 *   "Db2 Linux, Unix and Windows"      →  "db2 linux unix windows"
 *
 * All three collapse to the same form, so no per-variant alias entry is
 * needed for punctuation/wording differences — only for genuine renames (see
 * PRODUCT_NAME_ALIAS_GROUPS below).
 *
 * Verified against all 24 distinct names actually in use across every
 * client's Product Portfolio: no two unrelated products collapse to the same
 * normalised form, so this stays liberal without over-merging.
 */
function normaliseProductName(name: string | undefined | null): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[,.;:()&/]+/g, " ") // punctuation → space
    .replace(/\b(for|and|the|of)\b/g, " ") // generic connector words carry no product identity
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Groups of product names that are genuinely different words for the same
 * product — not fixable by punctuation/wording normalisation above, because
 * the words themselves differ. Al Rajhi's portfolio says "Db2 Linux Unix and
 * Windows"; the Health Check Tool template instructs operators to write
 * "IBM Db2" (the form every other client's portfolio already uses). Add a
 * group here for any other true rename discovered later.
 */
const PRODUCT_NAME_ALIAS_GROUPS: string[][] = [["ibm db2", "db2 linux unix windows"]];

/** True when two product names refer to the same product, aliases included. */
function productNamesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const na = normaliseProductName(a);
  const nb = normaliseProductName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return PRODUCT_NAME_ALIAS_GROUPS.some((group) => group.includes(na) && group.includes(nb));
}

export interface ProductHealthSection {
  mainKpi: string;
  subKpis: {
    name: string;
    status: "Excellent" | "Good" | "Warning" | "Critical";
    score: number;
    lastUpdated: string;
  }[];
}

export interface ProductRecommendation {
  section: string;
  status: "Critical" | "Warning" | "Info" | "Healthy";
  heading: string;
  observed: string;
  detail: string;
  action: string;
  ref: string;
}

export interface HealthCheckTrendPoint {
  timestamp: string;
  label: string; // short label e.g. "Jul 7, 10:06"
  dbName: string | null;
  avgScores: Record<string, number>; // mainKpi → avg score (0–10)
  overallAvg: number;
}

export interface HealthCheckHistoryEntry {
  fileName: string;
  timestamp: string;
  dbName: string | null;
  product: string | null;
}

export interface DatabaseEntry {
  dbName: string;
  checkCount: number; // how many completed files exist for this DB
  latestTimestamp: string;
}

/**
 * List the last N completed health check files for a client with metadata
 */
export function listCompletedHealthChecks(clientId: string, limit = 4): HealthCheckHistoryEntry[] {
  try {
    if (!fs.existsSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)) return [];

    const files = fs
      .readdirSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)
      .filter(
        (f) =>
          f.startsWith(`health-check-completed-${clientId}-`) &&
          f.endsWith(".xlsx") &&
          !f.startsWith("~$"),
      )
      .sort()
      .reverse()
      .slice(0, limit);

    return files.map((fileName) => {
      let timestamp = "";
      const match = fileName.match(/(\d{8}_\d{6})\.xlsx$/);
      if (match) {
        const ts = match[1];
        const year = ts.slice(0, 4),
          month = ts.slice(4, 6),
          day = ts.slice(6, 8);
        const hour = ts.slice(9, 11),
          minute = ts.slice(11, 13),
          second = ts.slice(13, 15);
        timestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).toISOString();
      }

      let dbName: string | null = null;
      let product: string | null = null;
      try {
        const filePath = path.join(HEALTH_CHECK_SHARED_CONFIG.completedDir, fileName);
        const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
        const sheetName = workbook.SheetNames.find((n) => n !== "Recommendations");
        if (sheetName) {
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheetName]);
          if (rows[0]) {
            const dbVal = rows[0]["DB Name"];
            dbName = dbVal && dbVal.toString().trim() ? dbVal.toString().trim() : null;
            const prodVal = rows[0]["Product"];
            product = prodVal ? prodVal.toString().trim() : null;
          }
        }
      } catch {
        /* skip metadata */
      }

      return { fileName, timestamp, dbName, product };
    });
  } catch (error) {
    console.error("[health-check-reader] Error listing completed checks:", error);
    return [];
  }
}

/**
 * Return all unique DB names that have completed health checks for a client/product.
 * Sorted by latest check descending.
 */
export function getAvailableDatabases(clientId: string, productName: string): DatabaseEntry[] {
  try {
    if (!fs.existsSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)) return [];

    const allFiles = fs
      .readdirSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)
      .filter(
        (f) =>
          f.startsWith(`health-check-completed-${clientId}-`) &&
          f.endsWith(".xlsx") &&
          !f.startsWith("~$"),
      )
      .sort()
      .reverse();

    // Map dbName → { count, latestTimestamp }
    const dbMap = new Map<string, { count: number; latestTimestamp: string }>();

    for (const fileName of allFiles) {
      let timestamp = "";
      const match = fileName.match(/(\d{8}_\d{6})\.xlsx$/);
      if (match) {
        const ts = match[1];
        const year = ts.slice(0, 4),
          month = ts.slice(4, 6),
          day = ts.slice(6, 8);
        const hour = ts.slice(9, 11),
          minute = ts.slice(11, 13),
          second = ts.slice(13, 15);
        timestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).toISOString();
      }
      try {
        const filePath = path.join(HEALTH_CHECK_SHARED_CONFIG.completedDir, fileName);
        const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
        const sheetName = workbook.SheetNames.find((n) => n !== "Recommendations");
        if (!sheetName) continue;
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheetName]);
        const productRow = rows.find(
          (r) => productNamesMatch(r["Product"], productName) && r["Client ID"] === clientId,
        );
        if (!productRow) continue;
        const dbVal = (productRow["DB Name"] || "").toString().trim();
        if (!dbVal) continue;
        const existing = dbMap.get(dbVal);
        if (!existing) {
          dbMap.set(dbVal, { count: 1, latestTimestamp: timestamp });
        } else {
          dbMap.set(dbVal, {
            count: existing.count + 1,
            latestTimestamp: existing.latestTimestamp || timestamp,
          });
        }
      } catch {
        /* skip */
      }
    }

    return Array.from(dbMap.entries())
      .map(([dbName, { count, latestTimestamp }]) => ({
        dbName,
        checkCount: count,
        latestTimestamp,
      }))
      .sort((a, b) => b.latestTimestamp.localeCompare(a.latestTimestamp));
  } catch (error) {
    console.error("[health-check-reader] Error getting databases:", error);
    return [];
  }
}

/**
 * Build trend data: per-MainKPI average score across last N completed files,
 * optionally filtered by dbName.
 */
export function buildHealthCheckTrend(
  clientId: string,
  productName: string,
  limit = 4,
  dbNameFilter?: string,
): HealthCheckTrendPoint[] {
  try {
    if (!fs.existsSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)) return [];

    // Get all matching files oldest→newest, then filter by DB if requested
    const allFiles = fs
      .readdirSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)
      .filter(
        (f) =>
          f.startsWith(`health-check-completed-${clientId}-`) &&
          f.endsWith(".xlsx") &&
          !f.startsWith("~$"),
      )
      .sort(); // oldest first

    // If dbName filter provided, keep only files whose DB Name matches
    const filteredFiles: string[] = [];
    if (dbNameFilter) {
      for (const fileName of allFiles) {
        try {
          const filePath = path.join(HEALTH_CHECK_SHARED_CONFIG.completedDir, fileName);
          const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
          const sheetName = workbook.SheetNames.find((n) => n !== "Recommendations");
          if (!sheetName) continue;
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheetName]);
          const productRow = rows.find(
            (r) => productNamesMatch(r["Product"], productName) && r["Client ID"] === clientId,
          );
          const dbVal = (productRow?.["DB Name"] || "").toString().trim();
          if (dbVal === dbNameFilter) filteredFiles.push(fileName);
        } catch {
          /* skip */
        }
      }
    } else {
      filteredFiles.push(...allFiles);
    }

    const files = filteredFiles.slice(-limit); // keep last N

    const points: HealthCheckTrendPoint[] = [];

    for (const fileName of files) {
      // Parse timestamp from filename
      let timestamp = "";
      let label = fileName;
      const match = fileName.match(/(\d{8}_\d{6})\.xlsx$/);
      if (match) {
        const ts = match[1];
        const year = ts.slice(0, 4),
          month = ts.slice(4, 6),
          day = ts.slice(6, 8);
        const hour = ts.slice(9, 11),
          minute = ts.slice(11, 13);
        timestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`).toISOString();
        label = new Date(timestamp).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }

      try {
        const filePath = path.join(HEALTH_CHECK_SHARED_CONFIG.completedDir, fileName);
        const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
        const kpiSheetName = workbook.SheetNames.find((n) => n !== "Recommendations");
        if (!kpiSheetName) continue;

        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
          workbook.Sheets[kpiSheetName],
        );
        const productRows = rows.filter(
          (r) => productNamesMatch(r["Product"], productName) && r["Client ID"] === clientId,
        );

        let dbName: string | null = null;
        if (productRows[0]) {
          const dbVal = productRows[0]["DB Name"];
          dbName = dbVal && dbVal.toString().trim() ? dbVal.toString().trim() : null;
        }

        // Group scores by Main KPI, normalise typo
        const grouped: Record<string, number[]> = {};
        for (const row of productRows) {
          let mainKpi = (row["Main KPI"] || row["HC KPI"] || "").toString().trim();
          if (mainKpi === "Product Stabilty") mainKpi = "Product Stability";
          if (!mainKpi) continue;
          const score = Number(row["Score"]);
          if (!isNaN(score)) {
            if (!grouped[mainKpi]) grouped[mainKpi] = [];
            grouped[mainKpi].push(score);
          }
        }

        // Average per Main KPI
        const avgScores: Record<string, number> = {};
        let totalSum = 0,
          totalCount = 0;
        for (const [kpi, scores] of Object.entries(grouped)) {
          const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
          avgScores[kpi] = avg;
          totalSum += scores.reduce((a, b) => a + b, 0);
          totalCount += scores.length;
        }
        const overallAvg = totalCount > 0 ? Math.round((totalSum / totalCount) * 10) / 10 : 0;

        points.push({ timestamp, label, dbName, avgScores, overallAvg });
      } catch (err) {
        console.error(`[health-check-reader] Error reading trend for ${fileName}:`, err);
      }
    }

    return points;
  } catch (error) {
    console.error("[health-check-reader] Error building trend:", error);
    return [];
  }
}

/**
 * Read KPIs and Recommendations from a specific completed file by filename
 */
export function readHealthCheckByFile(
  clientId: string,
  fileName: string,
  productName: string,
): {
  kpis: ProductHealthSection[];
  recommendations: ProductRecommendation[];
  dbName: string | null;
} {
  const empty = { kpis: [], recommendations: [], dbName: null };
  try {
    const filePath = path.join(HEALTH_CHECK_SHARED_CONFIG.completedDir, fileName);
    if (!fs.existsSync(filePath)) return empty;

    const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const kpiSheetName = workbook.SheetNames.find((n) => n !== "Recommendations");
    let kpis: ProductHealthSection[] = [];
    let dbName: string | null = null;

    if (kpiSheetName) {
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[kpiSheetName]);
      const productRows = rows.filter(
        (r) => productNamesMatch(r["Product"], productName) && r["Client ID"] === clientId,
      );

      if (productRows[0]) {
        const dbVal = productRows[0]["DB Name"];
        dbName = dbVal && dbVal.toString().trim() ? dbVal.toString().trim() : null;
      }

      const grouped = new Map<string, ProductHealthSection>();
      productRows.forEach((row) => {
        let mainKpi = (row["Main KPI"] || row["HC KPI"] || "").toString();
        if (mainKpi === "Product Stabilty") mainKpi = "Product Stability";
        const subKpi = (row["Sub KPI"] || "").toString();
        if (!mainKpi || !subKpi) return;
        if (!grouped.has(mainKpi)) grouped.set(mainKpi, { mainKpi, subKpis: [] });
        grouped.get(mainKpi)!.subKpis.push({
          name: subKpi,
          status: row["Status"] as ProductHealthSection["subKpis"][0]["status"],
          score: Number(row["Score"]),
          lastUpdated: (row["Last Updated"] || "").toString(),
        });
      });
      kpis = Array.from(grouped.values());
    }

    // ── Recommendations ───────────────────────────────────────────────────────
    let recommendations: ProductRecommendation[] = [];
    if (workbook.SheetNames.includes("Recommendations")) {
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
        workbook.Sheets["Recommendations"],
      );
      recommendations = rows.map((row) => ({
        section: row["Section"] || "",
        status: (row["Status"] as ProductRecommendation["status"]) || "Info",
        heading: row["Heading"] || "",
        observed: row["Observed"] || "",
        detail: row["Analysis"] || "",
        action: row["Action"] || "",
        ref: row["Reference"] || "",
      }));
    }

    return { kpis, recommendations, dbName };
  } catch (error) {
    console.error("[health-check-reader] Error reading file:", error);
    return empty;
  }
}

/**
 * Read completed health check file for a client and product
 * Reads ALL completed files and merges data to support multiple products
 */
export function readCompletedHealthCheckSync(
  clientId: string,
  productName: string,
): ProductHealthSection[] {
  try {
    // Find ALL completed files for this client
    if (!fs.existsSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)) {
      console.log("[health-check-reader] Completed directory does not exist");
      return [];
    }

    const files = fs
      .readdirSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)
      .filter((f) => {
        // Match pattern: health-check-completed-{clientId}-{timestamp}.xlsx
        // Example: health-check-completed-pacific-energy-005-20260620_122800.xlsx
        return (
          f.startsWith(`health-check-completed-${clientId}-`) &&
          f.endsWith(".xlsx") &&
          !f.startsWith("~$")
        ); // Exclude temp files
      })
      .sort()
      .reverse(); // Most recent first

    if (files.length === 0) {
      console.log(`[health-check-reader] No completed file found for client: ${clientId}`);
      return [];
    }

    console.log("=".repeat(80));
    console.log(`[health-check-reader] 📂 READING ALL COMPLETED FILES`);
    console.log(`[health-check-reader] Client ID: ${clientId}`);
    console.log(`[health-check-reader] Product: ${productName}`);
    console.log(`[health-check-reader] Found ${files.length} completed file(s)`);
    console.log("=".repeat(80));

    // Collect all product data from all files with file metadata
    let allProductData: any[] = [];

    for (const fileName of files) {
      const filePath = path.join(HEALTH_CHECK_SHARED_CONFIG.completedDir, fileName);
      console.log(`[health-check-reader] Reading: ${fileName}`);

      try {
        // Read the Excel file
        const fileBuffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });

        // Get the first sheet (Health Check Results)
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        // Filter data for the specific product and client
        const productData = data.filter(
          (row: any) =>
            productNamesMatch(row["Product"], productName) && row["Client ID"] === clientId,
        );

        if (productData.length > 0) {
          console.log(
            `[health-check-reader]   ✓ Found ${productData.length} records for ${productName}`,
          );
          // Add file metadata to each row for deduplication
          const dataWithMetadata = productData.map((row: any) => ({
            ...row,
            _fileName: fileName,
            _fileTimestamp:
              fileName.match(/\d{8}_\d{6}/)?.[0] || fileName.match(/\d{8}/)?.[0] || "",
          }));
          allProductData = allProductData.concat(dataWithMetadata);
        }
      } catch (err) {
        console.error(`[health-check-reader]   ✗ Error reading ${fileName}:`, err);
      }
    }

    const productData = allProductData;

    if (productData.length === 0) {
      console.log(`[health-check-reader] No data found for product: ${productName}`);
      return [];
    }

    console.log(
      `[health-check-reader] Found ${productData.length} total records for ${productName}`,
    );

    // Deduplicate: Keep only the most recent entry for each Sub KPI
    // Key format: "MainKPI|SubKPI"
    const deduplicatedData = new Map<string, any>();

    productData.forEach((row: any) => {
      let mainKpi = row["Main KPI"] || row["HC KPI"];
      const subKpi = row["Sub KPI"];
      const lastUpdated = row["Last Updated"];
      const fileTimestamp = row["_fileTimestamp"];

      if (!mainKpi || !subKpi) return;

      // Normalize typo
      if (mainKpi === "Product Stabilty") {
        mainKpi = "Product Stability";
      }

      const key = `${mainKpi}|${subKpi}`;
      const existing = deduplicatedData.get(key);

      if (!existing) {
        // No existing entry, add this one
        deduplicatedData.set(key, { ...row, "Main KPI": mainKpi });
      } else {
        // Compare: First by Last Updated date, then by file timestamp
        const existingDate = existing["Last Updated"] || "";
        const currentDate = lastUpdated || "";
        const existingFileTs = existing["_fileTimestamp"] || "";

        // If dates are different, use the newer date
        if (currentDate > existingDate) {
          deduplicatedData.set(key, { ...row, "Main KPI": mainKpi });
        } else if (currentDate === existingDate) {
          // If dates are same, use file timestamp (newer file wins)
          if (fileTimestamp > existingFileTs) {
            deduplicatedData.set(key, { ...row, "Main KPI": mainKpi });
          }
        }
        // If currentDate < existingDate, keep existing (do nothing)
      }
    });

    console.log(
      `[health-check-reader] After deduplication: ${deduplicatedData.size} unique Sub KPIs`,
    );

    // Group by Main KPI
    const grouped = new Map<string, ProductHealthSection>();

    deduplicatedData.forEach((row: any) => {
      const mainKpi = row["Main KPI"];
      const subKpi = row["Sub KPI"];
      const status = row["Status"];
      const score = row["Score"];
      const lastUpdated = row["Last Updated"];

      if (!grouped.has(mainKpi)) {
        grouped.set(mainKpi, {
          mainKpi,
          subKpis: [],
        });
      }

      grouped.get(mainKpi)!.subKpis.push({
        name: subKpi,
        status: status as "Excellent" | "Good" | "Warning" | "Critical",
        score: Number(score),
        lastUpdated: lastUpdated || new Date().toISOString().split("T")[0],
      });
    });

    const result = Array.from(grouped.values());

    console.log(`[health-check-reader] Grouped into ${result.length} Main KPIs`);

    return result;
  } catch (error) {
    console.error("[health-check-reader] Error reading completed file:", error);
    return [];
  }
}

/**
 * Get the timestamp and DB name from the latest completed health check file for a client.
 */
export function getLatestCompletedFileMeta(clientId: string): {
  timestamp: string | null;
  dbName: string | null;
} {
  try {
    if (!fs.existsSync(HEALTH_CHECK_SHARED_CONFIG.completedDir))
      return { timestamp: null, dbName: null };

    const files = fs
      .readdirSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)
      .filter(
        (f) =>
          f.startsWith(`health-check-completed-${clientId}-`) &&
          f.endsWith(".xlsx") &&
          !f.startsWith("~$"),
      )
      .sort()
      .reverse();

    if (files.length === 0) return { timestamp: null, dbName: null };

    // Extract timestamp from filename: health-check-completed-{clientId}-YYYYMMDD_HHMMSS.xlsx
    let timestamp: string | null = null;
    const match = files[0].match(/(\d{8}_\d{6})\.xlsx$/);
    if (match) {
      const ts = match[1];
      const year = ts.slice(0, 4),
        month = ts.slice(4, 6),
        day = ts.slice(6, 8);
      const hour = ts.slice(9, 11),
        minute = ts.slice(11, 13),
        second = ts.slice(13, 15);
      timestamp = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).toISOString();
    } else {
      const filePath = path.join(HEALTH_CHECK_SHARED_CONFIG.completedDir, files[0]);
      timestamp = fs.statSync(filePath).mtime.toISOString();
    }

    // Read DB Name from the first data row of the first product sheet
    let dbName: string | null = null;
    try {
      const filePath = path.join(HEALTH_CHECK_SHARED_CONFIG.completedDir, files[0]);
      const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
      const sheetName = workbook.SheetNames.find((n) => n !== "Recommendations");
      if (sheetName) {
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheetName]);
        const val = rows[0]?.["DB Name"];
        dbName = val && val.toString().trim() !== "" ? val.toString().trim() : null;
      }
    } catch {
      /* no db name available */
    }

    return { timestamp, dbName };
  } catch (error) {
    console.error("[health-check-reader] Error reading file meta:", error);
    return { timestamp: null, dbName: null };
  }
}

/** @deprecated use getLatestCompletedFileMeta */
export function getLatestCompletedFileTimestamp(clientId: string): string | null {
  return getLatestCompletedFileMeta(clientId).timestamp;
}

/**
 * Read recommendations from the Recommendations sheet in the latest completed file
 */
export function readProductRecommendationsSync(clientId: string): ProductRecommendation[] {
  try {
    if (!fs.existsSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)) return [];

    const files = fs
      .readdirSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)
      .filter(
        (f) =>
          f.startsWith(`health-check-completed-${clientId}-`) &&
          f.endsWith(".xlsx") &&
          !f.startsWith("~$"),
      )
      .sort()
      .reverse();

    if (files.length === 0) return [];

    // Read recommendations from the most recent file that has a Recommendations sheet
    for (const fileName of files) {
      const filePath = path.join(HEALTH_CHECK_SHARED_CONFIG.completedDir, fileName);
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        if (!workbook.SheetNames.includes("Recommendations")) continue;

        const sheet = workbook.Sheets["Recommendations"];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

        const recommendations: ProductRecommendation[] = rows.map((row) => ({
          section: row["Section"] || "",
          status: (row["Status"] as ProductRecommendation["status"]) || "Info",
          heading: row["Heading"] || "",
          observed: row["Observed"] || "",
          detail: row["Analysis"] || "",
          action: row["Action"] || "",
          ref: row["Reference"] || "",
        }));

        console.log(
          `[health-check-reader] Read ${recommendations.length} recommendations from ${fileName}`,
        );
        return recommendations;
      } catch (err) {
        console.error(`[health-check-reader] Error reading recommendations from ${fileName}:`, err);
      }
    }
    return [];
  } catch (error) {
    console.error("[health-check-reader] Error reading recommendations:", error);
    return [];
  }
}

/**
 * Check if completed health check data exists for a client
 */
export function hasCompletedHealthCheckSync(clientId: string): boolean {
  try {
    if (!fs.existsSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)) {
      return false;
    }

    const files = fs.readdirSync(HEALTH_CHECK_SHARED_CONFIG.completedDir).filter((f) => {
      return (
        f.startsWith(`health-check-completed-${clientId}-`) &&
        f.endsWith(".xlsx") &&
        !f.startsWith("~$")
      );
    });

    return files.length > 0;
  } catch (error) {
    console.error("[health-check-reader] Error checking completed file:", error);
    return false;
  }
}

/**
 * Get list of products available in completed health check for a client
 * Reads ALL completed files to get complete product list
 */
export function getAvailableProductsSync(clientId: string): string[] {
  try {
    if (!fs.existsSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)) {
      return [];
    }

    const files = fs
      .readdirSync(HEALTH_CHECK_SHARED_CONFIG.completedDir)
      .filter((f) => {
        return (
          f.startsWith(`health-check-completed-${clientId}-`) &&
          f.endsWith(".xlsx") &&
          !f.startsWith("~$")
        );
      })
      .sort()
      .reverse();

    if (files.length === 0) {
      return [];
    }

    // Collect products from ALL files
    const products = new Set<string>();

    for (const fileName of files) {
      try {
        const filePath = path.join(HEALTH_CHECK_SHARED_CONFIG.completedDir, fileName);
        const fileBuffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        data.forEach((row: any) => {
          if (row["Client ID"] === clientId && row["Product"]) {
            products.add(row["Product"]);
          }
        });
      } catch (err) {
        console.error(`[health-check-reader] Error reading ${fileName}:`, err);
      }
    }

    return Array.from(products);
  } catch (error) {
    console.error("[health-check-reader] Error getting available products:", error);
    return [];
  }
}

// Made with Bob
