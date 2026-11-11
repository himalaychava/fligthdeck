import type { ClientKPIConfig, KPIScoreEntry } from "@/data/clients";

const CHECKPOINTS = ["01/09/2025", "01/12/2025", "01/03/2026"];

/** Default demo checkpoint values — varied to show excellent / good / watch statuses. */
const SAMPLE_SCORES: Record<string, [number, number, number]> = {
  product_adoption: [72, 76, 82],
  value_realization: [70, 74, 78],
  engagement: [68, 72, 76],
  risk_awareness: [80, 84, 88],
  time_to_value: [62, 68, 74],
  onboarding: [75, 80, 85],
  platform_reliability_confidence: [92, 94, 96],
  use_case_maturity: [70, 75, 80],
  change_readiness: [72, 78, 84],
  sla_compliance: [96, 98, 99],
  feature_adoption: [65, 72, 78],
  csat: [7.8, 8.2, 8.6],
};

function series(values: [number, number, number]): KPIScoreEntry[] {
  return CHECKPOINTS.map((date, i) => ({
    date,
    value: values[i],
    recordedBy: "Demo data",
  }));
}

export function sampleHistoryForKpi(kpiId: string): KPIScoreEntry[] {
  const values = SAMPLE_SCORES[kpiId] ?? [70, 74, 78];
  return series(values);
}

/** Fill empty KPI histories with sample checkpoints (demo / first load only). */
export function withSampleHistoryWhenEmpty(config: ClientKPIConfig[]): ClientKPIConfig[] {
  return config.map((entry) => ({
    ...entry,
    history: entry.history.length > 0 ? entry.history : sampleHistoryForKpi(entry.kpiId),
  }));
}
