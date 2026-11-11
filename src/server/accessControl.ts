/**
 * Access Control
 * ──────────────
 * THE single place that decides whether a user may see a customer.
 *
 * Every consumer — the client list, a single client fetch, the per-client API
 * routes, the route guard — resolves through {@link canAccessClient}. There is
 * deliberately no second implementation, because two implementations of an
 * access rule is how one of them ends up wrong.
 *
 * ── The rule ──
 * A user may see a customer when ALL of the following hold:
 *
 *   1. ADMIN bypass — admins see everything, unchanged from before.
 *   2. GEOGRAPHY — the user's geo list is empty (meaning all), or contains the
 *      customer's geo.
 *   3. MARKET — the user has no market restriction for that geo (meaning all
 *      markets in it), or the restriction contains the customer's market.
 *   4. ASSIGNED CLIENTS — the user's clientIds list is empty (meaning all), or
 *      contains this client. This is the pre-existing rule and is unchanged.
 *
 * Geo/market and assigned-clients are ANDed, not ORed. A user assigned to three
 * clients in EMEA and restricted to APAC sees none of them. That is the safe
 * reading of two independent restrictions, and it means adding geo/market can
 * only ever narrow what someone already sees — never widen it.
 *
 * ── Deny by default ──
 * A customer whose geo cannot be resolved from Clarizen belongs to no
 * geography, so no geo-restricted user matches it and only admins see it.
 * Unclassified data is withheld rather than shown, which is the correct default
 * for an access-control boundary. {@link getUnclassifiedClients} exists so
 * those accounts remain visible to admins and can be fixed at source.
 */
import { getClientGeoMarketIndex, type GeoMarket } from "./geoMarketService";
import { isAdminEmail, readEntitlements, type UserEntitlement } from "./userEntitlements";

/**
 * The caller's effective access, resolved once per request.
 * `unrestricted` short-circuits every check for admins.
 */
export interface AccessContext {
  email: string;
  unrestricted: boolean;
  entitlement: UserEntitlement | null;
}

/** Resolve who is asking and what they are allowed to see. */
export function resolveAccess(callerEmail: string): AccessContext {
  const email = callerEmail.trim().toLowerCase();
  if (!email) return { email: "", unrestricted: false, entitlement: null };
  if (isAdminEmail(email)) return { email, unrestricted: true, entitlement: null };
  return {
    email,
    unrestricted: false,
    entitlement: readEntitlements().find((e) => e.email === email) ?? null,
  };
}

/**
 * Whether the geo/market restriction admits this customer.
 *
 * Empty geos means every geography. A geo present with an empty market list
 * means every market within it — which is how "EMEA → All markets" is stored.
 */
export function geoMarketAllows(entitlement: UserEntitlement, gm: GeoMarket): boolean {
  const geos = entitlement.geos ?? [];
  if (geos.length === 0) return true;

  // An unclassified customer matches no geography, so a geo-restricted user
  // never sees it. Deliberate: unknown classification is withheld.
  if (!gm.geo) return false;
  if (!geos.includes(gm.geo)) return false;

  // Markets are keyed BY GEO rather than held as one flat list, so a market
  // name appearing under two geographies in future data cannot grant access to
  // the wrong one. No such overlap exists today; this costs nothing and removes
  // the failure mode entirely.
  const allowed = entitlement.markets?.[gm.geo] ?? [];
  if (allowed.length === 0) return true;
  return gm.market !== "" && allowed.includes(gm.market);
}

/** Whether the assigned-clients restriction admits this customer. Pre-existing rule. */
export function clientIdAllows(entitlement: UserEntitlement, clientId: string): boolean {
  const ids = entitlement.clientIds ?? [];
  return ids.length === 0 || ids.includes(clientId);
}

/**
 * The access decision. Every caller goes through here.
 *
 * `gm` is optional so a caller that already holds the index can avoid a second
 * lookup per client when filtering a list.
 */
export function canAccessClient(ctx: AccessContext, clientId: string, gm?: GeoMarket): boolean {
  if (ctx.unrestricted) return true;
  // No entitlement record means no grant. A signed-in user who has never been
  // given access sees nothing rather than everything.
  if (!ctx.entitlement) return false;
  const where = gm ?? getClientGeoMarketIndex()[clientId] ?? { geo: "", market: "" };
  return clientIdAllows(ctx.entitlement, clientId) && geoMarketAllows(ctx.entitlement, where);
}

/** Filter a list of clients down to what the caller may see. One index read. */
export function filterAccessibleClients<T extends { clientId: string }>(
  ctx: AccessContext,
  clients: T[],
): T[] {
  if (ctx.unrestricted) return clients;
  if (!ctx.entitlement) return [];
  const index = getClientGeoMarketIndex();
  return clients.filter((c) =>
    canAccessClient(ctx, c.clientId, index[c.clientId] ?? { geo: "", market: "" }),
  );
}

/** Client ids the caller may see, for callers that work in ids rather than objects. */
export function accessibleClientIds(ctx: AccessContext): string[] | "all" {
  if (ctx.unrestricted) return "all";
  if (!ctx.entitlement) return [];
  const index = getClientGeoMarketIndex();
  return Object.keys(index).filter((id) => canAccessClient(ctx, id, index[id]));
}
