import path from "node:path";

/** Writable Excel path — set on Fyre, e.g. /opt/control-plane/data/control_plane_demo.xlsx */
export function getExcelFilePath(): string {
  const fromEnv = process.env.CONTROL_PLANE_DATA_XLSX?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "public/data/control_plane_demo.xlsx");
}

export function getJsonMirrorPath(): string {
  const excelPath = getExcelFilePath();
  if (excelPath.endsWith(".xlsx")) {
    return excelPath.replace(/\.xlsx$/i, ".json");
  }
  return path.resolve(process.cwd(), "public/data/control_plane_demo.json");
}
