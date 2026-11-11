// Removes one customer page and everything stored for it.
//
//   node --env-file=.env scripts/remove-client.mjs <client_id>           dry run: shows what would go
//   node --env-file=.env scripts/remove-client.mjs <client_id> --apply   removes it
//
// Run from the project folder. Removes the customer's rows from every
// workbook sheet (via the app's own read/write, so the .xlsx and its .json
// copy stay in step), its saved report, its rows in the landing-page
// opportunity summary, and its contract edits and product verifications.
// Everything touched is copied to data/backups/remove-<client_id>-<time>/ first.
// User assignments are reported, not changed.
//
// Note: a customer that is still in Clarizen gets its page back on the next
// Clarizen upload. Use this for pages that are not (e.g. demo data).
import fs from "node:fs";
import path from "node:path";

const [clientId, flag] = process.argv.slice(2);
const apply = flag === "--apply";
if (!clientId || clientId.startsWith("-")) {
  console.error("usage: node --env-file=.env scripts/remove-client.mjs <client_id> [--apply]");
  process.exit(1);
}

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
  const wb = await vite.ssrLoadModule("/src/server/excelWorkbook.ts");
  const paths = await vite.ssrLoadModule("/src/server/demoDataPaths.ts");
  const dataDir = path.dirname(paths.getExcelFilePath());
  console.log(`Workbook: ${paths.getExcelFilePath()}`);
  const payload = wb.readWorkbookPayload();

  // ── What would be removed ──────────────────────────────────────────────────
  const overviewRow = (payload.ClientOverview ?? []).find(
    (r) => String(r.client_id ?? "").trim() === clientId,
  );
  if (!overviewRow) {
    console.log(
      `No customer page with client_id "${clientId}" in ${paths.getExcelFilePath()}. Nothing to do.`,
    );
    process.exit(0);
  }
  console.log(
    `Customer: ${overviewRow.client_name} (Customer ID ${overviewRow.cmr_number ?? "none"})`,
  );

  const sheetCounts = {};
  for (const [sheet, rows] of Object.entries(payload)) {
    if (!Array.isArray(rows)) continue;
    const n = rows.filter((r) => String(r?.client_id ?? "").trim() === clientId).length;
    if (n) sheetCounts[sheet] = n;
  }
  const files = [
    path.join(dataDir, "insights_cache", `${clientId}.json`),
    path.join(dataDir, "contract_overrides", `${clientId}.json`),
    path.join(dataDir, "product_verifications", `${clientId}.json`),
  ].filter((p) => fs.existsSync(p));
  const summaryPath = path.join(dataDir, "opportunity_summary.json");
  const summary = fs.existsSync(summaryPath)
    ? JSON.parse(fs.readFileSync(summaryPath, "utf-8"))
    : null;
  const summaryRows = summary ? summary.rows.filter((r) => r.clientId === clientId).length : 0;
  const entPath = path.join(dataDir, "user_entitlements.json");
  const assigned = fs.existsSync(entPath)
    ? (JSON.parse(fs.readFileSync(entPath, "utf-8")).users ?? [])
        .filter((u) => (u.clientIds ?? []).includes(clientId))
        .map((u) => u.email)
    : [];

  console.log("Workbook rows:", sheetCounts);
  console.log(
    "Files:",
    files.map((f) => path.relative(dataDir, f)),
  );
  console.log("Opportunity summary rows:", summaryRows);
  if (assigned.length)
    console.log("Assigned to users (not changed — update in Admin → Users):", assigned);

  if (!apply) {
    console.log("\nDry run — nothing changed. Add --apply to remove.");
    process.exit(0);
  }

  // ── Back up, then remove ───────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(dataDir, "backups", `remove-${clientId}-${stamp}`);
  fs.mkdirSync(backup, { recursive: true });
  const excel = paths.getExcelFilePath();
  for (const p of [excel, paths.getJsonMirrorPath(), summaryPath, ...files]) {
    if (fs.existsSync(p))
      fs.copyFileSync(
        p,
        path.join(backup, path.basename(path.dirname(p)) + "__" + path.basename(p)),
      );
  }
  console.log(`\nBacked up to ${backup}`);

  for (const sheet of Object.keys(sheetCounts)) {
    payload[sheet] = payload[sheet].filter((r) => String(r?.client_id ?? "").trim() !== clientId);
  }
  wb.writeWorkbookPayload(payload);
  for (const f of files) fs.rmSync(f);
  if (summary && summaryRows) {
    summary.rows = summary.rows.filter((r) => r.clientId !== clientId);
    fs.writeFileSync(summaryPath, JSON.stringify(summary), "utf-8");
  }
  console.log(
    `Removed "${clientId}". The app picks this up on the next page load; no restart needed.`,
  );
} finally {
  await vite.close();
  process.exit(0);
}
