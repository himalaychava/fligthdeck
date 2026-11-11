import type { Client, ClientKPIConfig } from "@/data/clients";
import { buildKpiConfigFromSelection } from "@/lib/kpiTierRules";
import { sampleHistoryForKpi } from "@/lib/kpiSampleHistory";

function series(kpiId: string, values: [number, number, number]) {
  const base = sampleHistoryForKpi(kpiId);
  return base.map((entry, i) => ({
    ...entry,
    value: values[i],
    recordedBy: "Niranjan (TAM)",
  }));
}

/** Demo KPI config: mandatory + selected rotational KPIs with sample history. */
export function buildMockKpiConfig(
  tier: Client["tier"],
  rotationalIds: string[],
  scoreByKpiId: Record<string, [number, number, number]>
): ClientKPIConfig[] {
  const base = buildKpiConfigFromSelection(tier, rotationalIds, []);
  return base.map((entry) => ({
    ...entry,
    history: series(entry.kpiId, scoreByKpiId[entry.kpiId] ?? [72, 74, 76]),
  }));
}
