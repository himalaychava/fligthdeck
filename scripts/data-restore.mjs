// Replaces your data folder with a snapshot from data-snapshot.mjs.
//
//   node --env-file=.env scripts/data-restore.mjs <snapshot.tar.gz>           dry run: shows what would happen
//   node --env-file=.env scripts/data-restore.mjs <snapshot.tar.gz> --apply   restores it
//
// Run from the project folder with the app stopped. The matching
// .manifest.json must sit next to the .tar.gz. Every file is checked against
// the manifest before anything is switched. Your current data folder is never
// deleted: it is renamed to <folder>.before-restore-<time>.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const [archiveArg, flag] = process.argv.slice(2);
if (!archiveArg || !archiveArg.endsWith(".tar.gz")) {
  console.error("usage: node --env-file=.env scripts/data-restore.mjs <snapshot.tar.gz> [--apply]");
  process.exit(1);
}
const archive = path.resolve(archiveArg);
const manifestPath = archive.replace(/\.tar\.gz$/, ".manifest.json");
if (!fs.existsSync(archive) || !fs.existsSync(manifestPath)) {
  console.error(
    `Need both ${path.basename(archive)} and ${path.basename(manifestPath)} in the same folder.`,
  );
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

const PROJECT = process.cwd();
const { createServer } = await import(`${PROJECT}/node_modules/vite/dist/node/index.js`);
const vite = await createServer({
  root: PROJECT,
  configFile: `${PROJECT}/vite.config.ts`,
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  logLevel: "error",
});
const paths = await vite.ssrLoadModule("/src/server/demoDataPaths.ts");
const dataDir = path.dirname(paths.getExcelFilePath());
await vite.close();

const mb = (n) => (n / 1024 / 1024).toFixed(0);
console.log(
  `Snapshot:    ${path.basename(archive)} — taken ${manifest.createdAt}, ${manifest.fileCount} files, ${mb(manifest.totalBytes)} MB`,
);
for (const [kind, u] of Object.entries(manifest.lastUploads ?? {}))
  console.log(`  last ${kind} upload: ${u.fileName} (${u.uploadedAt})`);
console.log(`Data folder: ${dataDir}${fs.existsSync(dataDir) ? "" : " (does not exist yet)"}`);

if (flag !== "--apply") {
  if (fs.existsSync(dataDir))
    console.log(
      `Would keep the current folder as ${path.basename(dataDir)}.before-restore-<time>.`,
    );
  console.log("\nDry run — nothing changed. Stop the app, then add --apply to restore.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const staging = `${dataDir}.restoring-${stamp}`;
fs.mkdirSync(staging, { recursive: true });
execFileSync("tar", ["-xzf", archive, "-C", staging], { stdio: "inherit" });

const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
const bad = [];
for (const [rel, f] of Object.entries(manifest.files)) {
  const p = path.join(staging, rel);
  if (!fs.existsSync(p) || md5(p) !== f.md5) bad.push(rel);
}
if (bad.length) {
  console.error(
    `${bad.length} file(s) do not match the manifest, e.g. ${bad.slice(0, 3).join(", ")}.`,
  );
  console.error(`Nothing switched. The unpacked copy is in ${staging} for inspection.`);
  process.exit(1);
}

let kept = null;
if (fs.existsSync(dataDir)) {
  kept = `${dataDir}.before-restore-${stamp}`;
  fs.renameSync(dataDir, kept);
}
fs.renameSync(staging, dataDir);
console.log(`Restored ${manifest.fileCount} files into ${dataDir}; all match the manifest.`);
if (kept) console.log(`Your previous data folder is kept at ${kept}.`);
process.exit(0);
