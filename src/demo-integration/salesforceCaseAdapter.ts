/**
 * Salesforce Case Data Adapter
 * 
 * Reads Salesforce case reports (Excel format) and provides case insights
 * grouped by product, including severity and status breakdowns.
 */

export interface SalesforceCase {
  productName: string;
  accountCMR: string;
  accountName: string;
  caseNumber: string;
  subject: string;
  dateOpened: string;
  severityLevel: string;
  status: string;
  caseOwner: string;
  contactName: string;
}

export interface ProductCaseInsights {
  productName: string;
  totalCases: number;
  severityBreakdown: {
    sev1: number;
    sev2: number;
    sev3: number;
    sev4: number;
  };
  statusBreakdown: {
    open: number;
    closed: number;
  };
}

export interface ClientCaseInsights {
  cmrNumber: string;
  accountName: string;
  products: ProductCaseInsights[];
  hasSalesforceData: boolean;
}

/**
 * Parse severity level from Salesforce format
 * Examples: "1 - Critical", "2 - Significant impact", "4 - Minimal impact"
 */
function parseSeverityLevel(severityText: string): number {
  if (!severityText) return 4; // Default to Sev4
  const match = severityText.match(/^(\d+)/);
  return match ? parseInt(match[1]) : 4;
}

/**
 * Determine if a case is open or closed based on status text
 */
function isClosedStatus(status: string): boolean {
  if (!status) return false;
  const statusLower = status.toLowerCase();
  return statusLower.includes('closed') || 
         statusLower.includes('resolved') || 
         statusLower.includes('archived');
}

/**
 * Process Salesforce case data from Excel sheets
 */
export function processSalesforceCases(sheets: Record<string, any[]>): Map<string, ClientCaseInsights> {
  const clientInsightsMap = new Map<string, ClientCaseInsights>();
  
  // Look for sheets that match Salesforce case report pattern
  const caseReportSheets = Object.keys(sheets).filter(name =>
    name.includes('Case_Report') || name.includes('ARB_Case_Report')
  );
  
  if (caseReportSheets.length === 0) {
    console.log('ℹ️  No Salesforce case report sheets found');
    return clientInsightsMap;
  }
  
  caseReportSheets.forEach(sheetName => {
    console.log(`📊 Processing Salesforce sheet: ${sheetName}`);
    const rows = sheets[sheetName];
    
    if (!rows || rows.length === 0) return;
    
    // Group cases by CMR number
    const casesByCMR = new Map<string, SalesforceCase[]>();
    
    // Track current product name for grouped rows
    let currentProductName = '';
    let currentCMR = '';
    let currentAccountName = '';
    
    rows.forEach((row: any) => {
      // Check if this is a subtotal row - reset current product
      if (row['Product Name  ↑'] === 'Subtotal') {
        currentProductName = '';
        return;
      }
      
      // If product name exists, update current product
      if (row['Product Name  ↑'] && row['Product Name  ↑'].trim()) {
        currentProductName = String(row['Product Name  ↑']).trim();
      }
      
      // Skip if we don't have a current product (shouldn't happen in well-formed data)
      if (!currentProductName) return;
      
      // Get CMR - use current if row doesn't have it
      const cmr = String(row['Account CMR Number'] || '').trim() || currentCMR;
      if (!cmr) return;
      currentCMR = cmr;
      
      // Get account name - use current if row doesn't have it
      const accountName = String(row['Account Name'] || '').trim() || currentAccountName;
      currentAccountName = accountName;
      
      // Only process rows that have severity and status (actual case rows)
      const severityLevel = String(row['Severity Level'] || '').trim();
      const status = String(row['Status'] || '').trim();
      if (!severityLevel || !status) return;
      
      const caseData: SalesforceCase = {
        productName: currentProductName,
        accountCMR: cmr,
        accountName: accountName,
        caseNumber: String(row['Case Number'] || '').trim(),
        subject: String(row['Subject'] || '').trim(),
        dateOpened: String(row['Date/Time Opened'] || '').trim(),
        severityLevel: severityLevel,
        status: status,
        caseOwner: String(row['Case Owner: Full Name'] || '').trim(),
        contactName: String(row['Contact Name: Full Name'] || '').trim(),
      };
      
      if (!casesByCMR.has(cmr)) {
        casesByCMR.set(cmr, []);
      }
      casesByCMR.get(cmr)!.push(caseData);
    });
    
    // Process each CMR's cases
    casesByCMR.forEach((cases, cmr) => {
      if (cases.length === 0) return;
      
      // Group cases by product
      const casesByProduct = new Map<string, SalesforceCase[]>();
      cases.forEach(caseData => {
        const productName = caseData.productName;
        if (!casesByProduct.has(productName)) {
          casesByProduct.set(productName, []);
        }
        casesByProduct.get(productName)!.push(caseData);
      });
      
      // Calculate insights per product
      const productInsights: ProductCaseInsights[] = [];
      casesByProduct.forEach((productCases, productName) => {
        const severityBreakdown = { sev1: 0, sev2: 0, sev3: 0, sev4: 0 };
        const statusBreakdown = { open: 0, closed: 0 };
        
        productCases.forEach(caseData => {
          // Count by severity
          const severity = parseSeverityLevel(caseData.severityLevel);
          switch (severity) {
            case 1: severityBreakdown.sev1++; break;
            case 2: severityBreakdown.sev2++; break;
            case 3: severityBreakdown.sev3++; break;
            case 4: severityBreakdown.sev4++; break;
          }
          
          // Count by status
          if (isClosedStatus(caseData.status)) {
            statusBreakdown.closed++;
          } else {
            statusBreakdown.open++;
          }
        });
        
        productInsights.push({
          productName,
          totalCases: productCases.length,
          severityBreakdown,
          statusBreakdown,
        });
      });
      
      clientInsightsMap.set(cmr, {
        cmrNumber: cmr,
        accountName: cases[0].accountName,
        products: productInsights,
        hasSalesforceData: true,
      });
      
      console.log(`  ✓ Processed ${cases.length} cases for CMR ${cmr} (${productInsights.length} products)`);
    });
  });
  
  return clientInsightsMap;
}

/**
 * Get case insights for a specific client by CMR number
 */
export function getClientCaseInsights(
  cmrNumber: string,
  salesforceData: Map<string, ClientCaseInsights>
): ClientCaseInsights | null {
  return salesforceData.get(cmrNumber) || null;
}

/**
 * Get case insights for a specific product within a client
 */
export function getProductCaseInsights(
  cmrNumber: string,
  productName: string,
  salesforceData: Map<string, ClientCaseInsights>
): ProductCaseInsights | null {
  const clientInsights = salesforceData.get(cmrNumber);
  if (!clientInsights) return null;
  
  // Try exact match first
  let productInsights = clientInsights.products.find(p => 
    p.productName.toLowerCase() === productName.toLowerCase()
  );
  
  // If no exact match, try partial match
  if (!productInsights) {
    productInsights = clientInsights.products.find(p => 
      p.productName.toLowerCase().includes(productName.toLowerCase()) ||
      productName.toLowerCase().includes(p.productName.toLowerCase())
    );
  }
  
  return productInsights || null;
}

// Made with Bob
