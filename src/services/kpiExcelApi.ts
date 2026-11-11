import type { Client, ClientKPIConfig } from "@/data/clients";
import type { ExcelRawPayload } from "@/demo-integration/dataAdapters";
import { notifyKpiUpdated } from "@/lib/kpiPersistenceEvents";
import { apiFetch } from "@/lib/apiFetch";

/** Use server-side Excel read/write when running with Node (local dev, Fyre VM). */
export function useExcelKpiApi(): boolean {
  return import.meta.env.VITE_USE_EXCEL_KPI_API !== "false";
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function fetchDemoWorkbook(): Promise<ExcelRawPayload> {
  const res = await apiFetch(`/api/demo/workbook?_t=${Date.now()}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" }
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ExcelRawPayload>;
}

export async function fetchDemoClients(): Promise<Client[]> {
  const res = await apiFetch(`/api/demo/clients?_t=${Date.now()}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" }
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { clients: Client[] };
  return body.clients;
}

export async function fetchDemoClient(clientId: string): Promise<Client | null> {
  const res = await apiFetch(`/api/demo/clients/${encodeURIComponent(clientId)}?_t=${Date.now()}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Client>;
}

export async function putClientKpiConfig(
  clientId: string,
  body: {
    tier: Client["tier"];
    selectedRotationalIds: string[];
    kpiConfig: ClientKPIConfig[];
    updatedByName: string;
    updatedByEmail: string;
  }
): Promise<Client> {
  const res = await apiFetch(`/api/demo/clients/${encodeURIComponent(clientId)}/kpi/config`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { client: Client };
  notifyKpiUpdated(clientId);
  return data.client;
}

export async function postClientKpiScores(
  clientId: string,
  scores: { kpiId: string; value: number; notes?: string; date: string }[],
  updatedByName: string,
  updatedByEmail: string
): Promise<Client> {
  const res = await apiFetch(`/api/demo/clients/${encodeURIComponent(clientId)}/kpi/scores`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scores, updatedByName, updatedByEmail }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { client: Client };
  notifyKpiUpdated(clientId);
  return data.client;
}

export async function putExecutiveSummary(
  clientId: string,
  summary: string,
  keyPoints: string[],
  updatedByName: string,
  updatedByEmail: string
): Promise<Client> {
  const res = await fetch(
    `/api/demo/clients/${encodeURIComponent(clientId)}/executive-summary`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ summary, keyPoints, updatedByName, updatedByEmail }),
    }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { client: Client };
  notifyKpiUpdated(clientId);
  return data.client;
}

export async function isExcelKpiApiReachable(): Promise<boolean> {
  try {
    const res = await apiFetch("/api/demo/workbook", { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Post a per-product Product Adoption score.
 * Calls POST /api/demo/clients/:clientId/products/:productId/adoption/scores
 */
export async function postProductAdoptionScore(
  clientId: string,
  productId: string,
  score: number,
  notes: string | undefined,
  date: string,
  updatedByName: string,
  updatedByEmail: string
): Promise<Client> {
  const res = await fetch(
    `/api/demo/clients/${encodeURIComponent(clientId)}/products/${encodeURIComponent(productId)}/adoption/scores`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ score, notes, date, updatedByName, updatedByEmail }),
    }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { client: Client };
  notifyKpiUpdated(clientId);
  return data.client;
}
