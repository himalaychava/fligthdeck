import type { Client, ClientKPIConfig } from "@/data/clients";
import {
  KPI_LIBRARY,
  type KPIDefinition,
  type KPITierLock,
} from "@/data/kpiLibrary";

export function tierLocksForClient(tier: Client["tier"]): KPITierLock[] {
  if (tier === "Free") return [];
  if (tier === "Bronze") return ["Bronze", "All"];
  if (tier === "Silver") return ["Silver", "Bronze", "All"];
  return ["Gold", "Silver", "Bronze", "All"];
}

export function getKpiCatalogForTier(tier: Client["tier"]): KPIDefinition[] {
  const locks = new Set(tierLocksForClient(tier));
  if (!locks.size) return [];
  
  // Exclude global-view-only KPIs from client-level catalog
  const globalViewOnlyKpis = new Set([
    "account_health",
    "renewal_confidence",
    "expansion_potential",
    "value_visibility",
    "nps"
  ]);
  
  return KPI_LIBRARY.filter((k) => locks.has(k.tierLock) && !globalViewOnlyKpis.has(k.kpiId));
}

export function getMandatoryKpis(tier: Client["tier"]): KPIDefinition[] {
  return getKpiCatalogForTier(tier).filter((k) => k.availability === "required");
}

export function getRotationalKpis(tier: Client["tier"]): KPIDefinition[] {
  return getKpiCatalogForTier(tier).filter((k) => k.availability === "rotational");
}

export function getMandatoryKpiIds(tier: Client["tier"]): string[] {
  return getMandatoryKpis(tier).map((k) => k.kpiId);
}

export function getRotationalKpiIds(tier: Client["tier"]): string[] {
  return getRotationalKpis(tier).map((k) => k.kpiId);
}

export function buildKpiConfigFromSelection(
  tier: Client["tier"],
  selectedRotationalIds: string[],
  existing: ClientKPIConfig[] = []
): ClientKPIConfig[] {
  if (tier === "Free") return [];

  const mandatory = getMandatoryKpiIds(tier);
  const allowedRotational = new Set(getRotationalKpiIds(tier));
  const rotational = selectedRotationalIds.filter((id) => allowedRotational.has(id));
  const ids = [...new Set([...mandatory, ...rotational])];

  return ids.map((kpiId) => {
    const prev = existing.find((c) => c.kpiId === kpiId);
    return prev ?? { kpiId, history: [] };
  });
}

/** Ensures mandatory KPIs exist and drops KPIs outside the client's tier catalog. */
export function normalizeClientKpiConfig(client: Pick<Client, "tier" | "kpiConfig">): ClientKPIConfig[] {
  if (client.tier === "Free") return [];

  const allowed = new Set(getKpiCatalogForTier(client.tier).map((k) => k.kpiId));
  const existing = (client.kpiConfig ?? []).filter((c) => allowed.has(c.kpiId));
  const mandatory = new Set(getMandatoryKpiIds(client.tier));
  const rotationalSelected = existing
    .map((c) => c.kpiId)
    .filter((id) => !mandatory.has(id));

  return buildKpiConfigFromSelection(client.tier, rotationalSelected, existing);
}

export function getOverviewKpiDefinitions(
  client: Client,
  viewMode: "internal" | "external" | "demo"
): KPIDefinition[] {
  if (client.tier === "Free") return [];

  const activeIds = new Set(normalizeClientKpiConfig(client).map((c) => c.kpiId));
  const catalogOrder = getKpiCatalogForTier(client.tier);

  return catalogOrder
    .filter((k) => activeIds.has(k.kpiId))
    .filter((k) => viewMode !== "external" || k.externalVisible);
}

/** Get KPIs that are locked for a specific tier (available in higher tiers only) */
export function getLockedKpisForTier(currentTier: Client["tier"], targetTier: "Silver" | "Gold"): KPIDefinition[] {
  if (currentTier === "Free") return [];
  
  // Exclude global-view-only KPIs
  const globalViewOnlyKpis = new Set([
    "account_health",
    "renewal_confidence",
    "expansion_potential",
    "value_visibility",
    "nps"
  ]);
  
  // Get KPIs that are exclusive to the target tier
  return KPI_LIBRARY.filter((k) =>
    k.tierLock === targetTier &&
    !globalViewOnlyKpis.has(k.kpiId)
  );
}

/** Get all higher tier KPIs that are locked for the current tier */
export function getHigherTierKpis(currentTier: Client["tier"]): {
  silver: KPIDefinition[];
  gold: KPIDefinition[];
} {
  if (currentTier === "Gold") {
    return { silver: [], gold: [] };
  }
  
  if (currentTier === "Silver") {
    return {
      silver: [],
      gold: getLockedKpisForTier(currentTier, "Gold")
    };
  }
  
  // Bronze or Free
  return {
    silver: getLockedKpisForTier(currentTier, "Silver"),
    gold: getLockedKpisForTier(currentTier, "Gold")
  };
}
