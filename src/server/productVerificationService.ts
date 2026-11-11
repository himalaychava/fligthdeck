/**
 * Product Verification Service
 * ────────────────────────────
 * Backs the Active Product Integration boxes on the Product Overview page.
 *
 * Three things live here:
 *
 *  1. WHICH BOXES EXIST. One per EC product on the account, from the existing
 *     Clarizen → OCC mapping, plus any product added by hand, minus any that
 *     was removed as a false positive.
 *
 *  2. WHAT EACH IS CALLED. The catalog name is a starting point, not the last
 *     word — someone can correct it, and the correction sticks.
 *
 *  3. WHETHER IT HAS BEEN REVIEWED. Confirming the name IS the act of
 *     verifying: a box is verified once a person has looked at it and said the
 *     name is right.
 *
 * ── Identity ──
 * Everything is keyed by Clarizen's UTL30 code, never by the product name.
 * Names change — a person corrects one, or an OCC catalog upload renames it —
 * and anything keyed to a name loses its verification and its adoption scores
 * the moment that happens. The code is stable and is 1:1 with names within a
 * customer, so the code is the identity and the name is only a label.
 *
 * Manually added products have no Clarizen code, so they are given a synthetic
 * one (`man-…`) that behaves identically everywhere else.
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath, getJsonMirrorPath } from "./demoDataPaths";
import { getEcProductEntriesForClient } from "./caseDataReader";
import { isExcelBackendAvailable, readWorkbookPayload } from "./excelWorkbook";
import { callerHasEditAccess } from "./userEntitlements";

export type VerificationStatus = "pending" | "verified";

/** Per-product state, keyed by product code. */
export interface ProductState {
  /** Corrected name. null means "use the catalog name". */
  displayName: string | null;
  status: VerificationStatus;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  /** Removed as a false positive. Kept, not deleted, so it can be restored. */
  removed: boolean;
}

/** A product somebody added by hand because it never appeared automatically. */
export interface ManualProduct {
  code: string;
  name: string;
  addedBy: string;
  addedAt: string;
}

/** One recorded Product Adoption checkpoint. */
export interface AdoptionPoint {
  date: string;
  value: number;
  notes?: string;
  recordedBy?: string;
}

/** One box as the UI consumes it. */
export interface EcProductBox {
  /** Stable identity — UTL30 code, or a synthetic one for a manual product. */
  code: string;
  /** What to display: the correction if there is one, else the catalog name. */
  productName: string;
  /** The catalog's own name, so the UI can show what a correction replaced. */
  sourceName: string;
  /** True when the OCC catalog could not resolve this code to a name. */
  unresolved: boolean;
  /** True when this product was added by hand rather than derived. */
  manual: boolean;
  status: VerificationStatus;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  canVerify: boolean;
  /** Storage id for this product's adoption scores. Derived from the code. */
  productId: string;
  adoptionHistory: AdoptionPoint[];
}

/** A removed product, offered back for restoring. */
export interface RemovedProduct {
  code: string;
  productName: string;
  manual: boolean;
}

interface StoreFile {
  clientId: string;
  /** product code → state */
  products: Record<string, ProductState>;
  manual: ManualProduct[];
}

const DEFAULT_STATE: ProductState = {
  displayName: null,
  status: "pending",
  verifiedBy: null,
  verifiedByName: null,
  verifiedAt: null,
  removed: false,
};

// ─── Policy seam ──────────────────────────────────────────────────────────────

/**
 * Whether a caller may edit, verify, add or remove products on this account.
 *
 * Deliberately the ONLY place the rule is expressed, and the answer travels to
 * the UI as `canVerify` rather than being re-derived there — so tightening it
 * changes this function and nothing else.
 *
 * Today: any signed-in user who can reach the account, AND whose entitlement
 * grants edit access — see callerHasEditAccess, which is where the Delivery
 * "Edit Access" admin toggle actually takes effect. The intended next step is
 * restricting it further to the delivery consultants named on the account's
 * contracts, which is why clientId is already threaded through unused.
 */
export function canVerifyProduct(input: { callerEmail: string; clientId: string }): boolean {
  return input.callerEmail.trim() !== "" && callerHasEditAccess(input.callerEmail);
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function storeDir(): string {
  return path.join(path.dirname(getExcelFilePath()), "product_verifications");
}

function storePath(clientId: string): string {
  const safe = clientId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(storeDir(), `${safe}.json`);
}

function readStore(clientId: string): StoreFile {
  try {
    const p = storePath(clientId);
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<StoreFile>;
      return {
        clientId,
        products: (raw.products as Record<string, ProductState>) ?? {},
        manual: Array.isArray(raw.manual) ? raw.manual : [],
      };
    }
  } catch {
    /* an unreadable file degrades to "nothing recorded" rather than failing the page */
  }
  return { clientId, products: {}, manual: [] };
}

function writeStore(file: StoreFile): void {
  fs.mkdirSync(storeDir(), { recursive: true });
  fs.writeFileSync(storePath(file.clientId), JSON.stringify(file, null, 2), "utf-8");
}

/** Storage id for a product's adoption scores. Keyed by code so a rename keeps them. */
export function ecProductId(code: string): string {
  return `ec-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function makeManualCode(): string {
  return `man-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Product Adoption checkpoints for this client, grouped by product id.
 *
 * Scores recorded against these products land in the workbook's
 * ProductAdoptionScores sheet, but nothing joins them back — the sheet that
 * normally supplies products has no row for an EC product. Reading them here
 * is what makes a saved score reappear.
 */
function readAdoptionByProduct(clientId: string): Map<string, AdoptionPoint[]> {
  const out = new Map<string, AdoptionPoint[]>();
  try {
    let rows: Record<string, unknown>[] = [];
    if (isExcelBackendAvailable()) {
      rows = readWorkbookPayload().ProductAdoptionScores ?? [];
    } else {
      const mirror = getJsonMirrorPath();
      if (fs.existsSync(mirror)) {
        const parsed = JSON.parse(fs.readFileSync(mirror, "utf-8")) as Record<string, unknown[]>;
        rows = (parsed.ProductAdoptionScores ?? []) as Record<string, unknown>[];
      }
    }
    for (const r of rows) {
      if (String(r.client_id ?? "").trim() !== clientId) continue;
      const pid = String(r.product_id ?? "").trim();
      if (!pid) continue;
      const value = Number(r.score_value ?? r.value);
      if (!Number.isFinite(value)) continue;
      const point: AdoptionPoint = {
        date: String(r.checkpoint_date ?? r.date ?? ""),
        value,
        notes: String(r.notes ?? "") || undefined,
        recordedBy: String(r.updated_by ?? r.recorded_by ?? "") || undefined,
      };
      const list = out.get(pid);
      if (list) list.push(point);
      else out.set(pid, [point]);
    }
  } catch {
    /* no adoption data is a valid state — the box simply shows none */
  }
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ProductBoxes {
  clientId: string;
  products: EcProductBox[];
  removed: RemovedProduct[];
  canVerify: boolean;
}

/**
 * How many EC products are currently active for this client — same set
 * `getEcProductBoxes` renders, minus anything removed, but without also
 * building adoption history or verification metadata for each one.
 *
 * Used to sum a "products managed" total across every client in one request;
 * `getEcProductBoxes` reads the whole ProductAdoptionScores sheet per call via
 * `readAdoptionByProduct`, which is fine for one client's page but far too
 * costly to repeat hundreds of times over.
 */
export function countActiveEcProducts(clientId: string): number {
  const file = readStore(clientId);
  const codes = new Set<string>([
    ...getEcProductEntriesForClient(clientId).map((e) => e.code),
    ...file.manual.map((m) => m.code),
  ]);
  let count = 0;
  for (const code of codes) {
    if (!(file.products[code]?.removed)) count++;
  }
  return count;
}

/**
 * The boxes to render: derived EC products plus manual additions, with removed
 * ones held back and offered separately for restoring.
 */
export function getEcProductBoxes(clientId: string, callerEmail: string): ProductBoxes {
  const file = readStore(clientId);
  const adoption = readAdoptionByProduct(clientId);
  const allowed = canVerifyProduct({ callerEmail, clientId });

  const derived = getEcProductEntriesForClient(clientId).map((e) => ({
    code: e.code,
    sourceName: e.name,
    unresolved: !e.resolved,
    manual: false,
  }));
  const manual = file.manual.map((m) => ({
    code: m.code,
    sourceName: m.name,
    unresolved: false,
    manual: true,
  }));

  const products: EcProductBox[] = [];
  const removed: RemovedProduct[] = [];

  for (const entry of [...derived, ...manual]) {
    const st = file.products[entry.code] ?? DEFAULT_STATE;
    const productName = st.displayName ?? entry.sourceName;
    if (st.removed) {
      removed.push({ code: entry.code, productName, manual: entry.manual });
      continue;
    }
    const productId = ecProductId(entry.code);
    products.push({
      code: entry.code,
      productName,
      sourceName: entry.sourceName,
      unresolved: entry.unresolved,
      manual: entry.manual,
      status: st.status,
      verifiedBy: st.verifiedBy,
      verifiedByName: st.verifiedByName,
      verifiedAt: st.verifiedAt,
      canVerify: allowed,
      productId,
      adoptionHistory: adoption.get(productId) ?? [],
    });
  }

  return { clientId, products, removed, canVerify: allowed };
}

/** Apply a change under the access rule, then hand back the refreshed boxes. */
function mutate(
  clientId: string,
  callerEmail: string,
  apply: (file: StoreFile) => boolean,
): ProductBoxes | null {
  if (!canVerifyProduct({ callerEmail, clientId })) return null;
  const file = readStore(clientId);
  if (!apply(file)) return null;
  writeStore(file);
  return getEcProductBoxes(clientId, callerEmail);
}

/** Codes that exist for this client — derived or manual. */
function knownCodes(clientId: string, file: StoreFile): Set<string> {
  return new Set([
    ...getEcProductEntriesForClient(clientId).map((e) => e.code),
    ...file.manual.map((m) => m.code),
  ]);
}

/**
 * Confirm a product: save its name and mark it verified.
 *
 * Verifying IS confirming the name, so the two happen together. A blank name
 * clears any correction and falls back to the catalog name rather than leaving
 * the product nameless.
 */
export function verifyProduct(
  clientId: string,
  code: string,
  displayName: string,
  callerEmail: string,
  callerName: string,
): ProductBoxes | null {
  return mutate(clientId, callerEmail, (file) => {
    if (!knownCodes(clientId, file).has(code)) return false;
    const prev = file.products[code] ?? DEFAULT_STATE;
    const trimmed = displayName.trim();
    file.products[code] = {
      ...prev,
      displayName: trimmed === "" ? null : trimmed,
      status: "verified",
      verifiedBy: callerEmail.trim() || null,
      verifiedByName: callerName.trim() || callerEmail.trim() || null,
      verifiedAt: new Date().toISOString(),
      removed: false,
    };
    return true;
  });
}

/** Return a product to pending, keeping any name correction. */
export function unverifyProduct(
  clientId: string,
  code: string,
  callerEmail: string,
): ProductBoxes | null {
  return mutate(clientId, callerEmail, (file) => {
    const prev = file.products[code] ?? DEFAULT_STATE;
    file.products[code] = {
      ...prev,
      status: "pending",
      verifiedBy: null,
      verifiedByName: null,
      verifiedAt: null,
    };
    return true;
  });
}

/** Add a product that never appeared automatically. */
export function addProduct(
  clientId: string,
  name: string,
  callerEmail: string,
): ProductBoxes | null {
  return mutate(clientId, callerEmail, (file) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const wanted = trimmed.toLowerCase();

    // Every product known to this account, with its code, display name and
    // whether it is currently removed. Built once so the two checks below
    // cannot disagree about what "already here" means.
    const known = [
      ...getEcProductEntriesForClient(clientId).map((e) => ({
        code: e.code,
        shown: file.products[e.code]?.displayName ?? e.name,
      })),
      ...file.manual.map((m) => ({
        code: m.code,
        shown: file.products[m.code]?.displayName ?? m.name,
      })),
    ].map((p) => ({ ...p, removed: file.products[p.code]?.removed === true }));

    // Re-adding something that was removed RESTORES it rather than being
    // refused. The removed product keeps its code, so restoring preserves its
    // verification state and any adoption scores recorded against it — adding
    // a fresh manual entry under a new code would orphan both.
    const removedMatch = known.find((p) => p.removed && p.shown.toLowerCase() === wanted);
    if (removedMatch) {
      const prev = file.products[removedMatch.code];
      file.products[removedMatch.code] = { ...(prev ?? DEFAULT_STATE), removed: false };
      return true;
    }

    // A genuine duplicate — the product is already on the account and visible.
    if (known.some((p) => !p.removed && p.shown.toLowerCase() === wanted)) return false;

    file.manual.push({
      code: makeManualCode(),
      name: trimmed,
      addedBy: callerEmail,
      addedAt: new Date().toISOString(),
    });
    return true;
  });
}

/**
 * Remove a wrongly identified product.
 *
 * Marked removed rather than deleted, so a derived product stays removed when
 * Clarizen reports it again on the next upload — otherwise a false positive
 * would come back after every upload, which is the whole problem being solved.
 */
export function removeProduct(
  clientId: string,
  code: string,
  callerEmail: string,
): ProductBoxes | null {
  return mutate(clientId, callerEmail, (file) => {
    const prev = file.products[code] ?? DEFAULT_STATE;
    file.products[code] = { ...prev, removed: true };
    return true;
  });
}

/** Bring a removed product back. */
export function restoreProduct(
  clientId: string,
  code: string,
  callerEmail: string,
): ProductBoxes | null {
  return mutate(clientId, callerEmail, (file) => {
    const prev = file.products[code];
    if (!prev) return false;
    file.products[code] = { ...prev, removed: false };
    return true;
  });
}
