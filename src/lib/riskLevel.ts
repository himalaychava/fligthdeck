import type { ProductRiskIntelligence } from "@/data/clients";

export type EnterpriseRiskLevel = ProductRiskIntelligence["level"];

/**
 * Derive enterprise risk severity from numeric score (0–100).
 * 0–50 Low · 51–70 Medium · 71–90 High · 91–100 Critical
 */
export function riskLevelFromScore(score: number): EnterpriseRiskLevel {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  if (normalized >= 91) return "CRITICAL";
  if (normalized >= 71) return "HIGH";
  if (normalized >= 51) return "MEDIUM";
  return "LOW";
}

export function withRiskLevelFromScore(risk: ProductRiskIntelligence): ProductRiskIntelligence {
  return { ...risk, level: riskLevelFromScore(risk.score) };
}
