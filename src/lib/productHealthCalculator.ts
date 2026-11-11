/**
 * Product Health Score Calculator
 * 
 * Calculates product health percentage dynamically from health check KPI data.
 * This replaces the static healthPercent value from Excel.
 */

import type { ProductHealthSection } from '@/server/healthCheckCompletedReader';

export interface ProductHealthCalculation {
  /** Overall product health percentage (0-100) */
  healthPercent: number;
  /** Status based on health percentage */
  status: 'Excellent' | 'Good' | 'Watch' | 'Critical';
  /** Breakdown by Main KPI */
  mainKpiBreakdown: {
    mainKpi: string;
    percentage: number;
    subKpiCount: number;
    totalScore: number;
    maxScore: number;
  }[];
  /** Whether calculation was successful */
  hasData: boolean;
}

/**
 * Calculate product health percentage from health check KPI data
 * 
 * Logic:
 * 1. For each Main KPI: Calculate percentage = (sum of sub KPI scores / (count × 10)) × 100
 * 2. Overall Health = Average of all Main KPI percentages
 * 3. Exclude Main KPIs with no Sub KPIs (like Product Recommendations)
 * 
 * @param healthKpis Array of Main KPIs with their Sub KPIs
 * @returns Calculated health score and breakdown
 */
export function calculateProductHealth(
  healthKpis: ProductHealthSection[]
): ProductHealthCalculation {
  // Filter out Main KPIs with no Sub KPIs and exclude "Product Recommendations"
  const mainKpisWithData = healthKpis.filter(kpi =>
    kpi.subKpis.length > 0 &&
    kpi.mainKpi !== 'Product Recommendations'
  );
  
  if (mainKpisWithData.length === 0) {
    return {
      healthPercent: 0,
      status: 'Critical',
      mainKpiBreakdown: [],
      hasData: false,
    };
  }
  
  // Calculate percentage for each Main KPI
  const mainKpiBreakdown = mainKpisWithData.map(kpi => {
    const totalScore = kpi.subKpis.reduce((sum, subKpi) => sum + subKpi.score, 0);
    const maxScore = kpi.subKpis.length * 10; // Each sub KPI is scored 0-10
    const percentage = (totalScore / maxScore) * 100;
    
    return {
      mainKpi: kpi.mainKpi,
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimals
      subKpiCount: kpi.subKpis.length,
      totalScore,
      maxScore,
    };
  });
  
  // Calculate overall health as average of Main KPI percentages
  const totalPercentage = mainKpiBreakdown.reduce((sum, kpi) => sum + kpi.percentage, 0);
  const healthPercent = Math.round((totalPercentage / mainKpiBreakdown.length) * 100) / 100;
  
  // Determine status based on percentage
  const status = getHealthStatus(healthPercent);
  
  return {
    healthPercent,
    status,
    mainKpiBreakdown,
    hasData: true,
  };
}

/**
 * Determine health status from percentage
 */
export function getHealthStatus(percentage: number): 'Excellent' | 'Good' | 'Watch' | 'Critical' {
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 70) return 'Good';
  if (percentage >= 50) return 'Watch';
  return 'Critical';
}

/**
 * Calculate client-level Overall Product Health
 * 
 * This is the average of all product health scores for a client.
 * Displayed in the client overview page.
 * 
 * @param productHealthScores Array of health percentages for each product
 * @returns Average health percentage across all products
 */
export function calculateClientOverallProductHealth(
  productHealthScores: number[]
): number {
  if (productHealthScores.length === 0) return 0;
  
  const total = productHealthScores.reduce((sum, score) => sum + score, 0);
  const average = total / productHealthScores.length;
  
  return Math.round(average * 100) / 100;
}

/**
 * Format health percentage for display
 */
export function formatHealthPercent(percentage: number): string {
  return `${Math.round(percentage)}%`;
}

// Made with Bob
