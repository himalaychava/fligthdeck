import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  EXCEL_SHEET_NAMES,
  emptySheets,
  type ExcelRawPayload,
  type ExcelSheetName,
} from "@/demo-integration/dataAdapters";
import { getExcelFilePath, getJsonMirrorPath } from "./demoDataPaths";

export function isExcelBackendAvailable(): boolean {
  try {
    const p = getExcelFilePath();
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function readWorkbookPayload(): ExcelRawPayload {
  const filePath = getExcelFilePath();
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel data file not found: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const payload = emptySheets();
  for (const name of EXCEL_SHEET_NAMES) {
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      payload[name] = [];
      continue;
    }
    payload[name] = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  }
  return payload;
}

export function writeWorkbookPayload(payload: ExcelRawPayload): void {
  const filePath = getExcelFilePath();
  const workbook = XLSX.utils.book_new();
  for (const name of EXCEL_SHEET_NAMES) {
    const rows = payload[name] ?? [];
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);

  const jsonPath = getJsonMirrorPath();
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * Read Salesforce case report Excel files from the data directory
 * Returns a map of all sheets found in Salesforce case report files
 */
export function readSalesforceCaseReports(): Record<string, any[]> {
  const dataDir = path.dirname(getExcelFilePath());
  const sheets: Record<string, any[]> = {};
  
  try {
    const files = fs.readdirSync(dataDir);
    const caseReportFiles = files.filter(f =>
      f.includes('Case_Report') && f.endsWith('.xlsx') && !f.startsWith('~$')
    );
    
    if (caseReportFiles.length === 0) {
      console.log('ℹ️  No Salesforce case report files found');
      return sheets;
    }
    
    caseReportFiles.forEach(filename => {
      const filePath = path.join(dataDir, filename);
      console.log(`📊 Reading Salesforce case report: ${filename}`);
      
      try {
        const buffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(buffer, { type: "buffer" });
        
        // Read all sheets from this workbook
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          if (sheet) {
            const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
            // If sheet name already exists, append data instead of overwriting
            if (sheets[sheetName]) {
              sheets[sheetName] = [...sheets[sheetName], ...data];
              console.log(`  ✓ Appended ${data.length} rows to existing sheet "${sheetName}" (total: ${sheets[sheetName].length})`);
            } else {
              sheets[sheetName] = data;
              console.log(`  ✓ Read sheet "${sheetName}" with ${data.length} rows`);
            }
          }
        });
      } catch (err) {
        console.error(`❌ Error reading ${filename}:`, err);
      }
    });
  } catch (err) {
    console.error('❌ Error reading Salesforce case reports:', err);
  }
  
  return sheets;
}
