// Prepares an empty data folder for a fresh setup.
//
//   node --env-file=.env scripts/init-data-folder.mjs
//
// Run from the project folder, after setting DATA_DIR in .env. Creates the
// folder and an empty workbook (every sheet, no rows), written by the app's own
// workbook code. The app needs the workbook to exist before the first Clarizen
// upload can create customer pages. Never overwrites: if a workbook is already
// there, it stops without changing anything.
import fs from "node:fs";

const PROJECT = process.cwd();
const { createServer } = await import(`${PROJECT}/node_modules/vite/dist/node/index.js`);
const vite = await createServer({
  root: PROJECT,
  configFile: `${PROJECT}/vite.config.ts`,
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  logLevel: "error",
});

try {
  const paths = await vite.ssrLoadModule("/src/server/demoDataPaths.ts");
  const { EXCEL_SHEET_NAMES } = await vite.ssrLoadModule("/src/demo-integration/dataAdapters.ts");
  const wb = await vite.ssrLoadModule("/src/server/excelWorkbook.ts");
  const workbook = paths.getExcelFilePath();
  console.log(`Workbook: ${workbook}`);
  if (fs.existsSync(workbook)) {
    console.log("A workbook already exists here. Nothing changed.");
  } else {
    wb.writeWorkbookPayload(Object.fromEntries(EXCEL_SHEET_NAMES.map((name) => [name, []])));
    console.log(`Created an empty workbook with ${EXCEL_SHEET_NAMES.length} sheets.`);
    console.log("Next: start the app, then upload Clarizen, CSP, OCC and lifecycle in Admin.");
  }
} finally {
  await vite.close();
  process.exit(0);
}
