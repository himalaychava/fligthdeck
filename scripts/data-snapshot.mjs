// Takes a dated snapshot of the data folder, so the team can work on the same data.
//
//   node --env-file=.env scripts/data-snapshot.mjs [output-folder]
//
// Run from the project folder, from the master data copy only, while no upload
// or Run Reports is in progress. Writes two files into output-folder (default:
// the folder that contains the data folder):
//
//   flightdeck-data-<date>-<time>.tar.gz          the data
//   flightdeck-data-<date>-<time>.manifest.json   every file with its MD5, plus
//                                                 the last Clarizen and CSP upload
//
// Share both files together. Leaves out what the app rebuilds by itself
// (.cache/, uploads_tmp/), Excel lock files and Finder files.
// The snapshot holds customer data: share it only through an approved channel.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

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

if (!fs.existsSync(path.join(dataDir, "control_plane_demo.xlsx"))) {
  console.error(`No workbook in ${dataDir}. Is DATA_DIR set in .env?`);
  process.exit(1);
}
const outDir = path.resolve(process.argv[2] ?? path.dirname(dataDir));
fs.mkdirSync(outDir, { recursive: true });

const skip = (rel) => {
  const base = path.basename(rel);
  return (
    rel.startsWith(".cache/") ||
    rel.startsWith("uploads_tmp/") ||
    base.startsWith("~$") ||
    base === ".DS_Store"
  );
};
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(dataDir, full).split(path.sep).join("/");
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && !skip(rel)) files.push(rel);
  }
})(dataDir);
files.sort();

const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
const manifest = {
  createdAt: new Date().toISOString(),
  fileCount: files.length,
  totalBytes: 0,
  lastUploads: {},
  files: {},
};
for (const rel of files) {
  const full = path.join(dataDir, rel);
  const bytes = fs.statSync(full).size;
  manifest.totalBytes += bytes;
  manifest.files[rel] = { md5: md5(full), bytes };
}
// Last upload of each kind: Upload History, plus the older CSP upload log.
const readList = (rel) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, rel), "utf-8"));
  } catch {
    return [];
  }
};
const uploads = [
  ...readList("upload_history/index.json"),
  ...readList("csp_upload_history.json").map((u) => ({ ...u, kind: "csp" })),
];
for (const kind of ["clarizen", "csp"]) {
  const last = uploads
    .filter((u) => u.kind === kind && u.uploadedAt)
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0];
  if (last) manifest.lastUploads[kind] = { fileName: last.fileName, uploadedAt: last.uploadedAt };
}

const stamp = manifest.createdAt.slice(0, 16).replace("T", "-").replace(":", "");
const base = path.join(outDir, `flightdeck-data-${stamp}`);
const listFile = `${base}.files.txt`;
fs.writeFileSync(listFile, files.join("\n") + "\n");
try {
  execFileSync("tar", ["-czf", `${base}.tar.gz`, "-C", dataDir, "-T", listFile], {
    stdio: "inherit",
  });
} finally {
  fs.rmSync(listFile);
}
fs.writeFileSync(`${base}.manifest.json`, JSON.stringify(manifest, null, 1));

const mb = (n) => (n / 1024 / 1024).toFixed(0);
console.log(`Data folder: ${dataDir}`);
console.log(
  `Snapshot:    ${base}.tar.gz (${mb(fs.statSync(`${base}.tar.gz`).size)} MB, ${files.length} files, ${mb(manifest.totalBytes)} MB unpacked)`,
);
console.log(`Manifest:    ${base}.manifest.json`);
for (const [kind, u] of Object.entries(manifest.lastUploads))
  console.log(`Last ${kind} upload: ${u.fileName} (${u.uploadedAt})`);
process.exit(0);
