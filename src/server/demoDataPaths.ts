import path from "node:path";

/**
 * Where the app keeps its data. Every data file — the workbook, uploads,
 * saved reports, user access — lives in the folder that holds the workbook,
 * so this is the one place the location is decided.
 *
 *   1. CONTROL_PLANE_DATA_XLSX — full path to the workbook (existing servers)
 *   2. DATA_DIR                — the data folder; the workbook is inside it
 *   3. neither set             — public/data/ in the app folder (old default)
 */
export function getExcelFilePath(): string {
  const fromEnv = process.env.CONTROL_PLANE_DATA_XLSX?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const dataDir = process.env.DATA_DIR?.trim();
  if (dataDir) return path.join(path.resolve(dataDir), "control_plane_demo.xlsx");
  return path.resolve(process.cwd(), "public/data/control_plane_demo.xlsx");
}

export function getJsonMirrorPath(): string {
  const excelPath = getExcelFilePath();
  if (excelPath.endsWith(".xlsx")) {
    return excelPath.replace(/\.xlsx$/i, ".json");
  }
  return path.resolve(process.cwd(), "public/data/control_plane_demo.json");
}
