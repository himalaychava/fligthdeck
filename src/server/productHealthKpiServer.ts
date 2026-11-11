import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { readCompletedHealthCheckSync, hasCompletedHealthCheckSync, readProductRecommendationsSync, getLatestCompletedFileMeta, listCompletedHealthChecks, readHealthCheckByFile, buildHealthCheckTrend, getAvailableDatabases, type ProductRecommendation, type HealthCheckHistoryEntry, type HealthCheckTrendPoint, type DatabaseEntry } from './healthCheckCompletedReader';
import { getExcelFilePath } from './demoDataPaths';

export { type HealthCheckTrendPoint, type DatabaseEntry };

export function getHealthCheckTrend(clientId: string, productName: string, dbName?: string): HealthCheckTrendPoint[] {
  return buildHealthCheckTrend(clientId, productName, 4, dbName);
}

export function listDatabasesForProduct(clientId: string, productName: string): DatabaseEntry[] {
  return getAvailableDatabases(clientId, productName);
}

export { type HealthCheckHistoryEntry };

export function listHealthCheckHistory(clientId: string, limit = 20): HealthCheckHistoryEntry[] {
  return listCompletedHealthChecks(clientId, limit);
}

export function getHealthCheckByFile(clientId: string, fileName: string, productName: string) {
  return readHealthCheckByFile(clientId, fileName, productName);
}

export { type ProductRecommendation };

export function getProductRecommendationsSync(clientId: string): ProductRecommendation[] {
  return readProductRecommendationsSync(clientId);
}

export function getLastHealthCheckMeta(clientId: string): { timestamp: string | null; dbName: string | null } {
  return getLatestCompletedFileMeta(clientId);
}

export interface ProductHealthKPI {
  clientId: string;
  clientName: string;
  product: string;
  mainKpi: string;
  subKpi: string;
  status: 'Excellent' | 'Good' | 'Warning' | 'Critical';
  score: number;
  lastUpdated: string;
}

export interface ProductHealthSection {
  mainKpi: string;
  subKpis: {
    name: string;
    status: 'Excellent' | 'Good' | 'Warning' | 'Critical';
    score: number;
    lastUpdated: string;
  }[];
}

/**
 * Resolved from the configured data directory rather than a path under
 * public/, so this file moves with every other store when
 * CONTROL_PLANE_DATA_XLSX is repointed. Hardcoding process.cwd()+public/data
 * meant this one reader silently kept looking in the old location.
 */
function healthKpiExcelPath(): string {
  return path.join(path.dirname(getExcelFilePath()), 'Product_Health_KPI_Data.xlsx');
}

/**
 * Read all health KPI data from Excel
 */
function readHealthKpiExcel(): ProductHealthKPI[] {
  try {
    // Read file as buffer first (works in Vite dev server)
    const fileBuffer = fs.readFileSync(healthKpiExcelPath());
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const allData: ProductHealthKPI[] = [];

    // Read all sheets (one per product)
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(worksheet);

      rows.forEach(row => {
        let mainKpi = row['Main KPI'];
        
        // Normalize typo: "Product Stabilty" → "Product Stability"
        if (mainKpi === 'Product Stabilty') {
          mainKpi = 'Product Stability';
        }
        
        allData.push({
          clientId: row['Client ID'],
          clientName: row['Client Name'],
          product: row['Product'],
          mainKpi: mainKpi,
          subKpi: row['Sub KPI'],
          status: row['Status'],
          score: Number(row['Score']) || 0,
          lastUpdated: row['Last Updated']
        });
      });
    });

    return allData;
  } catch (error) {
    console.error('Error reading Product Health KPI Excel:', error);
    return [];
  }
}

/**
 * Server-side function to get health KPI data for a specific client and product
 *
 * Priority:
 * 1. Try to read from completed health check file (shared directory)
 * 2. Fall back to dummy data from Product_Health_KPI_Data.xlsx
 */
export function getProductHealthKpisSync(
  clientId: string,
  productName: string
): ProductHealthSection[] {
  // First, try to read from completed health check file
  if (hasCompletedHealthCheckSync(clientId)) {
    console.log(`[product-health] Using completed health check data for ${clientId}`);
    const completedData = readCompletedHealthCheckSync(clientId, productName);
    
    if (completedData.length > 0) {
      console.log(`[product-health] Found ${completedData.length} sections from completed file`);
      return completedData;
    }
  }
  
  // Fall back to dummy data
  console.log(`[product-health] Using dummy data for ${clientId} - ${productName}`);
  const allData = readHealthKpiExcel();

  // Filter data for this client and product
  const productData = allData.filter(
    item => item.clientId === clientId && item.product === productName
  );

  if (productData.length === 0) {
    return [];
  }

  // Group by Main KPI
  const sections: Map<string, ProductHealthSection> = new Map();

  productData.forEach(item => {
    if (!sections.has(item.mainKpi)) {
      sections.set(item.mainKpi, {
        mainKpi: item.mainKpi,
        subKpis: []
      });
    }

    sections.get(item.mainKpi)!.subKpis.push({
      name: item.subKpi,
      status: item.status,
      score: item.score,
      lastUpdated: item.lastUpdated
    });
  });

  const result = Array.from(sections.values());
  
  // Log summary (minimal for production)
  console.log(`[product-health] Loaded ${result.length} Main KPIs for ${clientId} - ${productName}`);
  
  return result;
}

/**
 * Get list of all products that have health check data
 */
export function getProductsWithHealthData(): string[] {
  const allData = readHealthKpiExcel();
  const products = new Set<string>();
  
  allData
    .filter(item => item.clientId === item.clientId)
    .forEach(item => products.add(item.product));
  
  return Array.from(products);
}

/**
 * Calculate overall product health score (average of all Sub KPIs)
 */
export function getProductOverallScore(
  clientId: string,
  productName: string
): number {
  const allData = readHealthKpiExcel();
  
  const productData = allData.filter(
    item => item.clientId === clientId && item.product === productName
  );
  
  if (productData.length === 0) {
    return 0;
  }
  
  const totalScore = productData.reduce((sum, item) => sum + item.score, 0);
  return Math.round((totalScore / productData.length) * 100) / 100;
}

/**
 * Get distribution of statuses (count of Excellent, Good, Warning, Critical)
 */
export function getProductStatusDistribution(
  clientId: string,
  productName: string
): Record<string, number> {
  const allData = readHealthKpiExcel();
  
  const productData = allData.filter(
    item => item.clientId === clientId && item.product === productName
  );
  
  const distribution: Record<string, number> = {
    'Excellent': 0,
    'Good': 0,
    'Warning': 0,
    'Critical': 0
  };
  
  productData.forEach(item => {
    distribution[item.status] = (distribution[item.status] || 0) + 1;
  });
  
  return distribution;
}

// Made with Bob
