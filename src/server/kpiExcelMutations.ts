import type { Client, ClientKPIConfig } from "@/data/clients";
import type { ExcelRawPayload } from "@/demo-integration/dataAdapters";
import { buildKpiConfigFromSelection } from "@/lib/kpiTierRules";
import { readWorkbookPayload, writeWorkbookPayload } from "./excelWorkbook";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function formatCheckpointDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function saveClientKpiConfigToWorkbook(
  clientId: string,
  tier: Client["tier"],
  selectedRotationalIds: string[],
  kpiConfig: ClientKPIConfig[],
  updatedBy = "Delivery TAM",
  updatedByEmail = ""
): ExcelRawPayload {
  const payload = readWorkbookPayload();
  const nextConfig = buildKpiConfigFromSelection(tier, selectedRotationalIds, kpiConfig);
  const now = new Date().toISOString();

  const configRows = (payload.KPIClientConfig ?? []).filter(
    (row) => str(row.client_id) !== clientId
  );

  for (const entry of nextConfig) {
    configRows.push({
      client_id: clientId,
      kpi_id: entry.kpiId,
      is_active: "Y",
      updated_at: now,
      updated_by: updatedBy,
      updated_by_email: updatedByEmail,
    });
  }

  payload.KPIClientConfig = configRows;
  writeWorkbookPayload(payload);
  return payload;
}

export function appendClientKpiScoresToWorkbook(
  clientId: string,
  scores: { kpiId: string; value: number; notes?: string; date: string }[],
  updatedBy = "Delivery TAM",
  updatedByEmail = ""
): ExcelRawPayload {
  const payload = readWorkbookPayload();

  // Determine client tier from ClientOverview sheet
  const clientOverview = (payload.ClientOverview ?? []).find(
    (row) => str(row.client_id) === clientId
  );
  const tier = str(clientOverview?.tier || "Bronze");

  // Determine which tier-specific sheet to use
  const sheetName = tier === "Gold"
    ? "GoldKPIScores"
    : tier === "Silver"
    ? "SilverKPIScores"
    : "BronzeKPIScores";

  const scoreRows = [...(payload[sheetName] ?? [])];

  for (const { kpiId, value, notes, date } of scores) {
    const checkpoint = formatCheckpointDate(date);
    scoreRows.push({
      client_id: clientId,
      kpi_id: kpiId,
      score_value: value,
      checkpoint_date: checkpoint,
      notes: notes ?? "",
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
      updated_by_email: updatedByEmail,
    });
  }

  payload[sheetName] = scoreRows;
  writeWorkbookPayload(payload);
  return payload;
}

/**
 * Appends a per-product Product Adoption score to the ProductAdoptionScores sheet.
 * This feeds into the client-level Product Adoption KPI average shown in Client Overview.
 */
export function appendProductAdoptionScoreToWorkbook(
  clientId: string,
  productId: string,
  score: number,
  notes: string | undefined,
  date: string,
  updatedBy = "Delivery TAM",
  updatedByEmail = ""
): ExcelRawPayload {
  const payload = readWorkbookPayload();
  const checkpoint = formatCheckpointDate(date);

  const adoptionRows = [...((payload.ProductAdoptionScores as Record<string, unknown>[]) ?? [])];
  adoptionRows.push({
    client_id: clientId,
    product_id: productId,
    score_value: score,
    checkpoint_date: checkpoint,
    notes: notes ?? "",
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
    updated_by_email: updatedByEmail,
  });

  (payload as Record<string, unknown>).ProductAdoptionScores = adoptionRows;
  writeWorkbookPayload(payload);
  return payload;
}

/**
 * Saves the executive_summary field on the ClientOverview row and replaces all
 * KeyPoints rows for the given client, then writes the workbook back to disk.
 */
export function saveExecutiveSummaryToWorkbook(
  clientId: string,
  summary: string,
  keyPoints: string[],
  updatedBy = "",
  updatedByEmail = ""
): ExcelRawPayload {
  const payload = readWorkbookPayload();
  const now = new Date().toISOString();

  // Update executive_summary in ClientOverview
  payload.ClientOverview = payload.ClientOverview.map((row) =>
    str(row.client_id) === clientId
      ? { ...row, executive_summary: summary, summary_updated_by: updatedBy, summary_updated_by_email: updatedByEmail, summary_updated_at: now }
      : row
  );

  // Replace all KeyPoints rows for this client
  const otherKeyPoints = payload.KeyPoints.filter(
    (row) => str(row.client_id) !== clientId
  );
  const newKeyPoints = keyPoints
    .map((p) => p.trim())
    .filter(Boolean)
    .map((point) => ({ client_id: clientId, point, updated_by: updatedBy, updated_by_email: updatedByEmail, updated_at: now }));
  payload.KeyPoints = [...otherKeyPoints, ...newKeyPoints];

  writeWorkbookPayload(payload);
  return payload;
}
