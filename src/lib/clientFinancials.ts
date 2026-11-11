import type { Client } from "@/data/clients";
import { parseMoneyValue } from "@/lib/moneyFormat";

export interface ClientFinancialMetrics {
  /** Annual Revenue Retention percentage (0-100%). */
  arr: number;
  /** Annual contract value (USD). */
  acv: number;
  /** Total contract value over full term (USD). */
  tcv: number;
  /** Revenue attributed to the current calendar year (USD). */
  currentYearRevenue: number;
  /** Net revenue retention (%). */
  nrrPercent: number;
}

function estimateNrrPercent(client: Client): number {
  const { renewalConfidence, expansionPotential } = client.scores;
  const raw = 100 + (expansionPotential - renewalConfidence) * 0.25;
  return Math.round(Math.min(130, Math.max(85, raw)) * 10) / 10;
}

/** Per-client financial figures used for global portfolio rollups. */
export function getClientFinancialMetrics(client: Client): ClientFinancialMetrics {
  const parsedTcv = parseMoneyValue(client.contractValue);
  const fin = client.financials;

  // ARR is now a percentage value, not a monetary value
  const arr = fin?.arr ?? 0;
  const acv = fin?.acv ?? 0;
  const tcv = fin?.tcv ?? parsedTcv;
  const currentYearRevenue = fin?.currentYearRevenue ?? 0;
  const nrrPercent =
    fin?.nrrPercent != null && Number.isFinite(fin.nrrPercent)
      ? fin.nrrPercent
      : estimateNrrPercent(client);

  return { arr, acv, tcv, currentYearRevenue, nrrPercent };
}
