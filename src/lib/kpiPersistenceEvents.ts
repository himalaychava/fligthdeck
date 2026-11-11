export const KPI_UPDATED_EVENT = "cp:kpi-updated";

export function notifyKpiUpdated(clientId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(KPI_UPDATED_EVENT, { detail: { clientId } }));
}
