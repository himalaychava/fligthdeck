// Client-side interfaces for Product Health KPIs
import { apiFetch } from "@/lib/apiFetch";

export interface ProductRecommendation {
  section: string;
  status: 'Critical' | 'Warning' | 'Info' | 'Healthy';
  heading: string;
  observed: string;
  detail: string;
  action: string;
  ref: string;
}

export async function getProductRecommendations(clientId: string): Promise<ProductRecommendation[]> {
  try {
    const response = await apiFetch(`/api/demo/product-recommendations/${encodeURIComponent(clientId)}`);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
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
 * Client-side function to fetch health KPI data from the server API
 */
export async function getProductHealthKpis(
  clientId: string,
  productName: string
): Promise<ProductHealthSection[]> {
  try {
    const response = await apiFetch(`/api/demo/product-health/${encodeURIComponent(clientId)}/${encodeURIComponent(productName)}`);
    if (!response.ok) {
      console.error('Failed to fetch product health KPIs:', response.statusText);
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching product health KPIs:', error);
    return [];
  }
}

// Made with Bob
