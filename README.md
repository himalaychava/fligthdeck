# FlightDeck

IBM Expert Labs **Subscription FlightDeck**: one place to see a customer's
contracts (Clarizen), support cases (CSP), product lifecycle and the
opportunities that follow from them, by customer, geo and market.

It is a Node.js web app built with TanStack Start, React and IBM Carbon. The
browser pages and the server API run in one process on port 8080. The server
reads and writes plain files in one **data folder**, which lives outside this
repo.

---

## What is in this repo

```
src/
  routes/          pages (login, home, admin, the customer pages)
  components/      page sections, by area (overview, contract, insights, admin, ...)
  server/          the server: API routes, uploads, reports, data access
  demo-integration/  loads data into the pages (the name is historical; it is the live data layer)
  constants/ lib/ contexts/ config/ data/
public/            logo
scripts/           maintenance scripts (see below)
docs/              background documents
.env.example       every setting, with notes
```

Not in the repo, by design: **data**, **`.env`** (settings and secrets), logs and
build output. `.gitignore` blocks them.

[docs/FOLDERS_AND_DATA.md](docs/FOLDERS_AND_DATA.md) explains every folder and
file, in the code and in the data folder, and which page uses which data.

## Run it locally

You need Node.js 22 and access to the IBM network (VPN) for the Solution
Builder offerings.

1. Clone the repo and install packages:
   ```
   npm ci
   ```
2. Create your settings file and fill it in:
   ```
   cp .env.example .env
   ```
   - `DATA_DIR`: the full path to your data folder (see **Getting the data**).
   - `ADMIN_EMAILS` and `VITE_ADMIN_EMAILS`: your own IBM email.
   - `VITE_OIDC_ENABLED=false` on your own machine (simple email sign-in).
   - Keys (`SOLUTION_BUILDER_API_KEY`, `BOBSHELL_API_KEY`, SSO values): get them
     from the FlightDeck admin. Without them the app still runs; offerings and AI
     insights are skipped.
3. Start it:
   ```
   NODE_OPTIONS=--use-system-ca npm run dev
   ```
   Open http://localhost:8080. `--use-system-ca` lets Node trust IBM's internal
   certificates (already trusted by your Mac), which the Solution Builder API uses.

## Getting the data

All data lives in the folder `DATA_DIR` points to: the workbook, the Clarizen,
CSP, OCC and lifecycle uploads, saved reports, Upload History, user access and
saved edits. Nothing in the app needs changing to move it, only `DATA_DIR`.

**One master copy.** The FlightDeck admin keeps the master data folder. All
uploads (Clarizen, CSP, OCC, lifecycle) and Run Reports for the shared data
happen there. Everyone else works on a copy of it.

**Getting a copy:** the admin shares a dated snapshot, two files that belong
together:

```
flightdeck-data-2026-11-11-0915.tar.gz          the data
flightdeck-data-2026-11-11-0915.manifest.json   file list with checksums, last Clarizen and CSP upload
```

Put both in the same folder, stop the app, then:

```
node --env-file=.env scripts/data-restore.mjs /path/to/flightdeck-data-2026-11-11-0915.tar.gz            # dry run
node --env-file=.env scripts/data-restore.mjs /path/to/flightdeck-data-2026-11-11-0915.tar.gz --apply    # restore
```

Every file is checked against the manifest before your data folder is switched,
and your previous folder is kept (renamed `...before-restore-<time>`), never deleted.

**Making a snapshot** (admin, from the master copy, with no upload or Run Reports running):

```
node --env-file=.env scripts/data-snapshot.mjs [output-folder]
```

**Rules**

- Upload data only on the master copy. Your copy is disposable: if you test an
  upload or change something, restore the latest snapshot to get back in step.
- Never copy your data folder to dev or prod, and never commit it.
- The data is customer data. Share snapshots only through an approved, access-
  controlled channel, never by email, chat or git. Delete your copy when you no
  longer need it.
- When a code change needs the data rebuilt (for example a new Clarizen rule),
  the admin redoes the upload on the master copy and shares a new snapshot.
- For experiments, keep a second folder (for example `flightdeck-data-test`)
  and point `DATA_DIR` at it while you test.

**Starting from nothing** (a new server or an empty folder):

```
node --env-file=.env scripts/init-data-folder.mjs
```

creates the folder and an empty workbook. Then start the app and, in
**Admin → Data Uploads**, upload Clarizen first (it creates the customer pages),
then CSP, OCC and lifecycle, and run **Run Reports**.

## Settings

Every setting is listed and explained in [.env.example](.env.example). Two kinds:

- `VITE_*` settings are baked in when the app starts or is built. Restart
  `npm run dev` (or rebuild) after changing them.
- All others are read by the server while it runs.

`VITE_OIDC_ENABLED` must be `true` on every shared server: when it is not, the
server trusts the email the browser sends.

## Scripts

Run from the project folder.

| Script                           | What it does                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `scripts/init-data-folder.mjs`   | Creates an empty data folder and workbook. Never overwrites.                            |
| `scripts/data-snapshot.mjs`      | Makes a dated snapshot of the data folder, with a manifest.                             |
| `scripts/data-restore.mjs`       | Replaces your data folder with a snapshot, after checking every file.                   |
| `scripts/remove-client.mjs`      | Removes one customer page and its saved data. Dry run unless `--apply`; backs up first. |
| `scripts/generate-demo-data.mjs` | Regenerates the demo customers (`npm run generate-demo-data`).                          |

Most need the settings: `node --env-file=.env scripts/<name>.mjs`.

## Build

```
npm run build      # production build into dist/
npm run lint       # ESLint
npx tsc --noEmit   # type check
```

The Fyre dev and prod servers currently run `npm run dev` as a systemd service
(`systemctl restart control-plane`). Moving to a production build is planned
with the Cirrus deployment.

## Troubleshooting

| Problem                                             | Fix                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Offerings: "unable to get local issuer certificate" | Start with `NODE_OPTIONS=--use-system-ca`                                       |
| Offerings: "getaddrinfo ENOTFOUND …cirrus.ibm.com"  | Connect to the IBM VPN                                                          |
| Customer list: "Excel backend unavailable"          | `DATA_DIR` is wrong, or the folder has no workbook (run `init-data-folder.mjs`) |
| Pages show old data after a restore                 | Restart the app                                                                 |
| Port 8080 already in use                            | Another FlightDeck is running; stop it first                                    |

## Working on the code

- `main` is always deployable. Work on a short-lived branch (`feat/…`, `fix/…`,
  `chore/…`) and merge through a pull request with one review.
- Commit messages follow Conventional Commits: `feat:`, `fix:`, `chore:`,
  `docs:`, `build:`, `ci:`. One concern per commit.
- Never commit `.env`, data, Excel/CSV files, logs or snapshots.
