import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { readXlsxHeadersOnly } from "./xlsxStreamReader";
import { normaliseClientData } from "@/demo-integration/dataAdapters";
import type { Client, ClientKPIConfig } from "@/data/clients";
import { getCasesForClient, getEcProductsForClient, getEcEngagementsForClient, getClientCmrNumber, getContractsForClient, getContractSummaryForClient, safeReadClientOverview, type CaseDateFilter } from "./caseDataReader";
import { countActiveEcProducts } from "./productVerificationService";
import {
  getContractsWithTeam,
  saveContractOverride,
  type DeliveryConsultant,
} from "./contractOverridesService";
import {
  getEcProductBoxes,
  verifyProduct,
  unverifyProduct,
  addProduct,
  removeProduct,
  restoreProduct,
} from "./productVerificationService";
import { getCspProductNames } from "./cspProductCatalog";
import { getExcelFilePath } from "./demoDataPaths";
import { resolveAccess, canAccessClient, filterAccessibleClients } from "./accessControl";
import {
  getGeoMarketTree,
  getUnclassifiedClients,
  getClientGeoMarketIndex,
} from "./geoMarketService";
import { analyseCases, generateAllInsights } from "./aiInsightsService";
import { readSavedInsights, writeSavedInsights, deleteSavedInsights, type DataRange } from "./insightsCacheService";
import {
  getUploadStatus,
  readColumnMappings,
  saveColumnMapping,
  mergeClarizenCustomers,
  readClarizenMaster,
  mergeCspCases,
  replaceOccData,
  replaceLifecycleData,
  readLifecycleMappings,
  saveLifecycleMapping,
  deleteLifecycleMapping,
  type ClarizenCustomer,
  type CspCase,
  type OccProduct,
  type LifecycleProduct,
  type ColumnMapping,
} from "./dataIngestionService";
import { invalidateLifecycleCache, listCatalogProductNames } from "./productLifecycleService";
import {
  getPendingProducts,
  invalidatePendingProductsCache,
} from "./lifecyclePendingProducts";
import { runClarizenOnboarding } from "./clarizenOnboardingService";
import { buildRejectReport, writeRejectReport, readRejectReport } from "./clarizenRejects";
import { parseSheetWithDetectedHeader } from "./excelHeaderDetect";
import {
  startRun,
  getRunStatus,
  requestCancel,
  isRunInProgress,
  type RunScope,
} from "./reportBatchService";
import {
  readSchedule,
  writeSchedule,
  initReportScheduler,
  notifyDataUploaded,
} from "./reportScheduler";
import { readReport, activeBackendName } from "./reportStore";
import { buildExecutiveSummary } from "./executiveSummaryService";
import {
  buildOverview,
  buildReportWorkbook,
  canFilterOpportunities,
  canViewOpportunities,
  opportunityCountsByCustomer,
  readOpportunitySummary,
  REPORT_KINDS,
  rowsForCaller,
  type ReportKind,
} from "./opportunitySummary";

// Start the daily schedule timer once, when this module is first loaded.
initReportScheduler();
import { enqueueCspJob, getJob, saveTempFile, parseCsvBuffer } from "./uploadJobQueue";
import * as XLSX from "xlsx";
import {
  appendClientKpiScoresToWorkbook,
  appendProductAdoptionScoreToWorkbook,
  saveClientKpiConfigToWorkbook,
  saveExecutiveSummaryToWorkbook,
} from "./kpiExcelMutations";
import { isExcelBackendAvailable, readWorkbookPayload, readSalesforceCaseReports } from "./excelWorkbook";
import {
  readEntitlements,
  upsertEntitlement,
  removeEntitlement,
  isAdminEmail,
  callerHasEditAccess,
  type UserRole as EntitlementRole,
} from "./userEntitlements";
import { processSalesforceCases, getClientCaseInsights } from "@/demo-integration/salesforceCaseAdapter";
import { getProductHealthKpisSync, getProductRecommendationsSync, getLastHealthCheckMeta, listHealthCheckHistory, getHealthCheckByFile, getHealthCheckTrend, listDatabasesForProduct } from "./productHealthKpiServer";
import { generateHealthCheckTemplate, checkCompletedFileExists } from "./healthCheckTemplateGenerator";
import { getSubscriptionOfferingsForProducts } from "./solutionBuilderApi";
import { applyEndCustomerRules, findEndCustomerColumns, isHiddenHolderPage, readEndCustomer } from "./endCustomerRules";
import {
  buildUploadReport,
  diffClarizen,
  getUpload,
  listUploads,
  recordUpload,
} from "./uploadHistory";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "pragma": "no-cache",
  "expires": "0",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function clientIdFromPath(pathname: string, suffix: string): string | null {
  const prefix = "/api/demo/clients/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  if (!suffix) {
    const slash = rest.indexOf("/");
    if (slash >= 0) return null;
    return decodeURIComponent(rest);
  }
  if (!rest.endsWith(suffix)) return null;
  const idPart = rest.slice(0, rest.length - suffix.length);
  if (!idPart || idPart.includes("/")) return null;
  return decodeURIComponent(idPart);
}

/**
 * Read and VERIFY the session cookie.
 *
 * The cookie is `base64url(payload) + "." + base64url(HMAC-SHA256(payload))`,
 * written by oidcHandler.encodeSession. The signature is what makes it
 * trustworthy: without checking it, anybody can base64-encode
 * {"email":"<any admin>"} and be treated as that person.
 *
 * Verified with a timing-safe comparison against the same SESSION_SECRET the
 * auth handler signs with. A cookie that fails verification is treated as no
 * cookie at all.
 */
function readVerifiedSession(request: Request): { email?: string; name?: string } | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)cp_session=([^;]+)/);
  if (!match) return null;
  try {
    const token = decodeURIComponent(match[1]);
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const dataB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const data = Buffer.from(dataB64, "base64url").toString("utf-8");

    const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
    const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");

    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    return JSON.parse(data) as { email?: string; name?: string };
  } catch {
    return null;
  }
}

/**
 * Extract the caller's email.
 * Priority:
 *   1. cp_session cookie (OIDC / SSO mode) — HMAC-signed, authoritative
 *   2. X-CP-Email header (static login mode) — only trusted when VITE_OIDC_ENABLED
 *      is NOT "true", i.e. the server itself is in static/dev mode.
 *      Final auth check (isAdminEmail) is always enforced server-side regardless.
 */
function getCallerEmail(request: Request): string {
  // 1. OIDC session cookie — signature verified, never merely decoded
  const session = readVerifiedSession(request);
  const sessionEmail = (session?.email ?? "").toLowerCase().trim();
  if (sessionEmail) return sessionEmail;
  // 2. Static-login fallback — X-CP-Email header (only when OIDC is disabled)
  if (process.env.VITE_OIDC_ENABLED !== "true") {
    const headerEmail = (request.headers.get("x-cp-email") || "").toLowerCase().trim();
    if (headerEmail) return headerEmail;
  }
  return "";
}

/**
 * Display name of the caller, resolved the same way as {@link getCallerEmail}.
 * Used to record WHO performed an action in a human-readable form; the email
 * remains the identity, this is only for display.
 */
function getCallerName(request: Request): string {
  const session = readVerifiedSession(request);
  const sessionName = (session?.name ?? "").trim();
  if (sessionName) return sessionName;
  if (process.env.VITE_OIDC_ENABLED !== "true") {
    const headerName = (request.headers.get("x-cp-name") || "").trim();
    if (headerName) return headerName;
  }
  return "";
}

export async function handleDemoApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (!pathname.startsWith("/api/demo/") && !pathname.startsWith("/api/admin/") && !pathname.startsWith("/api/my/") && !pathname.startsWith("/api/debug/")) return null;

  // ── /api/debug/session — diagnose auth issues (shows what the server sees for this request) ──
  if (pathname === "/api/debug/session" && request.method === "GET") {
    const callerEmail = getCallerEmail(request);
    const adminList = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
    const entitlement = readEntitlements().find(e => e.email === callerEmail) ?? null;
    return new Response(JSON.stringify({
      cookieEmail: callerEmail || "(none — no valid session cookie)",
      ADMIN_EMAILS_env: process.env.ADMIN_EMAILS ?? "(not set)",
      adminListParsed: adminList,
      isAdmin: isAdminEmail(callerEmail),
      entitlementRecord: entitlement,
    }, null, 2), { status: 200, headers: { "content-type": "application/json" } });
  }

  // ── /api/my/entitlement — returns the calling user's own entitlement (no admin required) ──
  if (pathname === "/api/my/entitlement" && request.method === "GET") {
    const callerEmail = getCallerEmail(request);
    if (!callerEmail) {
      return new Response(JSON.stringify({ entitlement: null }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (isAdminEmail(callerEmail)) {
      // Admins have implicit full access — return a synthetic management record
      return new Response(JSON.stringify({ entitlement: { email: callerEmail, role: "management", clientIds: [], geos: [], markets: {} } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    const record = readEntitlements().find(e => e.email === callerEmail) ?? null;
    return new Response(JSON.stringify({ entitlement: record }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  // ── Admin user entitlements API (independent of Excel backend) ─────────────
  if (pathname.startsWith("/api/admin/")) {
    const callerEmail = getCallerEmail(request);
    if (!isAdminEmail(callerEmail)) {
      return new Response(JSON.stringify({ error: "Forbidden — admin access required" }), {
        status: 403, headers: { "content-type": "application/json" },
      });
    }

    // GET /api/admin/users
    if (pathname === "/api/admin/users" && request.method === "GET") {
      return new Response(JSON.stringify(readEntitlements()), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // GET /api/admin/export/csp-insights — the filtered insights workbook.
    //
    // Served through the API rather than as a static file: it contains customer
    // case data, and a static URL under public/ would be downloadable by anyone
    // with the link, signed in or not. This route sits behind the admin gate
    // above and reads from the configured data directory, so it keeps working
    // when that directory moves out of public/.
    if (pathname === "/api/admin/export/csp-insights" && request.method === "GET") {
      try {
        const file = path.join(
          path.dirname(getExcelFilePath()),
          "csp_filtered_insights.xlsx",
        );
        if (!fs.existsSync(file)) {
          return json({ error: "No export available yet — upload CSP data first." }, 404);
        }
        const buf = fs.readFileSync(file);
        return new Response(new Uint8Array(buf), {
          status: 200,
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition": 'attachment; filename="csp_filtered_insights.xlsx"',
            "cache-control": "no-store",
          },
        });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Export failed" }, 500);
      }
    }

    // POST /api/admin/users — upsert
    if (pathname === "/api/admin/users" && request.method === "POST") {
      const body = (await request.json()) as {
        email?: string; role?: string; clientIds?: string[];
        geos?: string[]; markets?: Record<string, string[]>;
        editAccess?: boolean;
      };
      if (!body.email?.trim()) {
        return new Response(JSON.stringify({ error: "email is required" }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      const validRoles: EntitlementRole[] = ["management", "delivery", "sales"];
      const role: EntitlementRole = validRoles.includes(body.role as EntitlementRole)
        ? (body.role as EntitlementRole) : "delivery";

      // Only geographies and markets that actually exist in the current
      // Clarizen data are stored. A stale value left over from a previous
      // upload cannot linger and silently grant nothing (or, worse, match a
      // renamed geo later).
      const tree = getGeoMarketTree();
      const validGeos = new Set(tree.map((t) => t.geo));
      const marketsByGeo = new Map(tree.map((t) => [t.geo, new Set(t.markets)]));
      const geos = (body.geos ?? []).filter((g) => validGeos.has(g));
      const markets: Record<string, string[]> = {};
      for (const [geo, list] of Object.entries(body.markets ?? {})) {
        if (!geos.includes(geo)) continue;
        const valid = marketsByGeo.get(geo);
        const kept = (list ?? []).filter((m) => valid?.has(m));
        if (kept.length > 0) markets[geo] = kept;
      }

      upsertEntitlement({
        email: body.email.trim().toLowerCase(),
        role,
        clientIds: role === "management" ? [] : (body.clientIds ?? []),
        geos,
        markets,
        // Defaults to true (edit access on) — matches the required default for
        // a newly-added Delivery user, and is harmless for every other role
        // since callerHasEditAccess only enforces it for "delivery".
        editAccess: body.editAccess !== false,
      });
      return new Response(JSON.stringify({ ok: true, users: readEntitlements() }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // DELETE /api/admin/users/:email
    const deleteMatch = pathname.match(/^\/api\/admin\/users\/(.+)$/);
    if (deleteMatch && request.method === "DELETE") {
      removeEntitlement(decodeURIComponent(deleteMatch[1]));
      return new Response(JSON.stringify({ ok: true, users: readEntitlements() }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // GET /api/admin/clarizen-rejects — rows the last upload refused
    if (pathname === "/api/admin/clarizen-rejects" && request.method === "GET") {
      return new Response(JSON.stringify(readRejectReport() ?? { customers: [] }), {
        status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    // ── Report batch generation ────────────────────────────────────────────

    // GET /api/admin/reports/status — current run + last completed run
    if (pathname === "/api/admin/reports/status" && request.method === "GET") {
      const { current, lastCompleted } = getRunStatus();
      return new Response(
        JSON.stringify({
          current,
          lastCompleted,
          running: isRunInProgress(),
          storageBackend: activeBackendName(),
          schedule: readSchedule(),
        }),
        { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } },
      );
    }

    // POST /api/admin/reports/run — start a batch run in the background
    if (pathname === "/api/admin/reports/run" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        scope?: RunScope;
        skipAi?: boolean;
      };
      const result = startRun({
        scope: body.scope === "all" ? "all" : "stale",
        trigger: "manual",
        startedBy: callerEmail,
        skipAi: !!body.skipAi,
      });
      return new Response(JSON.stringify(result), {
        status: result.ok ? 202 : 409,
        headers: { "content-type": "application/json" },
      });
    }

    // POST /api/admin/reports/cancel — stop after the in-flight clients finish
    if (pathname === "/api/admin/reports/cancel" && request.method === "POST") {
      const cancelled = requestCancel();
      return new Response(JSON.stringify({ ok: cancelled }), {
        status: cancelled ? 200 : 409,
        headers: { "content-type": "application/json" },
      });
    }

    // POST /api/admin/reports/schedule — save the schedule config
    if (pathname === "/api/admin/reports/schedule" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const saved = writeSchedule(
        {
          enabled: !!body.enabled,
          timeOfDay: String(body.timeOfDay ?? "02:00"),
          scope: body.scope === "all" ? "all" : "stale",
          skipAi: !!body.skipAi,
          runAfterUpload: !!body.runAfterUpload,
        },
        callerEmail,
      );
      return new Response(JSON.stringify({ ok: true, schedule: saved }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // GET /api/admin/upload/status
    if (pathname === "/api/admin/upload/status" && request.method === "GET") {
      return new Response(JSON.stringify(getUploadStatus()), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // GET /api/admin/column-mappings
    if (pathname === "/api/admin/column-mappings" && request.method === "GET") {
      return new Response(JSON.stringify(readColumnMappings()), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // POST /api/admin/column-mappings — save mapping for a type
    if (pathname === "/api/admin/column-mappings" && request.method === "POST") {
      const body = (await request.json()) as { type?: string; mapping?: ColumnMapping };
      if (!body.type || !body.mapping) {
        return new Response(JSON.stringify({ error: "type and mapping are required" }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      if (
        body.type !== "clarizen" &&
        body.type !== "csp" &&
        body.type !== "occ" &&
        body.type !== "lifecycle"
      ) {
        return new Response(
          JSON.stringify({ error: "type must be clarizen, csp, occ, or lifecycle" }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      saveColumnMapping(body.type, body.mapping);
      return new Response(JSON.stringify({ ok: true, mappings: readColumnMappings() }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // GET /api/admin/upload-history — every Clarizen and CSP upload, newest first
    if (pathname === "/api/admin/upload-history" && request.method === "GET") {
      return json({ uploads: listUploads() });
    }
    // GET /api/admin/upload-history/:id          — one upload's full record
    // GET /api/admin/upload-history/:id/report   — the same, as an Excel report
    const uploadHistoryMatch = pathname.match(
      /^\/api\/admin\/upload-history\/([^/]+?)(\/report)?$/,
    );
    if (uploadHistoryMatch && request.method === "GET") {
      const record = getUpload(decodeURIComponent(uploadHistoryMatch[1]));
      if (!record) return error("Upload not found", 404);
      if (!uploadHistoryMatch[2]) return json(record);
      return new Response(new Uint8Array(buildUploadReport(record)), {
        status: 200,
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="upload-report-${record.kind}-${record.uploadedAt.slice(0, 10)}.xlsx"`,
        },
      });
    }

    // POST /api/admin/upload/clarizen — multipart form upload
    if (pathname === "/api/admin/upload/clarizen" && request.method === "POST") {
      const uploadStarted = Date.now();
      let uploadFileName = "";
      // Failed uploads are recorded too, so the history shows every attempt.
      const recordFailure = (message: string) =>
        recordUpload({
          kind: "clarizen",
          fileName: uploadFileName,
          uploadedAt: new Date(uploadStarted).toISOString(),
          uploadedBy: callerEmail,
          status: "failed",
          durationMs: Date.now() - uploadStarted,
          error: message,
        });
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const mappingRaw = formData.get("mapping") as string | null;
        if (!file) {
          return new Response(JSON.stringify({ error: "No file uploaded" }), {
            status: 400, headers: { "content-type": "application/json" },
          });
        }
        const mapping: ColumnMapping = mappingRaw ? JSON.parse(mappingRaw) : {};
        // Save the mapping for future uploads
        if (Object.keys(mapping).length > 0) {
          saveColumnMapping("clarizen", mapping);
        }
        uploadFileName = file.name;
        // Parse uploaded file (Excel or CSV)
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });

        // The Clarizen export carries banner rows before the real header
        // ("IBM Expert Lab Ser…", "879 Customer results", …), so row 1 is not
        // the header. Find it. Refusing the file when no header can be found
        // is deliberate: parsing from the wrong row imports ZERO rows and used
        // to report success, which is worse than an error.
        const parsed = parseSheetWithDetectedHeader(workbook);
        if (!parsed) {
          recordFailure("No Clarizen header row found in the first 20 rows of any sheet");
          return new Response(JSON.stringify({
            error:
              "Could not find a Clarizen header row in the first 20 rows of any sheet. " +
              "Expected column names such as 'Customer Number', 'Customer Name', 'Geo', " +
              "'Market OLD' or 'Line of Business'. Check that this is a Clarizen export.",
          }), { status: 400, headers: { "content-type": "application/json" } });
        }
        const { rows, detection, sheetName } = parsed;
        if (rows.length === 0) {
          recordFailure(
            `Header found on row ${detection.headerRow + 1} but no data rows beneath it`,
          );
          return new Response(JSON.stringify({
            error: `Header found on row ${detection.headerRow + 1} of sheet "${sheetName}", but there are no data rows beneath it.`,
          }), { status: 400, headers: { "content-type": "application/json" } });
        }
        console.log(
          `[clarizen-upload] sheet "${sheetName}": header on row ${detection.headerRow + 1} ` +
          `(${detection.matches} known columns matched), ${rows.length} data rows`,
        );
        // Apply column mapping — fall back to saved mapping, then identity
        const savedMapping = readColumnMappings().clarizen ?? {};
        const effectiveMapping = Object.keys(mapping).length > 0 ? mapping : savedMapping;
        const m = (field: string): string => effectiveMapping[field] ?? field;
        // End customer ("Customer" + the second "Customer Number"), read by
        // column position because both number columns share one header.
        const sheet = workbook.Sheets[sheetName];
        const endColumns = findEndCustomerColumns(sheet, detection.headerRow);
        const customers: ClarizenCustomer[] = rows.map((r) => {
          const products = String(r[m("ecEmProducts")] ?? r[m("ec_em_products")] ?? "")
            .split(",").map((p) => p.trim()).filter(Boolean);
          return {
            customerNumber: String(r[m("customerNumber")] ?? r[m("customer_number")] ?? r["Customer Number"] ?? "").trim(),
            customerName:   String(r[m("customerName")]   ?? r[m("customer_name")]   ?? r["Customer Name"]   ?? "").trim(),
            ecEmProducts:   products,
            contractStart:  String(r[m("contractStart")]  ?? r[m("contract_start")]  ?? r["Contract Start"]  ?? "").trim() || undefined,
            contractEnd:    String(r[m("contractEnd")]    ?? r[m("contract_end")]    ?? r["Contract End"]    ?? "").trim() || undefined,
            ...r,  // preserve all raw fields
            ...readEndCustomer(sheet, endColumns, r),
          };
        }).filter((c) => c.customerName);
        // Reseller-held contracts (SBM) are filed under their end customer.
        const endCustomers = applyEndCustomerRules(customers);
        // Split BEFORE either step runs. The customer number is the key that
        // CSP cases, geography and contracts all join on, so a row without one
        // cannot be stored — and must not be onboarded either. Passing the
        // unfiltered list to onboarding is what created the "(tbd)" client: a
        // row too incomplete to store, yet good enough to make a client page.
        const accepted = customers.filter((c) => String(c.customerNumber ?? "").trim());
        const rejected = customers.filter((c) => !String(c.customerNumber ?? "").trim());

        // Kept for the upload report's "changes since the previous upload".
        const previousMaster = readClarizenMaster();
        // Merge into master store
        const mergeResult = mergeClarizenCustomers(accepted);
        // Run onboarding — add new clients to the workbook
        const onboarding = runClarizenOnboarding(accepted);

        const rejectReport = buildRejectReport(rejected as unknown as Record<string, unknown>[], {
          totalRows: customers.length,
          acceptedRows: accepted.length,
          uploadedBy: callerEmail,
          fileName: file.name,
        });
        writeRejectReport(rejectReport);

        const overviewById = new Map(
          safeReadClientOverview().map((r) => [String(r.client_id ?? ""), r]),
        );
        recordUpload({
          kind: "clarizen",
          fileName: file.name,
          uploadedAt: new Date(uploadStarted).toISOString(),
          uploadedBy: callerEmail,
          status: "success",
          durationMs: Date.now() - uploadStarted,
          clarizen: {
            rowsInFile: customers.length,
            rowsStored: accepted.length,
            rowsDiscarded: rejected.length,
            headerRow: detection.headerRow + 1,
            sheetName,
            newPages: onboarding.newClients.map((id) => ({
              clientId: id,
              name: String(overviewById.get(id)?.client_name ?? ""),
              customerNumber: String(overviewById.get(id)?.cmr_number ?? ""),
            })),
            pagesAlreadyExisting: onboarding.skipped.length,
            discarded: rejectReport.customers.map((c) => ({
              customerName: c.customerName,
              rowCount: c.rowCount,
              geo: c.geo,
              country: c.country,
              reason: c.reason,
            })),
            endCustomers,
            changes: diffClarizen(previousMaster, accepted),
          },
        });

        notifyDataUploaded("clarizen");
        return new Response(JSON.stringify({
          ok: true,
          rows: customers.length,
          merge: mergeResult,
          onboarding,
          discarded: rejectReport,
          endCustomers,
          headerRow: detection.headerRow + 1,
          sheetName,
          headers: rows.length > 0 ? Object.keys(rows[0]) : [],
        }), { status: 200, headers: { "content-type": "application/json" } });
      } catch (e) {
        console.error("[clarizen-upload]", e);
        recordFailure(e instanceof Error ? e.message : "Upload failed");
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Upload failed" }), {
          status: 500, headers: { "content-type": "application/json" },
        });
      }
    }

    // POST /api/admin/upload/csp/peek-headers — save file to disk, return just the header row
    // Used by the mapping modal — avoids parsing a 700MB xlsx in the browser
    if (pathname === "/api/admin/upload/csp/peek-headers" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file) return new Response(JSON.stringify({ error: "No file" }), { status: 400, headers: { "content-type": "application/json" } });
        const ext = file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // Save to disk first — reused by the subsequent upload call so file isn't sent twice
        const tempPath = saveTempFile(new Uint8Array(arrayBuffer), ext);
        let headers: string[] = [];
        if (ext === "csv") {
          // Read only the first line — fast path for large CSVs
          const text = buffer.toString("utf-8").split(/\r?\n/)[0] ?? "";
          let cur = "", inQ = false;
          for (const ch of text) {
            if (ch === '"') inQ = !inQ;
            else if (ch === "," && !inQ) { headers.push(cur.trim()); cur = ""; }
            else cur += ch;
          }
          headers.push(cur.trim());
          headers = headers.filter(Boolean);
        } else {
          // xlsx: use streaming reader — safe for 700MB+ sheets
          try {
            headers = await readXlsxHeadersOnly(buffer);
          } catch { /* headers stays [] */ }
        }
        return new Response(JSON.stringify({ headers, tempPath }), { status: 200, headers: { "content-type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }), { status: 500, headers: { "content-type": "application/json" } });
      }
    }

    // POST /api/admin/upload/csp — save to disk + enqueue background job, returns jobId immediately
    if (pathname === "/api/admin/upload/csp" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const mappingRaw = formData.get("mapping") as string | null;
        if (!file) {
          return new Response(JSON.stringify({ error: "No file uploaded" }), {
            status: 400, headers: { "content-type": "application/json" },
          });
        }
        const mapping: ColumnMapping = mappingRaw ? JSON.parse(mappingRaw) : {};
        const clearFirst = (formData.get("clearFirst") as string | null) === "true";
        const existingTempPath = (formData.get("tempPath") as string | null)?.trim() || null;
        const ext = file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
        // Reuse the temp file saved during peek-headers if it still exists
        let tempPath: string;
        if (existingTempPath && fs.existsSync(existingTempPath)) {
          tempPath = existingTempPath;
        } else {
          const arrayBuffer = await file.arrayBuffer();
          tempPath = saveTempFile(new Uint8Array(arrayBuffer), ext);
        }
        // Enqueue background job — returns immediately
        const callerEmail = getCallerEmail(request) || "Admin";
        const jobId = enqueueCspJob(tempPath, ext, mapping, clearFirst, file.name, callerEmail);
        return new Response(JSON.stringify({ ok: true, jobId }), {
          status: 202, headers: { "content-type": "application/json" },
        });
      } catch (e) {
        console.error("[csp-upload]", e);
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Upload failed" }), {
          status: 500, headers: { "content-type": "application/json" },
        });
      }
    }

    // GET /api/admin/upload/csp/progress/:jobId — plain JSON snapshot (polled by UI every 800ms)
    const progressMatch = pathname.match(/^\/api\/admin\/upload\/csp\/progress\/([^/]+)$/);
    if (progressMatch && request.method === "GET") {
      const jobId = decodeURIComponent(progressMatch[1]);
      const job = getJob(jobId);
      if (!job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404, headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(job), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    }

    // POST /api/admin/upload/occ — OCC product hierarchy (clear-and-replace)
    if (pathname === "/api/admin/upload/occ" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const mappingRaw = formData.get("mapping") as string | null;
        if (!file) {
          return new Response(JSON.stringify({ error: "No file uploaded" }), {
            status: 400, headers: { "content-type": "application/json" },
          });
        }
        const mapping: ColumnMapping = mappingRaw ? JSON.parse(mappingRaw) : {};
        if (Object.keys(mapping).length > 0) {
          saveColumnMapping("occ", mapping);
        }
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]);
        if (rows.length === 0) {
          return new Response(JSON.stringify({ error: "File contains no data rows" }), {
            status: 400, headers: { "content-type": "application/json" },
          });
        }
        const savedMapping = readColumnMappings().occ ?? {};
        const effectiveMapping = Object.keys(mapping).length > 0 ? mapping : savedMapping;
        const m = (field: string): string => effectiveMapping[field] ?? field;
        const products: OccProduct[] = rows
          .map((r) => ({
            l30Code: String(r[m("l30Code")] ?? r["SWS L30 Code"] ?? "").trim(),
            l30Desc: String(r[m("l30Desc")] ?? r["SWS L30 Desc"] ?? "").trim(),
            ...r,
          }))
          .filter((p) => p.l30Code);
        const result = replaceOccData(products);
        return new Response(JSON.stringify({
          ok: true,
          rows: result.total,
          headers: rows.length > 0 ? Object.keys(rows[0]) : [],
        }), { status: 200, headers: { "content-type": "application/json" } });
      } catch (e) {
        console.error("[occ-upload]", e);
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Upload failed" }), {
          status: 500, headers: { "content-type": "application/json" },
        });
      }
    }

    // POST /api/admin/upload/lifecycle — IBM Product Lifecycle Catalog (clear-and-replace)
    if (pathname === "/api/admin/upload/lifecycle" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const mappingRaw = formData.get("mapping") as string | null;
        if (!file) {
          return new Response(JSON.stringify({ error: "No file uploaded" }), {
            status: 400, headers: { "content-type": "application/json" },
          });
        }
        const mapping: ColumnMapping = mappingRaw ? JSON.parse(mappingRaw) : {};
        if (Object.keys(mapping).length > 0) {
          saveColumnMapping("lifecycle", mapping);
        }
        const arrayBuffer = await file.arrayBuffer();
        // CSV fast path — the catalog is a large export and the xlsx reader is
        // an order of magnitude slower on plain CSV.
        let rows: Record<string, unknown>[];
        if (file.name.toLowerCase().endsWith(".csv")) {
          rows = parseCsvBuffer(Buffer.from(arrayBuffer));
        } else {
          const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
          rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
            workbook.Sheets[workbook.SheetNames[0]],
          );
        }
        if (rows.length === 0) {
          return new Response(JSON.stringify({ error: "File contains no data rows" }), {
            status: 400, headers: { "content-type": "application/json" },
          });
        }
        const savedMapping = readColumnMappings().lifecycle ?? {};
        const effectiveMapping = Object.keys(mapping).length > 0 ? mapping : savedMapping;
        const m = (field: string): string => effectiveMapping[field] ?? field;

        // Software rows only — Hardware is out of scope and roughly doubles the
        // catalog size, so it is dropped at ingest rather than at query time.
        const typeCol = m("type");
        let hardwareSkipped = 0;
        const products: LifecycleProduct[] = [];
        for (const r of rows) {
          const type = String(r[typeCol] ?? r["Type"] ?? "").trim().toUpperCase();
          if (type && !type.startsWith("SW")) { hardwareSkipped++; continue; }
          const productName = String(r[m("productName")] ?? r["IBM Product"] ?? "").trim();
          if (!productName) continue;
          products.push({
            productName,
            vrm:                  String(r[m("vrm")] ?? r["VRM"] ?? "").trim(),
            pid:                  String(r[m("pid")] ?? r["PID"] ?? "").trim(),
            endOfSupport:         String(r[m("endOfSupport")] ?? "").trim(),
            extendedEndOfSupport: String(r[m("extendedEndOfSupport")] ?? "").trim(),
            lifecyclePolicy:      String(r[m("lifecyclePolicy")] ?? r["Lifecycle Policy"] ?? "").trim(),
            generalAvailability:  String(r[m("generalAvailability")] ?? r["General Availability"] ?? "").trim(),
            ...r,
          });
        }
        const result = replaceLifecycleData(products);
        // A new catalog changes what resolves, so both caches are stale.
        invalidateLifecycleCache();
        invalidatePendingProductsCache();
        return new Response(JSON.stringify({
          ok: true,
          rows: result.total,
          hardwareSkipped,
          headers: Object.keys(rows[0]),
        }), { status: 200, headers: { "content-type": "application/json" } });
      } catch (e) {
        console.error("[lifecycle-upload]", e);
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Upload failed" }), {
          status: 500, headers: { "content-type": "application/json" },
        });
      }
    }

    // ── Product Lifecycle Mapping (manual CSP → catalog overrides) ──────────
    // Saved mappings take effect on the next insights generation with no
    // restart: resolveLifecycle reads the mapping file on every pass.

    // GET /api/admin/lifecycle-mappings — saved mappings + catalog name list
    if (pathname === "/api/admin/lifecycle-mappings" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          mappings: readLifecycleMappings(),
          catalogProductNames: listCatalogProductNames(),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    // POST /api/admin/lifecycle-mappings — create or update one mapping
    if (pathname === "/api/admin/lifecycle-mappings" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          cspProductName?: string;
          catalogProductName?: string;
        };
        const csp = String(body.cspProductName ?? "").trim();
        const catalog = String(body.catalogProductName ?? "").trim();
        if (!csp || !catalog) {
          return new Response(
            JSON.stringify({ error: "cspProductName and catalogProductName are required" }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        // Reject targets that aren't in the catalog — a mapping pointing at a
        // name that doesn't exist would silently never resolve.
        const known = listCatalogProductNames();
        if (!known.some((n) => n.trim().toLowerCase() === catalog.toLowerCase())) {
          return new Response(
            JSON.stringify({
              error: `"${catalog}" is not a product in the uploaded lifecycle catalog`,
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        const mappings = saveLifecycleMapping(csp, catalog, getCallerEmail(request) || "Admin");
        invalidatePendingProductsCache();
        return new Response(JSON.stringify({ ok: true, mappings }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e instanceof Error ? e.message : "Failed to save mapping" }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }
    }

    // DELETE /api/admin/lifecycle-mappings/:cspProductName
    const mappingDeleteMatch = pathname.match(/^\/api\/admin\/lifecycle-mappings\/(.+)$/);
    if (mappingDeleteMatch && request.method === "DELETE") {
      const mappings = deleteLifecycleMapping(decodeURIComponent(mappingDeleteMatch[1]));
      invalidatePendingProductsCache();
      return new Response(JSON.stringify({ ok: true, mappings }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // GET /api/admin/lifecycle-mappings-pending — CSP products failing all layers
    if (pathname === "/api/admin/lifecycle-pending" && request.method === "GET") {
      try {
        const force = new URL(request.url).searchParams.get("refresh") === "true";
        return new Response(JSON.stringify(getPendingProducts(force)), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e instanceof Error ? e.message : "Scan failed" }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404, headers: { "content-type": "application/json" },
    });
  }

  // Health-check and recommendations endpoints don't need the Excel workbook — handle them first
  try {
    // POST /api/demo/health-check/generate-template
    if (pathname === "/api/demo/health-check/generate-template" && request.method === "POST") {
      const body = await request.json();
      const { clientId, clientName } = body;
      if (!clientId || !clientName) {
        return error("clientId and clientName are required", 400);
      }
      const result = generateHealthCheckTemplate({ clientId, clientName });
      if (!result.success) {
        return error(result.error || "Failed to generate template", 500);
      }
      return json({
        success: true,
        fileName: result.fileName,
        filePath: result.filePath,
        message: `Health check template generated for ${clientName}`
      });
    }

    // GET /api/demo/health-check/check-completed/:clientId
    const checkCompletedMatch = pathname.match(/^\/api\/demo\/health-check\/check-completed\/([^/]+)$/);
    if (checkCompletedMatch && request.method === "GET") {
      const clientId = decodeURIComponent(checkCompletedMatch[1]);
      const result = checkCompletedFileExists(clientId);
      return json({ exists: result.exists, fileName: result.fileName, filePath: result.filePath });
    }

    // GET /api/demo/product-recommendations/:clientId
    const productRecsMatch = pathname.match(/^\/api\/demo\/product-recommendations\/([^/]+)$/);
    if (productRecsMatch && request.method === "GET") {
      const clientId = decodeURIComponent(productRecsMatch[1]);
      const recommendations = getProductRecommendationsSync(clientId);
      return json(recommendations);
    }

    // GET /api/demo/health-check/history/:clientId  — last 20 completed files with metadata (UI filters by product)
    const historyMatch = pathname.match(/^\/api\/demo\/health-check\/history\/([^/]+)$/);
    if (historyMatch && request.method === "GET") {
      const clientId = decodeURIComponent(historyMatch[1]);
      return json(listHealthCheckHistory(clientId, 20));
    }

    // GET /api/demo/health-check/file/:clientId/:filename/:productName — KPIs+Recs for one file
    const fileMatch = pathname.match(/^\/api\/demo\/health-check\/file\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (fileMatch && request.method === "GET") {
      const clientId    = decodeURIComponent(fileMatch[1]);
      const fileName    = decodeURIComponent(fileMatch[2]);
      const productName = decodeURIComponent(fileMatch[3]);
      return json(getHealthCheckByFile(clientId, fileName, productName));
    }

    // GET /api/demo/health-check/databases/:clientId/:productName
    const dbListMatch = pathname.match(/^\/api\/demo\/health-check\/databases\/([^/]+)\/([^/]+)$/);
    if (dbListMatch && request.method === "GET") {
      const clientId    = decodeURIComponent(dbListMatch[1]);
      const productName = decodeURIComponent(dbListMatch[2]);
      return json(listDatabasesForProduct(clientId, productName));
    }

    // GET /api/demo/health-check/trend/:clientId/:productName?dbName=ARMP
    const trendMatch = pathname.match(/^\/api\/demo\/health-check\/trend\/([^/]+)\/([^/]+)$/);
    if (trendMatch && request.method === "GET") {
      const clientId    = decodeURIComponent(trendMatch[1]);
      const productName = decodeURIComponent(trendMatch[2]);
      const dbName      = url.searchParams.get('dbName') ?? undefined;
      return json(getHealthCheckTrend(clientId, productName, dbName));
    }

    // GET /api/demo/health-check/last-completed/:clientId
    const lastCompletedMatch = pathname.match(/^\/api\/demo\/health-check\/last-completed\/([^/]+)$/);
    if (lastCompletedMatch && request.method === "GET") {
      const clientId = decodeURIComponent(lastCompletedMatch[1]);
      const { timestamp, dbName } = getLastHealthCheckMeta(clientId);
      return json({ timestamp, dbName });
    }
  } catch (e) {
    console.error('[health-check-api]', e);
    return error(e instanceof Error ? e.message : "Health check API failed", 500);
  }

  // ── Geo/market access control ───────────────────────────────────────────────
  //
  // Applied BEFORE any per-client route so a single check covers all of them —
  // adding a new per-client endpoint is protected by default rather than
  // needing to remember a guard. Admin routes are already gated above and are
  // deliberately not subject to this.
  //
  // The client id is always the first path segment after the resource name, so
  // it can be extracted without knowing which route matched.
  const PER_CLIENT_ROUTES = [
    "clients", "contracts", "contract-summary", "insights", "product-health",
    "product-recommendations", "product-verification", "salesforce",
  ];
  const perClient = pathname.match(
    new RegExp(`^/api/demo/(${PER_CLIENT_ROUTES.join("|")})/([^/]+)`),
  );
  if (perClient) {
    const targetClientId = decodeURIComponent(perClient[2]);
    const access = resolveAccess(getCallerEmail(request));
    if (!canAccessClient(access, targetClientId)) {
      return json({ error: "Not authorised for this customer" }, 403);
    }
  }

  // GET /api/demo/geo-markets — the geography/market tree, derived live from
  // Clarizen. Drives the admin multi-selects and the Global View filters so
  // both always offer exactly what the data contains.
  // ── Consolidated opportunities (landing page) ──────────────────────────────
  // All three read the saved opportunity_summary.json written by Run Reports —
  // nothing is calculated here. Access is enforced on every call: rows are
  // filtered by the same rule as the customer list, Delivery is refused, and
  // Geo/Market filters (Management and admins only) can only narrow.
  if (pathname.startsWith("/api/demo/opportunities/") && request.method === "GET") {
    const access = resolveAccess(getCallerEmail(request));
    if (!canViewOpportunities(access)) {
      return json({ error: "Opportunity reports are available to Management and Sales." }, 403);
    }
    const file = readOpportunitySummary();
    if (!file) {
      return pathname === "/api/demo/opportunities/export"
        ? json({ error: "Reports not available yet — run reports from the Admin Panel first." }, 404)
        : json({ available: false });
    }
    const canFilter = canFilterOpportunities(access);
    const geoMarket = canFilter
      ? {
          geo: url.searchParams.get("geo") || undefined,
          market: url.searchParams.get("market") || undefined,
        }
      : {};
    // Division narrows by product only, so every viewer may use it.
    const filters = { ...geoMarket, division: url.searchParams.get("division") || undefined };
    const visible = rowsForCaller(access, file);
    const geoMarketRows =
      geoMarket.geo || geoMarket.market ? rowsForCaller(access, file, geoMarket) : visible;
    const rows = filters.division ? rowsForCaller(access, file, filters) : geoMarketRows;

    if (pathname === "/api/demo/opportunities/overview") {
      return json(buildOverview(rows, file, canFilter, visible, geoMarketRows));
    }
    if (pathname === "/api/demo/opportunities/customer-counts") {
      return json({ generatedAt: file.generatedAt, counts: opportunityCountsByCustomer(visible) });
    }
    if (pathname === "/api/demo/opportunities/export") {
      // One or more reports, comma-separated; several become one combined file.
      const kinds = [...new Set((url.searchParams.get("type") ?? "").split(",").filter(Boolean))];
      if (kinds.length === 0 || kinds.some((k) => !REPORT_KINDS.includes(k as ReportKind))) {
        return json({ error: "Unknown report type" }, 400);
      }
      const { buffer, fileName } = buildReportWorkbook(kinds as ReportKind[], rows, file, filters);
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="${fileName}"`,
          "cache-control": "no-store",
        },
      });
    }
    return json({ error: "Not found" }, 404);
  }

  if (pathname === "/api/demo/geo-markets" && request.method === "GET") {
    return json({ tree: getGeoMarketTree() });
  }

  // ── Endpoints that don't need the Excel workbook ────────────────────────────

  // GET /api/demo/product-verification/:clientId — EC product boxes with their
  // verification state, and whether THIS caller may verify them.
  const pvGet = pathname.match(/^\/api\/demo\/product-verification\/([^/]+)$/);
  if (pvGet && request.method === "GET") {
    const clientId = decodeURIComponent(pvGet[1]);
    return json(getEcProductBoxes(clientId, getCallerEmail(request)));
  }

  // POST /api/demo/product-verification/:clientId — act on one product box.
  //   { action: "verify",  code, productName }  confirm the name + mark verified
  //   { action: "unverify", code }              back to pending
  //   { action: "add",      productName }       add a product that never appeared
  //   { action: "remove",   code }              drop a false positive
  //   { action: "restore",  code }              bring a removed one back
  const pvPost = pathname.match(/^\/api\/demo\/product-verification\/([^/]+)$/);
  if (pvPost && request.method === "POST") {
    try {
      const clientId = decodeURIComponent(pvPost[1]);
      const body = (await request.json()) as {
        action?: "verify" | "unverify" | "add" | "remove" | "restore";
        code?: string;
        productName?: string;
      };
      const email = getCallerEmail(request);
      const name = getCallerName(request);
      const code = String(body.code ?? "").trim();
      const productName = String(body.productName ?? "").trim();

      let next;
      switch (body.action) {
        case "add":
          if (!productName) return json({ error: "productName is required" }, 400);
          next = addProduct(clientId, productName, email);
          break;
        case "remove":
          if (!code) return json({ error: "code is required" }, 400);
          next = removeProduct(clientId, code, email);
          break;
        case "restore":
          if (!code) return json({ error: "code is required" }, 400);
          next = restoreProduct(clientId, code, email);
          break;
        case "unverify":
          if (!code) return json({ error: "code is required" }, 400);
          next = unverifyProduct(clientId, code, email);
          break;
        default:
          if (!code) return json({ error: "code is required" }, 400);
          next = verifyProduct(clientId, code, productName, email, name);
      }

      // null means the policy declined, the product is unknown to this client,
      // or the change was a no-op — a refusal rather than a server fault.
      // "Add" is the case users actually hit, and now only when the product is
      // already visible on the account, so say that instead of implying a
      // permissions problem.
      if (next === null) {
        return json(
          {
            error:
              body.action === "add"
                ? "That product is already on this account."
                : "Not permitted for this product",
          },
          403,
        );
      }
      return json(next);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Update failed" }, 500);
    }
  }

  // GET /api/demo/contract-summary/:clientId — active-contract roll-up for the
  // Client Overview header. Derived from the same rows the Contract page shows.
  const contractSummaryMatch = pathname.match(/^\/api\/demo\/contract-summary\/([^/]+)$/);
  if (contractSummaryMatch && request.method === "GET") {
    return json(getContractSummaryForClient(decodeURIComponent(contractSummaryMatch[1])));
  }

  // GET /api/demo/contracts/:clientId — contracts with manual fields merged in
  const contractsMatch = pathname.match(/^\/api\/demo\/contracts\/([^/]+)$/);
  if (contractsMatch && request.method === "GET") {
    return json(getContractsWithTeam(decodeURIComponent(contractsMatch[1])));
  }

  // POST /api/demo/contracts/:clientId/:workOrder — save one contract's manual fields
  const contractSaveMatch = pathname.match(/^\/api\/demo\/contracts\/([^/]+)\/([^/]+)$/);
  if (contractSaveMatch && request.method === "POST") {
    try {
      const clientId = decodeURIComponent(contractSaveMatch[1]);
      const workOrder = decodeURIComponent(contractSaveMatch[2]);
      const body = (await request.json()) as {
        owner?: string | null;
        projectManager?: string | null;
        deliveryConsultants?: DeliveryConsultant[];
      };
      const savedBy = getCallerEmail(request) || "Unknown";
      if (!callerHasEditAccess(savedBy)) {
        return json({ error: "Edit access is disabled for this account." }, 403);
      }
      return json(saveContractOverride(clientId, workOrder, body, savedBy));
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Save failed" }, 500);
    }
  }

  // GET /api/demo/csp-products — distinct Software/SaaS product names (cached)
  if (pathname === "/api/demo/csp-products" && request.method === "GET") {
    return json({ products: getCspProductNames() });
  }

  // GET /api/demo/insights/:clientId/saved — return cached insights without calling Bob
  const savedInsightsMatch = pathname.match(/^\/api\/demo\/insights\/([^/]+)\/saved$/);
  if (savedInsightsMatch && request.method === "GET") {
    const clientId = decodeURIComponent(savedInsightsMatch[1]);
    // Read through the report store rather than the filesystem directly, so a
    // switch to Box needs no change here. readSavedInsights still owns the
    // schema backfill, so an old file on disk is repaired before it is served.
    const stored = await readReport(clientId);
    const saved = stored ? readSavedInsights(clientId) ?? stored : null;
    if (!saved) return json({ hasSaved: false, clientId });
    return json({ hasSaved: true, ...saved });
  }

  // POST /api/demo/insights/:clientId/save — persist insights sent from client
  const saveInsightsMatch = pathname.match(/^\/api\/demo\/insights\/([^/]+)\/save$/);
  if (saveInsightsMatch && request.method === "POST") {
    try {
      const clientId = decodeURIComponent(saveInsightsMatch[1]);
      const body = await request.json() as {
        hasCaseData?: boolean;
        analysis: unknown;
        aiInsights: unknown;
        generatedBy?: string;
        dateFilter?: unknown;
        dataRange?: unknown;
      };
      const savedAt = new Date().toISOString();
      writeSavedInsights({
        clientId,
        hasCaseData: true,
        savedAt,
        generatedBy: body.generatedBy,
        dateFilter: body.dateFilter as never,
        dataRange: body.dataRange as never,
        analysis: body.analysis as never,
        aiInsights: body.aiInsights as never,
      });
      return json({ ok: true, savedAt: new Date().toISOString() });
    } catch (e) {
      return error(e instanceof Error ? e.message : "Save failed", 500);
    }
  }

  // GET /api/demo/insights/:clientId — generate fresh insights (always calls Bob)
  // Query params: openFrom, openTo, closeFrom, closeTo (all YYYY-MM-DD, all optional)
  // Default behaviour: if hwSwSaas is not specified, default to Software+SaaS.
  //   If the client has no Software/SaaS-tagged cases yet (hwSwSaas backfill pending),
  //   fall back silently to all cases so the page still works.
  const insightsMatch = pathname.match(/^\/api\/demo\/insights\/([^/]+)$/);
  if (insightsMatch && request.method === "GET") {
    try {
      const insightsClientId = decodeURIComponent(insightsMatch[1]);
      const url = new URL(request.url);
      const explicitHwSw = url.searchParams.get("hwSwSaas"); // null = not specified by user
      const dateFilter: CaseDateFilter = {
        openFrom:  url.searchParams.get("openFrom")  || undefined,
        openTo:    url.searchParams.get("openTo")    || undefined,
        closeFrom: url.searchParams.get("closeFrom") || undefined,
        closeTo:   url.searchParams.get("closeTo")   || undefined,
        hwSwSaas:  explicitHwSw || "Software,SaaS", // default: Software + SaaS
      };

      let cases = getCasesForClient(insightsClientId, dateFilter);
      let usedFilter = { ...dateFilter };

      // If no Software cases found AND the user didn't explicitly ask for Software,
      // fall back to all cases ONLY IF the client's cases have blank/empty hwSwSaas
      // (i.e. old data where the field wasn't populated yet).
      if (cases.length === 0 && !explicitHwSw) {
        const allCases = getCasesForClient(insightsClientId, { ...dateFilter, hwSwSaas: undefined });
        const hasBlankHwSw = allCases.some(c => !c.hwSwSaas || c.hwSwSaas.trim() === "");
        if (hasBlankHwSw) {
          usedFilter = { ...dateFilter, hwSwSaas: undefined };
          cases = allCases;
        } else if (allCases.length > 0) {
          // Client exists in CSP but has NO software cases — return a distinct flag
          return json({ hasCaseData: false, clientId: insightsClientId, noSoftwareCases: true });
        }
      }

      if (cases.length === 0) {
        return json({ hasCaseData: false, clientId: insightsClientId, noSoftwareCases: false });
      }

      const hasFilter = !!(usedFilter.openFrom || usedFilter.openTo || usedFilter.closeFrom || usedFilter.closeTo || usedFilter.hwSwSaas);

      // Compute actual date range of the cases used (for the banner)
      const openDates = cases.map(c => c.openDate).filter(Boolean).sort();
      const dataRange: DataRange = {
        earliest: openDates[0] ?? "",
        latest: openDates[openDates.length - 1] ?? "",
        totalCases: cases.length,
      };
      const ecProducts = getEcProductsForClient(insightsClientId);
      const clientName = cases[0]?.customerName ?? insightsClientId;
      const customerId = getClientCmrNumber(insightsClientId);
      const ecEngagements = getEcEngagementsForClient(insightsClientId);
      const analysis = analyseCases(cases, clientName, ecProducts, customerId, ecEngagements);
      const aiInsights = await generateAllInsights(analysis);
      return json({
        hasCaseData: true,
        clientId: insightsClientId,
        analysis,
        aiInsights,
        dateFilter: hasFilter ? usedFilter : null,
        dataRange,
      });
    } catch (e) {
      console.error("[insights-api]", e);
      return error(e instanceof Error ? e.message : "Insights failed", 500);
    }
  }

  // POST /api/demo/offerings/by-product-names — Solution Builder Subscription offerings lookup
  if (pathname === "/api/demo/offerings/by-product-names" && request.method === "POST") {
    try {
      const body = (await request.json()) as { productNames?: unknown };
      const productNames = Array.isArray(body.productNames)
        ? body.productNames.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        : [];
      if (productNames.length === 0) return error("No product names provided");
      const rows = await getSubscriptionOfferingsForProducts(productNames);
      return json({ rows });
    } catch (e) {
      console.error("[offerings-api]", e);
      const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : "";
      const message = e instanceof Error ? `${e.message}${cause}` : "Failed to fetch offerings";
      return error(message, 502);
    }
  }

  // ── All endpoints below require the Excel workbook ───────────────────────────
  if (!isExcelBackendAvailable()) {
    return error(
      "Excel backend unavailable. Set CONTROL_PLANE_DATA_XLSX to a writable .xlsx path on the server.",
      503
    );
  }

  try {
    if (pathname === "/api/demo/workbook" && request.method === "GET") {
      const payload = readWorkbookPayload();

      // The raw workbook carries every customer on every sheet, so it is
      // filtered to the caller's accessible clients before leaving the server.
      // Without this it is a complete bypass of geo/market access control —
      // the same data the client list refuses, one endpoint over.
      //
      // A HEAD request is used elsewhere purely as an availability probe and
      // carries no body, so it is unaffected.
      const wbAccess = resolveAccess(getCallerEmail(request));
      if (wbAccess.unrestricted) return json(payload);

      const allowedIds = new Set(
        filterAccessibleClients(
          wbAccess,
          ((payload.ClientOverview ?? []) as Record<string, unknown>[]).map((r) => ({
            clientId: String(r.client_id ?? "").trim(),
          })),
        ).map((c) => c.clientId),
      );

      // Every sheet in this workbook is keyed by client_id; rows for other
      // clients are dropped, and sheets without the column are left alone.
      const scoped: Record<string, unknown[]> = {};
      for (const [sheet, rows] of Object.entries(payload)) {
        if (!Array.isArray(rows)) {
          scoped[sheet] = rows as unknown[];
          continue;
        }
        const typed = rows as Record<string, unknown>[];
        scoped[sheet] =
          typed.length > 0 && Object.prototype.hasOwnProperty.call(typed[0], "client_id")
            ? typed.filter((r) => allowedIds.has(String(r.client_id ?? "").trim()))
            : typed;
      }
      return json(scoped);
    }

    if (pathname === "/api/demo/clients" && request.method === "GET") {
      const payload = readWorkbookPayload();
      // A holder page whose contracts all moved to end customers is hidden.
      const clients = normaliseClientData(payload, "excel").filter((c) => !isHiddenHolderPage(c.cmrNumber));

      // Geo and market come from Clarizen, not the workbook.
      //
      // The workbook's own columns are unreliable — market is populated on
      // roughly 1% of accounts and onboarding writes both as empty — so they
      // are overwritten here with the values access control itself uses. That
      // keeps what the user sees consistent with what they are allowed to see,
      // and makes the Global View market filter work for the first time.
      const geoIndex = getClientGeoMarketIndex();
      const enriched = clients.map((c) => {
        const gm = geoIndex[c.clientId];
        if (!gm) return c;
        // No fallback to the workbook's own geo/market on purpose.
        //
        // Access control decides using the Clarizen index; if display fell back
        // to the workbook when Clarizen has nothing, a customer would show as
        // "EMEA" while every EMEA user was correctly denied it — the screen and
        // the access rule would contradict each other. Showing blank is honest:
        // the customer genuinely has no geography we can act on.
        return { ...c, geo: gm.geo, market: gm.market };
      });

      // Filtered server-side. The UI filters too, for responsiveness, but this
      // is the boundary that actually holds — a caller hitting the endpoint
      // directly gets only what they are entitled to.
      const access = resolveAccess(getCallerEmail(request));
      const accessible = filterAccessibleClients(access, enriched);

      // Same rule as Product Overview's own product count: a hand-maintained
      // productPortfolio wins when the client has one, otherwise it's a
      // Clarizen-sourced client and the count comes from the live EC product
      // list (which already reflects anything added, removed or restored
      // there). Computed only for the clients this caller can see.
      const withProductCount = accessible.map((c) => ({
        ...c,
        productCount:
          c.productPortfolio.length > 0
            ? c.productPortfolio.length
            : countActiveEcProducts(c.clientId),
      }));

      // renewalDate/daysToRenewal come off ClientOverview's own renewal_date
      // column, same as geo/market above — and it has the same problem: it is
      // populated for the hand-maintained sample clients but blank for the
      // large majority of real, Clarizen-sourced ones (~90% of the book).
      // Those clients are not actually missing a renewal date — the Contract
      // tab already shows one, sourced from Clarizen's own work-order end
      // dates (getContractSummaryForClient, the same function that tab uses).
      // Falling back to that here is what makes "Renewals Due" agree with
      // what each client's own Contract tab already says, instead of only
      // counting the ~10% of clients whose workbook column happens to be
      // filled in.
      const withRenewals = withProductCount.map((c) => {
        if (c.renewalDate) return c;
        const { earliestRenewal } = getContractSummaryForClient(c.clientId);
        if (!earliestRenewal) return c;
        const [y, m, d] = earliestRenewal.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        return {
          ...c,
          renewalDate: dt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }),
          daysToRenewal: Math.max(0, Math.ceil((dt.getTime() - Date.now()) / 86400000)),
        };
      });

      return json({
        clients: withRenewals,
        updatedAt: new Date().toISOString(),
      });
    }

    const configClientId = clientIdFromPath(pathname, "/kpi/config");
    if (configClientId && pathname.endsWith("/kpi/config")) {
      if (request.method === "PUT") {
        const body = (await request.json()) as {
          tier?: Client["tier"];
          selectedRotationalIds?: string[];
          kpiConfig?: ClientKPIConfig[];
          updatedByName?: string;
          updatedByEmail?: string;
        };
        const tier = body.tier ?? "Bronze";
        const selectedRotationalIds = body.selectedRotationalIds ?? [];
        const kpiConfig = body.kpiConfig ?? [];
        const payload = saveClientKpiConfigToWorkbook(
          configClientId,
          tier,
          selectedRotationalIds,
          kpiConfig,
          body.updatedByName ?? "Delivery TAM",
          body.updatedByEmail ?? ""
        );
        const clients = normaliseClientData(payload, "excel");
        const client = clients.find((c) => c.clientId === configClientId);
        return json({ ok: true, client });
      }
      return error("Method not allowed", 405);
    }

    const scoresClientId = clientIdFromPath(pathname, "/kpi/scores");
    if (scoresClientId && pathname.endsWith("/kpi/scores")) {
      if (request.method === "POST") {
        const body = (await request.json()) as {
          scores?: { kpiId: string; value: number; notes?: string; date: string }[];
          updatedByName?: string;
          updatedByEmail?: string;
        };
        const scores = body.scores ?? [];
        if (!scores.length) return error("No scores provided");
        const payload = appendClientKpiScoresToWorkbook(
          scoresClientId,
          scores,
          body.updatedByName ?? "Delivery TAM",
          body.updatedByEmail ?? ""
        );
        const clients = normaliseClientData(payload, "excel");
        const client = clients.find((c) => c.clientId === scoresClientId);
        return json({ ok: true, client });
      }
      return error("Method not allowed", 405);
    }

    // GET  /api/demo/clients/:clientId/executive-summary — computed, read-only
    // PUT  is retired: the summary is generated from the saved report and is no
    //      longer user-editable. Kept as an explicit 405 rather than deleted so
    //      an older cached bundle gets a clear answer instead of a 404.
    const execSummaryClientId = clientIdFromPath(pathname, "/executive-summary");
    if (execSummaryClientId && pathname.endsWith("/executive-summary")) {
      if (request.method === "GET") {
        return json(await buildExecutiveSummary(execSummaryClientId));
      }
      if (request.method === "PUT") {
        return error(
          "The Executive Account Summary is generated and read-only. Download the report to edit your own copy.",
          405,
        );
      }
      return error("Method not allowed", 405);
    }

    // POST /api/demo/clients/:clientId/products/:productId/adoption/scores
    const adoptionMatch = pathname.match(
      /^\/api\/demo\/clients\/([^/]+)\/products\/([^/]+)\/adoption\/scores$/
    );
    if (adoptionMatch) {
      const adoptionClientId = decodeURIComponent(adoptionMatch[1]);
      const adoptionProductId = decodeURIComponent(adoptionMatch[2]);
      if (request.method === "POST") {
        const body = (await request.json()) as {
          score?: number;
          notes?: string;
          date?: string;
          updatedByName?: string;
          updatedByEmail?: string;
        };
        const score = body.score;
        if (score == null || typeof score !== "number") {
          return error("'score' (number) is required");
        }
        const date = body.date ?? new Date().toISOString().split("T")[0];
        const payload = appendProductAdoptionScoreToWorkbook(
          adoptionClientId,
          adoptionProductId,
          score,
          body.notes,
          date,
          body.updatedByName ?? "Delivery TAM",
          body.updatedByEmail ?? ""
        );
        const clients = normaliseClientData(payload, "excel");
        const client = clients.find((c) => c.clientId === adoptionClientId);
        return json({ ok: true, client });
      }
      return error("Method not allowed", 405);
    }

    const singleClientMatch = pathname.match(/^\/api\/demo\/clients\/([^/]+)$/);
    const singleClientId = singleClientMatch?.[1]
      ? decodeURIComponent(singleClientMatch[1])
      : null;
    if (singleClientId) {
      if (request.method === "GET") {
        const payload = readWorkbookPayload();
        const clients = normaliseClientData(payload, "excel");
        const client = clients.find((c) => c.clientId === singleClientId);
        if (!client || isHiddenHolderPage(client.cmrNumber)) return error("Client not found", 404);
        return json(client);
      }
      return error("Method not allowed", 405);
    }

    // GET /api/demo/salesforce/cases
    // Returns all Salesforce case insights mapped by CMR number
    if (pathname === "/api/demo/salesforce/cases" && request.method === "GET") {
      const salesforceSheets = readSalesforceCaseReports();
      const caseInsightsMap = processSalesforceCases(salesforceSheets);
      
      // Convert Map to object for JSON serialization
      const caseInsights: Record<string, any> = {};
      caseInsightsMap.forEach((value, key) => {
        caseInsights[key] = value;
      });
      
      return json({
        caseInsights,
        updatedAt: new Date().toISOString(),
        totalClients: caseInsightsMap.size
      });
    }

    // GET /api/demo/salesforce/cases/:cmrNumber
    // Returns Salesforce case insights for a specific client by CMR number
    const salesforceCaseMatch = pathname.match(/^\/api\/demo\/salesforce\/cases\/([^/]+)$/);
    if (salesforceCaseMatch && request.method === "GET") {
      const cmrNumber = decodeURIComponent(salesforceCaseMatch[1]);
      const salesforceSheets = readSalesforceCaseReports();
      const caseInsightsMap = processSalesforceCases(salesforceSheets);
      const insights = getClientCaseInsights(cmrNumber, caseInsightsMap);
      
      if (!insights) {
        return json({
          hasSalesforceData: false,
          cmrNumber,
          message: "No Salesforce case data found for this CMR number"
        });
      }
      
      return json(insights);
    }

    // GET /api/demo/product-health/:clientId/:productName
    // Returns product health KPI data for a specific client and product
    const productHealthMatch = pathname.match(/^\/api\/demo\/product-health\/([^/]+)\/([^/]+)$/);
    if (productHealthMatch && request.method === "GET") {
      const clientId = decodeURIComponent(productHealthMatch[1]);
      const productName = decodeURIComponent(productHealthMatch[2]);
      
      try {
        const healthKpis = getProductHealthKpisSync(clientId, productName);
        return json(healthKpis);
      } catch (error) {
        console.error('[product-health-api]', error);
        return json([], 200); // Return empty array instead of error to avoid breaking UI
      }
    }

    return error("Not found", 404);
  } catch (e) {
    console.error("[demo-api]", e);
    return error(e instanceof Error ? e.message : "Excel API failed", 500);
  }
}
