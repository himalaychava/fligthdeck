import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import type { Client } from "@/data/clients";
import { mergePersistedKpis } from "@/services/clientService";
import { fetchDemoWorkbook, useExcelKpiApi } from "@/services/kpiExcelApi";
import { KPI_UPDATED_EVENT } from "@/lib/kpiPersistenceEvents";
import {
  EXCEL_SHEET_NAMES,
  emptySheets,
  normaliseClientData,
  type DemoSourceType,
  type ExcelRawPayload,
} from "./dataAdapters";

// ─── CONFIGURE YOUR DEMO SOURCE HERE ───────────────────────────────────────
export const DEMO_SOURCE: DemoSourceType = "excel";
export const DEMO_SOURCE_LABEL = useExcelKpiApi()
  ? "Excel backend (server file, read/write)"
  : "Excel File (control_plane_demo.xlsx)";

// For 'excel': reads from /data/control_plane_demo.xlsx using SheetJS (xlsx library)
// For 'json':  reads from /data/control_plane_demo.json (same structure as Excel)
// For 'api':   fetches from a public URL (swap in any REST endpoint)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the client list from the ACCESS-FILTERED endpoint.
 *
 * This replaces loading the raw workbook. The workbook contains every account;
 * /api/demo/clients returns only the accounts the caller is entitled to, so the
 * browser never receives data the user may not see. There is deliberately no
 * static-file fallback: falling back to /data/control_plane_demo.xlsx would
 * hand the client the unfiltered workbook and silently defeat access control.
 *
 * `callerEmail` is only consulted when SSO is disabled; with SSO on, the signed
 * session cookie carries identity and the header is ignored server-side.
 */
async function fetchScopedClients(callerEmail: string): Promise<Client[]> {
  const headers: Record<string, string> = {};
  if (callerEmail) headers["x-cp-email"] = callerEmail;
  const res = await fetch("/api/demo/clients", { headers });
  if (!res.ok) throw new Error(`Failed to load clients (${res.status})`);
  const body = (await res.json()) as { clients?: Client[] };
  return body.clients ?? [];
}

export function useDemoDataFetch(isDemoLive: boolean, callerEmail = "", authReady = true) {
  const [liveAllClients, setLiveAllClients] = useState<Client[]>([]);
  // Starts true (rather than false) when live mode is on: the very first
  // render otherwise has isLoading=false and an empty client list, which
  // reads as "nothing found" for one paint before any effect has run.
  const [isLoading, setIsLoading] = useState(isDemoLive);
  const [error, setError] = useState<string | null>(null);
  // Everything now loads through the access-filtered API; the old static and
  // third-party sources are gone, so there is one source to name.
  const sourceName = DEMO_SOURCE_LABEL;

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const clients = mergePersistedKpis(await fetchScopedClients(callerEmail));
      // An empty list is a legitimate answer now — a user entitled to nothing
      // sees nothing — so it must not be treated as a load failure.
      setLiveAllClients(clients);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load live data");
      setLiveAllClients([]);
    } finally {
      setIsLoading(false);
    }
  }, [callerEmail]);

  useEffect(() => {
    if (!isDemoLive) {
      setLiveAllClients([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    if (!authReady) {
      // The session/auth check hasn't resolved yet, so callerEmail may still
      // be empty. Fetching now would go out with no caller identity, come
      // back with an empty (unentitled) list, and — once isLoading flips
      // back to false — briefly render "Client not found in live data
      // source" before the real, authenticated fetch replaces it a moment
      // later. Waiting here avoids that wasted request and the error flash
      // it caused; refetch fires once authReady flips true below.
      setIsLoading(true);
      return;
    }
    refetch();
  }, [isDemoLive, authReady, refetch]);

  useEffect(() => {
    if (!isDemoLive) return;
    const onKpiUpdated = () => refetch();
    window.addEventListener(KPI_UPDATED_EVENT, onKpiUpdated);
    return () => window.removeEventListener(KPI_UPDATED_EVENT, onKpiUpdated);
  }, [isDemoLive, refetch]);

  return {
    liveAllClients,
    isLoading,
    error,
    sourceName,
    refetch,
  };
}
