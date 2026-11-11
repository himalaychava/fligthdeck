import type { ClientCaseInsights, ProductCaseInsights } from '@/demo-integration/salesforceCaseAdapter';
import { apiFetch } from "@/lib/apiFetch";

/**
 * Fetch Salesforce case insights for a specific client by CMR number
 */
export async function fetchClientCaseInsights(cmrNumber: string): Promise<ClientCaseInsights | null> {
  try {
    const response = await apiFetch(`/api/demo/salesforce/cases/${encodeURIComponent(cmrNumber)}`);
    if (!response.ok) {
      console.warn(`Failed to fetch Salesforce case insights for CMR ${cmrNumber}`);
      return null;
    }
    const data = await response.json();
    return data.hasSalesforceData ? data : null;
  } catch (error) {
    console.error('Error fetching Salesforce case insights:', error);
    return null;
  }
}

/**
 * Normalize product name for matching by removing punctuation and extra whitespace
 */
function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,\-_\/\\]/g, ' ')  // Replace punctuation with spaces
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .trim();
}

/**
 * Get case insights for a specific product within a client
 */
export function getProductInsights(
  clientInsights: ClientCaseInsights | null,
  productName: string
): ProductCaseInsights | null {
  if (!clientInsights) return null;
  
  const normalizedSearchName = normalizeProductName(productName);
  
  // Try exact match first (case-insensitive)
  let productInsights = clientInsights.products.find(p =>
    p.productName.toLowerCase() === productName.toLowerCase()
  );
  
  // If no exact match, try normalized match (ignores punctuation/spacing)
  if (!productInsights) {
    productInsights = clientInsights.products.find(p =>
      normalizeProductName(p.productName) === normalizedSearchName
    );
  }
  
  // If still no match, try partial match
  if (!productInsights) {
    productInsights = clientInsights.products.find(p =>
      p.productName.toLowerCase().includes(productName.toLowerCase()) ||
      productName.toLowerCase().includes(p.productName.toLowerCase())
    );
  }
  
  // If still no match, try normalized partial match
  if (!productInsights) {
    productInsights = clientInsights.products.find(p => {
      const normalizedProductName = normalizeProductName(p.productName);
      return normalizedProductName.includes(normalizedSearchName) ||
             normalizedSearchName.includes(normalizedProductName);
    });
  }
  
  return productInsights || null;
}

// Made with Bob
