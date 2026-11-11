/**
 * User entitlements store — persisted as JSON on disk.
 * Stored at {CONTROL_PLANE_DATA_DIR}/user_entitlements.json
 * Schema: { users: UserEntitlement[] }
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";

export type UserRole = "management" | "delivery" | "sales";

export interface UserEntitlement {
  email: string;       // lowercase
  role: UserRole;
  clientIds: string[]; // empty = all (used for management)
  /**
   * Geographies this user may see. Empty means ALL geographies.
   * Values are whatever Clarizen contains — never a hardcoded list.
   */
  geos: string[];
  /**
   * Allowed markets, keyed BY GEOGRAPHY. A geo absent from this map, or mapped
   * to an empty array, means every market within that geo.
   *
   * Keyed by geo rather than held flat so that if a market name ever appears
   * under two geographies in future Clarizen data, access to one cannot leak
   * into the other.
   */
  markets: Record<string, string[]>;
  /**
   * Whether this user may use edit controls (Contract page edits, Product
   * Overview verify/edit/add/remove, KPI and adoption score entry) — separate
   * from whether they can SEE an account, which geo/market/clientIds already
   * decide. Currently only meaningful for role "delivery"; other roles are
   * unaffected regardless of this value, so it costs nothing to store it for
   * every role now and start enforcing it for another role later.
   *
   * Records written before this field existed have none. They normalise to
   * `true` — the same "upgrading must never silently revoke access" rule
   * already applied to geo/market above.
   */
  editAccess: boolean;
}

function getEntitlementsPath(): string {
  const dir = path.dirname(getExcelFilePath());
  return path.join(dir, "user_entitlements.json");
}

/**
 * Fill in fields added after a record was written.
 *
 * Records predating geo/market have neither field. They normalise to "all
 * geographies", which preserves exactly the access they had before this
 * feature existed — upgrading must never silently revoke someone's access.
 */
function normalise(u: Partial<UserEntitlement>): UserEntitlement {
  return {
    email: String(u.email ?? "").toLowerCase().trim(),
    role: (u.role ?? "delivery") as UserRole,
    clientIds: Array.isArray(u.clientIds) ? u.clientIds : [],
    geos: Array.isArray(u.geos) ? u.geos : [],
    markets:
      u.markets && typeof u.markets === "object" && !Array.isArray(u.markets)
        ? (u.markets as Record<string, string[]>)
        : {},
    editAccess: u.editAccess !== false,
  };
}

export function readEntitlements(): UserEntitlement[] {
  try {
    const p = getEntitlementsPath();
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as { users?: Partial<UserEntitlement>[] };
    return Array.isArray(parsed.users) ? parsed.users.map(normalise) : [];
  } catch {
    return [];
  }
}

function writeEntitlements(users: UserEntitlement[]): void {
  const p = getEntitlementsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ users }, null, 2), "utf-8");
}

export function upsertEntitlement(entry: UserEntitlement): void {
  const users = readEntitlements();
  const email = entry.email.toLowerCase().trim();
  const idx = users.findIndex(u => u.email === email);
  const normalised: UserEntitlement = {
    ...normalise(entry),
    email,
    clientIds: entry.role === "management" ? [] : (entry.clientIds ?? []),
  };
  // Drop market restrictions for geographies the user no longer has, so a
  // stale entry cannot grant access if that geo is granted again later.
  if (normalised.geos.length > 0) {
    normalised.markets = Object.fromEntries(
      Object.entries(normalised.markets).filter(([geo]) => normalised.geos.includes(geo)),
    );
  } else {
    normalised.markets = {};
  }
  if (idx >= 0) {
    users[idx] = normalised;
  } else {
    users.push(normalised);
  }
  writeEntitlements(users);
}

export function removeEntitlement(email: string): void {
  const users = readEntitlements().filter(
    u => u.email !== email.toLowerCase().trim()
  );
  writeEntitlements(users);
}

export function getEntitlement(email: string): UserEntitlement | null {
  return readEntitlements().find(
    u => u.email === email.toLowerCase().trim()
  ) ?? null;
}

/** Returns the list of admin emails from the ADMIN_EMAILS env var */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.toLowerCase().trim());
}

/**
 * Whether a caller may use edit controls anywhere in the app.
 *
 * THE single place this rule is expressed — every server-side edit endpoint
 * (product verification, contract overrides, …) calls this rather than
 * re-deriving it, so tightening or extending the rule changes this function
 * alone. Mirrored client-side for UI purposes in DemoDataProvider, but the
 * server is always the one that decides.
 *
 * Only role "delivery" is gated today, per the current requirement. Everyone
 * else — admins, management, sales, and any caller with no entitlement record
 * at all (access control elsewhere already decided whether they can reach the
 * client) — is unaffected and always returns true.
 */
export function callerHasEditAccess(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  if (isAdminEmail(trimmed)) return true;
  const entry = getEntitlement(trimmed);
  if (!entry) return true;
  if (entry.role !== "delivery") return true;
  return entry.editAccess;
}
