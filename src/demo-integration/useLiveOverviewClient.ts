import { useEffect, useState } from "react";
import type { Client } from "@/data/clients";
import { applyKpiOverrides } from "@/lib/clientPersistence";
import { KPI_UPDATED_EVENT } from "@/lib/kpiPersistenceEvents";
import { getClientById } from "@/services/clientService";
import { useViewMode } from "@/contexts/ViewModeContext";
import { filterDemoClientForViewMode } from "./dataAdapters";
import { useDemoData } from "./DemoDataContext";

/**
 * Client Overview only: returns mock client when live mode is OFF,
 * otherwise resolves from the live data layer.
 */
export function useLiveOverviewClient(clientId: string, refreshKey = 0) {
  const { viewMode } = useViewMode();
  const { isDemoLive, liveAllClients, isLoading, error, setActiveClientId } = useDemoData();
  const [mockClient, setMockClient] = useState<Client | null>(null);
  const [mockLoading, setMockLoading] = useState(true);
  const [kpiRevision, setKpiRevision] = useState(0);

  useEffect(() => {
    setActiveClientId(clientId);
  }, [clientId, setActiveClientId]);

  useEffect(() => {
    const onKpiUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ clientId?: string }>).detail;
      if (!detail?.clientId || detail.clientId === clientId) {
        setKpiRevision((n) => n + 1);
      }
    };
    window.addEventListener(KPI_UPDATED_EVENT, onKpiUpdated);
    return () => window.removeEventListener(KPI_UPDATED_EVENT, onKpiUpdated);
  }, [clientId]);

  useEffect(() => {
    if (isDemoLive) return;
    let alive = true;
    setMockLoading(true);
    getClientById(clientId, viewMode).then((c) => {
      if (alive) {
        setMockClient(c ?? null);
        setMockLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [clientId, viewMode, isDemoLive, refreshKey, kpiRevision]);

  if (!isDemoLive) {
    return {
      client: mockClient,
      isLoading: mockLoading,
      error: null as string | null,
      isDemoLive: false,
    };
  }

  const liveClient = liveAllClients.find((c) => c.clientId === clientId);
  void kpiRevision;
  const client = liveClient
    ? filterDemoClientForViewMode(applyKpiOverrides(liveClient), viewMode)
    : null;

  return {
    client,
    isLoading,
    error: error ?? (!isLoading && !client ? "Client not found in live data source" : null),
    isDemoLive: true,
  };
}
