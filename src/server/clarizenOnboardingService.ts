/**
 * Clarizen Onboarding Service
 * ───────────────────────────
 * Compares customers in the Clarizen master against the ClientOverview
 * sheet in the Excel workbook. Automatically creates new client rows for
 * any customer that doesn't exist yet.
 *
 * Design notes:
 * - Only adds rows — never modifies existing client data.
 * - client_id is derived from customer name: slug + sequential suffix.
 * - EC/EM products, CMR number, contract dates are populated from Clarizen.
 * - All other account fields (health, summary, risks etc.) are left empty
 *   so TAMs can fill them in later — this is intentional per Phase 1 scope.
 */
import { readWorkbookPayload, writeWorkbookPayload } from "./excelWorkbook";
import { isExcelBackendAvailable } from "./excelWorkbook";
import type { ClarizenCustomer } from "./dataIngestionService";
import { getJsonMirrorPath } from "./demoDataPaths";
import fs from "node:fs";
import type { ExcelRawPayload } from "@/demo-integration/dataAdapters";

export interface OnboardingResult {
  newClients: string[];       // client_ids created
  skipped: string[];          // customer names already present
  errors: string[];           // any row-level issues
  total: number;              // total Clarizen customers processed
}

/** Slugify a customer name → lowercase-hyphen, strip specials */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

/** Read ClientOverview from Excel or JSON mirror — returns empty array if unavailable */
function readClientOverview(): Record<string, unknown>[] {
  if (isExcelBackendAvailable()) {
    try {
      return (readWorkbookPayload().ClientOverview ?? []) as Record<string, unknown>[];
    } catch { /* fall through */ }
  }
  try {
    const jsonPath = getJsonMirrorPath();
    if (fs.existsSync(jsonPath)) {
      const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Partial<ExcelRawPayload>;
      return (raw.ClientOverview ?? []) as Record<string, unknown>[];
    }
  } catch { /* ignore */ }
  return [];
}

/**
 * Run the onboarding comparison and create any missing clients.
 * Safe to call multiple times — idempotent for already-existing clients.
 */
export function runClarizenOnboarding(
  customers: ClarizenCustomer[]
): OnboardingResult {
  const result: OnboardingResult = {
    newClients: [],
    skipped: [],
    errors: [],
    total: customers.length,
  };

  if (!isExcelBackendAvailable()) {
    result.errors.push(
      "Excel workbook not available — cannot write new clients. Check CONTROL_PLANE_DATA_XLSX env var."
    );
    return result;
  }

  let payload: ExcelRawPayload;
  try {
    payload = readWorkbookPayload();
  } catch (e) {
    result.errors.push(`Failed to read workbook: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  const overview = (payload.ClientOverview ?? []) as Record<string, unknown>[];

  // Build lookup sets for fast membership checks
  // PRIMARY KEY: customer number (CMR). Two rows with same name but different customer number
  // → two separate client entries (e.g. Standard Bank 0038 and Standard Bank 0692).
  const existingIds = new Set(overview.map((r) => String(r.client_id ?? "").trim().toLowerCase()));
  const existingCmrs = new Set(
    overview.map((r) => String(r.cmr_number ?? "").trim()).filter(Boolean)
  );

  const usedSlugs = new Set(existingIds);

  for (const customer of customers) {
    const custNumber = String(customer.customerNumber ?? "").trim();

    // Skip if customer number already has a row in the workbook.
    // Each customer number = one page, regardless of how many product rows
    // exist in Clarizen for that number (UTL30 codes are aggregated at insights time).
    if (custNumber && existingCmrs.has(custNumber)) {
      result.skipped.push(`${customer.customerName} (${custNumber})`);
      continue;
    }
    // If no customer number at all, fall back to name-based dedup
    if (!custNumber) {
      const nameNorm = customer.customerName.trim().toLowerCase();
      const alreadyByName = [...overview].some(
        (r) => String(r.client_name ?? "").trim().toLowerCase() === nameNorm && !String(r.cmr_number ?? "").trim()
      );
      if (alreadyByName) {
        result.skipped.push(customer.customerName);
        continue;
      }
    }

    // Generate a stable, unique client_id that includes the customer number
    // so Standard Bank 0038 → "standard-bank-0038" (not just "standard-bank")
    const nameSlug = toSlug(customer.customerName);
    const base = custNumber ? `${nameSlug}-${custNumber.replace(/\s+/g, "")}` : nameSlug;
    let clientId = base;
    let counter = 2;
    while (usedSlugs.has(clientId)) {
      clientId = `${base}-${counter++}`;
    }
    usedSlugs.add(clientId);

    // Build the new ClientOverview row with what Clarizen gives us
    const newRow: Record<string, unknown> = {
      client_id: clientId,
      client_name: customer.customerName.trim(),
      geo: "",
      market: "",
      tier: "Bronze",
      contract_value: null,
      contract_start: customer.contractStart ?? "",
      contract_end: customer.contractEnd ?? "",
      renewal_date: customer.contractEnd ?? "",
      products: customer.ecEmProducts.join(", "),
      account_health: null,
      executive_summary: null,
      contraction_risk: null,
      arr: null,
      acv: null,
      tcv: null,
      current_year_revenue: null,
      nrr_percent: null,
      icn_number: null,
      cmr_number: customer.customerNumber ?? null,
      summary_updated_by: null,
      summary_updated_by_email: null,
      summary_updated_at: null,
    };

    overview.push(newRow);
    if (custNumber) existingCmrs.add(custNumber);
    result.newClients.push(clientId);
  }

  // Persist only if there are new clients to write
  if (result.newClients.length > 0) {
    try {
      payload.ClientOverview = overview;
      writeWorkbookPayload(payload);
    } catch (e) {
      result.errors.push(`Failed to write workbook: ${e instanceof Error ? e.message : String(e)}`);
      // Rollback the newClients list since we couldn't persist
      result.newClients = [];
    }
  }

  return result;
}
