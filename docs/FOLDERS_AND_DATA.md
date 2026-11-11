# FlightDeck folders and data

What every folder and file in FlightDeck is for: the **code** (this repo) and the
**data folder** it works on. Sizes and counts are from November 2026.

## How the two fit together

```
flightdeck/                 the code (this git repo)
  .env  ── DATA_DIR ──────► flightdeck-data/     all data: uploads, workbook,
                                                 saved reports, user access
  .env  ── HEALTH_CHECK_SHARED_DIR ──► health-check shared folder
                                       (files exchanged with the Health Check Tool)
```

- The code never contains data, and the data folder never contains code.
- `DATA_DIR` in `.env` is the only link between them. Point it at another folder
  (for example a test copy) and the app uses that data instead.
- Git holds only the code. Data is shared as snapshots (see the README).

---

# Part 1 — The code: `flightdeck/`

## Top level

| Item                                                 | In git | What it is for                                                                                                                        |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                                               | yes    | All application code: pages, components and the server (below)                                                                        |
| `public/`                                            | yes    | Static files served as-is: `ibm-bob-logo.gif`. `public/data/` is the app's old default data location and stays empty (ignored by git) |
| `scripts/`                                           | yes    | Maintenance scripts (below)                                                                                                           |
| `docs/`                                              | yes    | Background documents, including this one                                                                                              |
| `README.md`                                          | yes    | How to run FlightDeck, get the data, settings, scripts, troubleshooting                                                               |
| `CHANGELOG.md`                                       | yes    | Release notes                                                                                                                         |
| `package.json`                                       | yes    | The app's name, its commands (`dev`, `build`, `lint`, …) and the packages it needs                                                    |
| `package-lock.json`                                  | yes    | The exact version of every package, so every machine installs the same set (`npm ci`)                                                 |
| `.npmrc`                                             | yes    | Makes npm install from the official registry, whatever a personal npm setting says                                                    |
| `vite.config.ts`                                     | yes    | Build and dev-server settings: port 8080, optional HTTPS, `@/` path alias, which code must never reach the browser                    |
| `tsconfig.json`                                      | yes    | TypeScript settings                                                                                                                   |
| `eslint.config.js`, `.prettierrc`, `.prettierignore` | yes    | Code checks (`npm run lint`) and formatting rules                                                                                     |
| `.gitignore`                                         | yes    | Keeps secrets, data, Excel/CSV files, logs, snapshots and build output out of git                                                     |
| `.env.example`                                       | yes    | Template listing every setting, with notes. Copy it to `.env`                                                                         |
| `.env`                                               | **no** | This machine's settings and keys. Never committed; each environment has its own                                                       |
| `node_modules/`                                      | **no** | Installed packages, rebuilt with `npm ci`                                                                                             |
| `dist/`                                              | **no** | Production build output (`npm run build`)                                                                                             |

## `scripts/`

Run from the project folder, usually as `node --env-file=.env scripts/<name>.mjs`.

| Script                   | What it does                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `init-data-folder.mjs`   | Creates an empty data folder with an empty workbook, for a fresh setup. Never overwrites                                    |
| `data-snapshot.mjs`      | Makes a dated `.tar.gz` of the data folder plus a manifest (checksums, last Clarizen and CSP upload) to share with the team |
| `data-restore.mjs`       | Replaces your data folder with a snapshot after checking every file; keeps your previous folder                             |
| `remove-client.mjs`      | Removes one customer page and its saved data. Dry run unless `--apply`; backs up first                                      |
| `generate-demo-data.mjs` | Regenerates the demo customers (`npm run generate-demo-data`)                                                               |

## `src/` — entry points

| File                     | What it is for                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `server.ts`              | The server entry: sends sign-in requests to the IBMid handler, `/api/...` requests to the API, and everything else to the pages |
| `start.ts`, `router.tsx` | Start-up wiring for TanStack Start and the page router                                                                          |
| `routeTree.gen.ts`       | Generated list of pages. Rebuilt automatically; do not edit by hand                                                             |
| `styles.css`             | Global styles (loads Carbon's CSS)                                                                                              |

## `src/routes/` — the pages

| File                                                                           | Page                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `__root.tsx`                                                                   | The HTML shell around every page (title, styles)                                      |
| `index.tsx`                                                                    | `/`: sends you to the home page or to sign-in                                         |
| `login.tsx`                                                                    | Sign-in page (IBMid, or the simple email login on a local machine)                    |
| `customer-login.tsx`                                                           | Old mock "customer portal" sign-in. Not linked anywhere                               |
| `_authenticated.tsx`                                                           | Guard for all pages below: you must be signed in                                      |
| `_authenticated/home.tsx`                                                      | **Home**: opportunity overview and the customer list                                  |
| `_authenticated/admin.tsx`                                                     | **Admin**: tabs Users & Access, Data Uploads, Run Reports, Upload History             |
| `_authenticated/client.$clientId.index.tsx`                                    | **Client Overview**: header, contract summary, KPI widgets, Executive Account Summary |
| `_authenticated/client.$clientId.account-overview.tsx`                         | **Account Overview**: product portfolio health, account team, health-check requests   |
| `_authenticated/client.$clientId.contract.tsx`                                 | **Contract**: contracts from Clarizen, with editable owner / project manager          |
| `_authenticated/client.$clientId.insights.tsx`                                 | **Insights**: CSP case analysis, Sev1, upgrades, opportunities, offerings             |
| `_authenticated/client.$clientId.global.tsx`                                   | **Global View**: portfolio view across customers                                      |
| `_authenticated/client.$clientId.external.tsx`                                 | **External** view: overview, commercial snapshot, product portfolio                   |
| `_authenticated/client.$clientId.csat.tsx`, `…initiatives.tsx`, `…renewal.tsx` | Placeholder pages ("Under development")                                               |

## `src/components/` — page sections, by area

| Folder      | Sections                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin/`    | Uploads (Clarizen, CSP, OCC, lifecycle) and the column-mapping window, rejected Clarizen rows, product lifecycle mapping, Run Reports, Upload History, geo/market picker                                        |
| `contract/` | The contract list and its edits                                                                                                                                                                                 |
| `global/`   | Global View dashboard, metrics grid, KPI detail window                                                                                                                                                          |
| `home/`     | Opportunity overview, customer picker                                                                                                                                                                           |
| `insights/` | Insights summary bar, insight cards, opportunities, offerings (Solution Builder), upgrades, date range                                                                                                          |
| `layout/`   | Header (menus, support links), side navigation, customer selector, page header with Download Report                                                                                                             |
| `overview/` | Client Overview and Account Overview sections: account header, KPI widgets and scoring, executive summary, commercial snapshot, account team, product portfolio health and verification, Salesforce case panels |
| `report/`   | Download Report (page PDF)                                                                                                                                                                                      |
| `shared/`   | Small shared pieces: score gauge, tier tag                                                                                                                                                                      |

## `src/server/` — the server (never sent to the browser)

| Area                          | Files                                                                                                                                                              | What they do                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **API**                       | `demoApi.ts`                                                                                                                                                       | Every `/api/...` route: checks who is calling and what they may see, then calls the modules below                                          |
| **Sign-in and access**        | `oidcHandler.ts`, `accessControl.ts`, `userEntitlements.ts`                                                                                                        | IBMid sign-in, the single access rule (role, customers, geo, market), the user list                                                        |
| **Data location**             | `demoDataPaths.ts`                                                                                                                                                 | Decides the data folder (`CONTROL_PLANE_DATA_XLSX`, else `DATA_DIR`)                                                                       |
| **Workbook**                  | `excelWorkbook.ts`, `kpiExcelMutations.ts`, `excelHeaderDetect.ts`, `xlsxStreamReader.ts`                                                                          | Read and write the workbook; KPI score changes; find the header row in uploaded Excel files; read very large Excel files                   |
| **Clarizen**                  | `dataIngestionService.ts`, `clarizenOnboardingService.ts`, `clarizenRejects.ts`, `endCustomerRules.ts`                                                             | Store Clarizen and OCC uploads; create pages for new customers; keep rejected rows; file reseller-held contracts under their end customers |
| **CSP**                       | `caseDataReader.ts`, `cspProductCatalog.ts`, `uploadJobQueue.ts`                                                                                                   | Read cases for a customer; the list of CSP products; process CSP uploads in the background                                                 |
| **Lifecycle**                 | `productLifecycleService.ts`, `lifecyclePendingProducts.ts`                                                                                                        | Match products and versions to end-of-support dates; list products still waiting for a mapping                                             |
| **Reports**                   | `reportBatchService.ts`, `reportScheduler.ts`, `reportStore.ts`, `reportFingerprint.ts`, `insightsGenerator.ts`, `insightsCacheService.ts`, `aiInsightsService.ts` | Run Reports (all or changed customers), its schedule, saving reports, spotting what changed, building insights, the Bob AI calls           |
| **Executive Account Summary** | `executiveSummaryFacts.ts`, `executiveSummaryNarrative.ts`, `executiveSummaryTiles.ts`, `executiveSummaryAi.ts`, `executiveSummaryService.ts`                      | The facts, bullets, tiles and optional AI captions on Client Overview                                                                      |
| **Opportunities**             | `opportunityRules.ts`, `opportunitySummary.ts`                                                                                                                     | The three opportunity rules and the combined list on the home page                                                                         |
| **Geo / market**              | `geoMarketService.ts`                                                                                                                                              | Each customer's geo and market, worked out from Clarizen                                                                                   |
| **Health checks**             | `healthCheckTemplateGenerator.ts`, `healthCheckCompletedReader.ts`, `productHealthKpiServer.ts`                                                                    | Write health-check request files, read completed results, product health KPIs                                                              |
| **Other**                     | `solutionBuilderApi.ts`, `uploadHistory.ts`, `productVerificationService.ts`, `contractOverridesService.ts`, `dataFingerprint.ts`                                  | Offerings from Solution Builder; Upload History; product verification; contract edits; quick caches                                        |

## Other `src/` folders

| Folder              | What it is for                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `demo-integration/` | The live data layer for the pages (the name is historical): loads the customer list and workbook data into the browser, turns workbook rows into page data |
| `services/`         | Browser-side helpers that call the API (customers, KPIs, product health, Salesforce cases, Global View totals)                                             |
| `lib/`              | Small shared helpers: API calls with the signed-in identity, PDF export, money formats, KPI rules, product counts                                          |
| `constants/`        | Fixed settings in code: opportunity thresholds, end-customer rules for resellers, geo and market lists, service categories, links                          |
| `contexts/`         | Sign-in state and view mode for the whole app                                                                                                              |
| `config/`           | Health Check Tool shared-folder settings                                                                                                                   |
| `data/`             | Built-in KPI library and a small mock customer list used by a few screens                                                                                  |

---

# Part 2 — The data: `flightdeck-data/`

Everything here is **customer data**: never commit it, share it only as a
snapshot through an approved channel. The folder holds real customers and a
small set of demo customers side by side.

## 1. Uploads (Admin → Data Uploads)

| File                                      | What's in it                                                                                                                                            | Filled by                        | Used on                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clarizen_master.json` (5 MB)             | Active contracts (about 2,300): work order, customer number and name, ACV/TCV, dates, owner, TAM, product code (UTL30), geo/market, end-customer fields | **Clarizen upload**              | **Contract** page; **Client Overview** header (contract summary, "Contracts held through…"); EC products on Client Overview, Insights and opportunities (through UTL30); each customer's geo/market (home filters, who can see what); creating **new customer pages** |
| `clarizen_rejects.json`                   | Rows discarded at the last Clarizen upload, with the reason                                                                                             | Clarizen upload                  | **Admin → Data Uploads** (rejected rows)                                                                                                                                                                                                                              |
| `csp/` (one file per month, about 840 MB) | All support cases: case number, customer number, product, version, severity, status, open/close dates                                                   | **CSP upload**                   | **Insights** (charts, Sev1 table, Account Case Summary, filters); **Run Reports**; product lists; lifecycle matching                                                                                                                                                  |
| `csp_upload_history.json`                 | Log of older CSP uploads                                                                                                                                | CSP upload                       | **Admin → Data Uploads**; older entries in **Upload History**                                                                                                                                                                                                         |
| `csp_filtered_insights.xlsx` (10 MB)      | Excel export of the filtered CSP cases (Software + SaaS)                                                                                                | CSP upload                       | **Admin** → "Export CSP insights"                                                                                                                                                                                                                                     |
| `occ_data.json`                           | Product catalogue: UTL30 code → product name                                                                                                            | **OCC upload**                   | Product names on **Contract**, **Client Overview** (verification), **Insights** (EC vs Non-EC), opportunities                                                                                                                                                         |
| `lifecycle_data.json` (11 MB)             | Product lifecycle: product, version, end of support, extended support                                                                                   | **Lifecycle upload**             | **Insights → Upgrades**; **Upgrade** opportunities on the home page; the "EC & Migration" tile on Client Overview                                                                                                                                                     |
| `lifecycle_mappings.json`                 | Mappings from CSP product names to lifecycle products                                                                                                   | Admin, product lifecycle mapping | Lifecycle matching                                                                                                                                                                                                                                                    |
| `column_mappings.json`                    | The column mapping saved for each upload type                                                                                                           | Each upload                      | Pre-fills the mapping window next time                                                                                                                                                                                                                                |
| `upload_history/`                         | `index.json` plus one detail file per upload (what changed, discarded rows, new pages)                                                                  | Clarizen and CSP uploads         | **Admin → Upload History** (View, Download)                                                                                                                                                                                                                           |
| `uploads_tmp/`                            | Temporary copy of a file while a CSP upload runs; empty otherwise                                                                                       | CSP upload                       | Working space only                                                                                                                                                                                                                                                    |

## 2. The workbook: `control_plane_demo.xlsx`

The app reads and writes the `.xlsx`; `control_plane_demo.json` is the same data,
rewritten on every save.

| Sheet                                                                                                                                                   | What's in it                                                                          | Real or demo                                    | Used on                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| **ClientOverview**                                                                                                                                      | One row per customer page: id, name, customer number, geo, market, tier, summary text | **Real** (created by Clarizen uploads) and demo | **Home** customer list; every page header; Admin customer pickers; **Global View** |
| CommercialSnapshot                                                                                                                                      | ARR, NRR, revenue figures                                                             | Demo                                            | **External** (Commercial Snapshot)                                                 |
| ProductPortfolio                                                                                                                                        | Products per customer                                                                 | Demo                                            | **Account Overview**, **External** (Product Portfolio Health); KPI widgets         |
| ProductIntegrationMetrics, ProductHealthCheck, ProductCaseVolume, ProductRiskIntelligence, ProductStability, ProductPerformance, ProductRecommendations | Per-product health detail                                                             | Demo                                            | **Account Overview** (product detail panels)                                       |
| AccountTeam                                                                                                                                             | Account team members                                                                  | Demo                                            | **Account Overview** (Dedicated Account Team)                                      |
| KPIClientConfig, KPIScores, BronzeKPIScores, SilverKPIScores, GoldKPIScores                                                                             | Which KPIs a customer tracks, and the scores                                          | Demo (a few real rows)                          | **Client Overview**, **External** (KPI widgets, score entry, trend)                |
| ProductAdoptionScores                                                                                                                                   | Product adoption scores                                                               | Demo                                            | KPI widgets; product verification badges                                           |
| KeyPoints, Risks                                                                                                                                        | Key points and risks                                                                  | Demo                                            | Not shown on any page now (the full client report that used them was removed)      |
| KPILibrary                                                                                                                                              | Empty; the KPI list lives in code (`src/data/kpiLibrary.ts`)                          | —                                               | —                                                                                  |
| GeoMarkets                                                                                                                                              | Geo/market reference rows                                                             | Reference                                       | Not read; the geo/market list comes from Clarizen data and code                    |

## 3. Generated by Run Reports

| File                                                   | What's in it                                                                                                 | Filled by                                             | Used on                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `insights_cache/` (one file per customer, about 40 MB) | The saved report: case analysis, Sev1, EC/Non-EC products, upgrades, opportunity rules, AI text when Bob ran | **Run Reports**, or **Regenerate Insights** on a page | **Insights** page; **Executive Account Summary** on Client Overview      |
| `opportunity_summary.json`                             | Every customer's opportunities (Expertise Connect, Essential Management, Upgrade)                            | Run Reports                                           | **Home** (Opportunity Overview, "Most opportunities" sort, Excel export) |
| `report_runs.json`                                     | The last Run Reports run: when, who, counts, failures                                                        | Run Reports                                           | **Admin → Run Reports**                                                  |
| `report_schedule.json`                                 | The Run Reports schedule (only after one is saved)                                                           | Admin → Run Reports                                   | The schedule                                                             |

## 4. Saved by users

| File                     | What's in it                                                                         | Saved from                 | Used on                                       |
| ------------------------ | ------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------- |
| `user_entitlements.json` | Users: role, customers, geos, markets, edit access                                   | **Admin → Users & Access** | Everywhere: what each person can see and edit |
| `contract_overrides/`    | Edited contract owner, project manager, delivery consultants (one file per customer) | **Contract** page          | **Contract** page                             |
| `product_verifications/` | Products confirmed, added or removed by hand (one file per customer)                 | **Client Overview**        | Client Overview; EC product counts            |

## 5. Automatic caches: `.cache/`

Rebuilt by the app whenever needed; safe to lose.

| File                                                 | What's in it                                       | Used for                              |
| ---------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| `client_geo_market.json`                             | Geo and market per customer, from Clarizen         | Home filters; access by geo/market    |
| `csp_product_names.json`                             | All product names in the CSP data                  | Product dropdowns                     |
| `csp_case_count.json`                                | Case counts                                        | Quick totals                          |
| `lifecycle_pending.json`, `lifecycle_row_count.json` | CSP products still waiting for a lifecycle mapping | **Admin** → product lifecycle mapping |

## 6. Demo-only files

| File                             | What's in it                   | Used on                                   |
| -------------------------------- | ------------------------------ | ----------------------------------------- |
| `*_Case_Report-*.xlsx` (3 files) | Sample Salesforce case reports | **Account Overview** (case panels)        |
| `Product_Health_KPI_Data.xlsx`   | Product health KPIs            | Product health views, demo customers only |
| `Product Health Review KPI.xlsx` | Health-review KPI sample       | Not used by the app                       |

## Where real customer pages get their data

| Page             | Main data                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Home             | `opportunity_summary.json`, workbook ClientOverview, `.cache/client_geo_market.json`                                                  |
| Client Overview  | `clarizen_master.json`, `occ_data.json`, `product_verifications/`, `insights_cache/`                                                  |
| Contract         | `clarizen_master.json`, `contract_overrides/`, `occ_data.json`                                                                        |
| Insights         | `insights_cache/` (built from `csp/`, `clarizen_master.json`, `occ_data.json`, `lifecycle_data.json`), Solution Builder for offerings |
| Account Overview | the health-check shared folder; workbook sheets for demo customers                                                                    |
| Admin            | `user_entitlements.json`, `upload_history/`, `report_runs.json`, the upload files above                                               |

---

# Part 3 — Folders kept next to the repo (local setup)

Not part of the repo; typical names used next to it.

| Folder                                                 | What it is for                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `flightdeck-data/`                                     | The **master** data copy (`DATA_DIR`). All uploads and Run Reports for the shared data happen here            |
| `flightdeck-data-test/`                                | A throwaway copy for experiments; point `DATA_DIR` at it while testing, restore it from a snapshot afterwards |
| `flightdeck-data-backups/`                             | Older workbook backups                                                                                        |
| Health-check shared folder (`HEALTH_CHECK_SHARED_DIR`) | `requests/` and `completed/` files exchanged with the Health Check Tool                                       |
| `healthcheck-analyzer/`                                | The Health Check Tool, a separate Python app, with its own setup                                              |
| `flightdeck-data-<date>.tar.gz` + `.manifest.json`     | Data snapshots made with `scripts/data-snapshot.mjs`                                                          |
