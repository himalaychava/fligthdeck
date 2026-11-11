import type { Client } from "@/data/clients";

export const GLOBAL_CLIENT_ID = "global";

/** Dropdown sentinel — not included in portfolio aggregates. */
export const GLOBAL_VIEW_SELECTOR: Pick<Client, "clientId" | "clientName" | "geo" | "tier"> = {
  clientId: GLOBAL_CLIENT_ID,
  clientName: "Global View (All Clients)",
  geo: "ALL GEOS",
  tier: "Gold",
};

export function isGlobalClientId(clientId: string | undefined): boolean {
  return clientId === GLOBAL_CLIENT_ID;
}
