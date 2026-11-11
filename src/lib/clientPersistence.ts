import type { Client, ClientKPIConfig } from "@/data/clients";
import { normalizeClientKpiConfig } from "@/lib/kpiTierRules";
import { withSampleHistoryWhenEmpty } from "@/lib/kpiSampleHistory";
import { notifyKpiUpdated } from "@/lib/kpiPersistenceEvents";
import { useExcelKpiApi } from "@/services/kpiExcelApi";

const KPI_STORAGE_KEY = "cp:client-kpi-overrides";

type KpiOverridesStore = Record<string, ClientKPIConfig[]>;

function readStore(): KpiOverridesStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KPI_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as KpiOverridesStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: KpiOverridesStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KPI_STORAGE_KEY, JSON.stringify(store));
}

export function getPersistedKpiConfig(clientId: string): ClientKPIConfig[] | null {
  const config = readStore()[clientId];
  return config ? structuredClone(config) : null;
}

export function saveKpiConfig(clientId: string, kpiConfig: ClientKPIConfig[]) {
  const store = readStore();
  store[clientId] = structuredClone(kpiConfig);
  writeStore(store);
  notifyKpiUpdated(clientId);
}

/** Prefer saved history; fall back to live/mock source when a KPI has no checkpoints yet. */
function mergePersistedWithSource(
  persisted: ClientKPIConfig[],
  source: ClientKPIConfig[]
): ClientKPIConfig[] {
  const sourceMap = new Map(source.map((c) => [c.kpiId, c]));
  return persisted.map((p) => ({
    kpiId: p.kpiId,
    history: p.history.length > 0 ? p.history : (sourceMap.get(p.kpiId)?.history ?? []),
  }));
}

function finalizeKpiConfig(client: Client, base: ClientKPIConfig[]): ClientKPIConfig[] {
  const normalized = normalizeClientKpiConfig({ ...client, kpiConfig: base });
  if (useExcelKpiApi()) return normalized;
  const hasUserEdits = Boolean(getPersistedKpiConfig(client.clientId));
  return hasUserEdits ? normalized : withSampleHistoryWhenEmpty(normalized);
}

export function applyKpiOverrides<T extends Client>(client: T): T {
  if (useExcelKpiApi()) {
    return {
      ...client,
      kpiConfig: finalizeKpiConfig(client, client.kpiConfig ?? []),
    };
  }
  const source = client.kpiConfig ?? [];
  const persisted = getPersistedKpiConfig(client.clientId);
  const base = persisted ? mergePersistedWithSource(persisted, source) : source;
  return {
    ...client,
    kpiConfig: finalizeKpiConfig(client, base),
  };
}

export function applyKpiOverridesToAll(clients: Client[]): Client[] {
  return clients.map(applyKpiOverrides);
}

export function clearAllKpiOverrides() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KPI_STORAGE_KEY);
}
