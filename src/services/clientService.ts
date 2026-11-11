import { MOCK_CLIENTS, type Client, type ClientKPIConfig } from "@/data/clients";
import {
  applyKpiOverrides,
  applyKpiOverridesToAll,
  getPersistedKpiConfig,
  saveKpiConfig,
} from "@/lib/clientPersistence";
import { buildKpiConfigFromSelection } from "@/lib/kpiTierRules";
import {
  fetchDemoClient,
  postClientKpiScores,
  postProductAdoptionScore,
  putClientKpiConfig,
  useExcelKpiApi,
} from "@/services/kpiExcelApi";

// SCALABILITY: Toggle to false when backend API is wired up
const USE_MOCK = true;

type ViewMode = "internal" | "external" | "demo";

function filterByViewMode(client: Client, viewMode: ViewMode): Client {
  if (viewMode !== "external") return client;
  const safe: Client = { ...client };
  safe.commercialSnapshot = {
    ...client.commercialSnapshot,
    contractionRisk: "",
    expansionPipeline: "",
  };
  safe.risks = [];
  return safe;
}

function resolveKpiConfig(
  clientId: string,
  fallback: ClientKPIConfig[] = []
): ClientKPIConfig[] {
  const persisted = getPersistedKpiConfig(clientId);
  if (!persisted) return fallback;
  const sourceMap = new Map(fallback.map((c) => [c.kpiId, c]));
  return persisted.map((p) => ({
    kpiId: p.kpiId,
    history: p.history.length > 0 ? p.history : (sourceMap.get(p.kpiId)?.history ?? []),
  }));
}

function syncMockKpiConfig(clientId: string, kpiConfig: ClientKPIConfig[]) {
  const mock = MOCK_CLIENTS.find((c) => c.clientId === clientId);
  if (mock) mock.kpiConfig = structuredClone(kpiConfig);
}

export async function getClientList(): Promise<Client[]> {
  if (USE_MOCK) {
    if (useExcelKpiApi()) {
      try {
        const { fetchDemoClients } = await import("@/services/kpiExcelApi");
        return fetchDemoClients();
      } catch {
        /* static mock fallback */
      }
    }
    return applyKpiOverridesToAll(MOCK_CLIENTS);
  }
  throw new Error("API not wired");
}

export async function getClientById(
  clientId: string,
  viewMode: ViewMode = "internal"
): Promise<Client | undefined> {
  if (USE_MOCK) {
    if (useExcelKpiApi()) {
      try {
        const fromExcel = await fetchDemoClient(clientId);
        if (fromExcel) return filterByViewMode(fromExcel, viewMode);
      } catch {
        /* fall through */
      }
    }
    const c = MOCK_CLIENTS.find((x) => x.clientId === clientId);
    if (!c) return undefined;
    return filterByViewMode(applyKpiOverrides(c), viewMode);
  }
  throw new Error("API not wired");
}

export async function updateClientKPIs(
  clientId: string,
  selectedRotationalIds: string[],
  currentKpiConfig: ClientKPIConfig[] = [],
  tier: Client["tier"] = "Bronze",
  updatedByName = "",
  updatedByEmail = ""
) {
  const base =
    currentKpiConfig.length > 0 ? currentKpiConfig : resolveKpiConfig(clientId, []);
  const nextConfig = buildKpiConfigFromSelection(tier, selectedRotationalIds, base);

  if (useExcelKpiApi()) {
    try {
      const client = await putClientKpiConfig(clientId, {
        tier,
        selectedRotationalIds,
        kpiConfig: base,
        updatedByName,
        updatedByEmail,
      });
      syncMockKpiConfig(clientId, client.kpiConfig);
      return client;
    } catch (e) {
      console.warn("[kpi] Excel save failed, using browser storage fallback", e);
    }
  }

  saveKpiConfig(clientId, nextConfig);
  syncMockKpiConfig(clientId, nextConfig);

  const mock = MOCK_CLIENTS.find((c) => c.clientId === clientId);
  if (mock) return applyKpiOverrides({ ...mock, kpiConfig: nextConfig });
  return { clientId, kpiConfig: nextConfig };
}

export async function addKPIHistory(
  clientId: string,
  scores: { kpiId: string; value: number; notes?: string; date: string }[],
  currentKpiConfig: ClientKPIConfig[] = [],
  updatedByName = "",
  updatedByEmail = ""
) {
  if (useExcelKpiApi()) {
    try {
      const client = await postClientKpiScores(clientId, scores, updatedByName, updatedByEmail);
      syncMockKpiConfig(clientId, client.kpiConfig);
      return client;
    } catch (e) {
      console.warn("[kpi] Excel checkpoint save failed, using browser storage fallback", e);
    }
  }

  const base =
    currentKpiConfig.length > 0 ? currentKpiConfig : resolveKpiConfig(clientId, []);
  const nextConfig = structuredClone(base);

  scores.forEach(({ kpiId, value, notes, date }) => {
    let config = nextConfig.find((c) => c.kpiId === kpiId);
    if (!config) {
      config = { kpiId, history: [] };
      nextConfig.push(config);
    }
    config.history.push({
      date,
      value,
      notes,
      recordedBy: "Session checkpoint",
    });
  });

  saveKpiConfig(clientId, nextConfig);
  syncMockKpiConfig(clientId, nextConfig);

  const mock = MOCK_CLIENTS.find((c) => c.clientId === clientId);
  if (mock) return applyKpiOverrides({ ...mock, kpiConfig: nextConfig });
  return { clientId, kpiConfig: nextConfig };
}

/** Apply browser KPI overrides only when Excel API is disabled. */
export function mergePersistedKpis(clients: Client[]): Client[] {
  if (useExcelKpiApi()) return clients;
  return applyKpiOverridesToAll(clients);
}

export async function getHealthCheckData(_clientId: string) {
  return null;
}

/**
 * Record a per-product Product Adoption score.
 * - Excel API path: calls POST .../products/:productId/adoption/scores
 * - Browser fallback: directly appends to the mock product's adoptionKpiConfig
 */
export async function addProductAdoptionScore(
  clientId: string,
  productId: string,
  score: number,
  notes: string | undefined,
  updatedByName = "",
  updatedByEmail = ""
) {
  const date = new Date().toISOString().split("T")[0];

  if (useExcelKpiApi()) {
    try {
      const client = await postProductAdoptionScore(clientId, productId, score, notes, date, updatedByName, updatedByEmail);
      syncMockKpiConfig(clientId, client.kpiConfig);
      return client;
    } catch (e) {
      console.warn("[kpi] Product adoption score save failed, using browser fallback", e);
    }
  }

  // Browser storage fallback: mutate mock data in-memory
  const mock = MOCK_CLIENTS.find((c) => c.clientId === clientId);
  if (mock) {
    const product = mock.productPortfolio.find(
      (p) => p.productId === productId || p.productName === productId
    );
    if (product) {
      if (!product.adoptionKpiConfig) {
        product.adoptionKpiConfig = { kpiId: "product_adoption", history: [] };
      }
      product.adoptionKpiConfig.history.push({
        date,
        value: score,
        notes,
        recordedBy: "Session checkpoint",
      });
    }
    return applyKpiOverrides(mock);
  }
  return { clientId, kpiConfig: [] as typeof MOCK_CLIENTS[0]["kpiConfig"] };
}
