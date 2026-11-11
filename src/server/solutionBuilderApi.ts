/**
 * Client for IBM's Solution Builder API (Expert Labs).
 * Used by the Insights page "Offerings" section to look up Subscription-tagged
 * offerings for a client's top expansion-opportunity products.
 *
 * All config is server-runtime env (no rebuild needed):
 *   SOLUTION_BUILDER_API_BASE_URL
 *   SOLUTION_BUILDER_API_KEY                 (sent as the x-api-key header)
 *   SOLUTION_BUILDER_UI_OFFERING_URL_TEMPLATE  optional — set once the Solution
 *     Builder web UI exposes a per-offering "view details" route. Must contain
 *     the literal placeholder "{offeringId}", e.g.
 *     https://expert-labs-solution-tool.dal.app.cirrus.ibm.com/offerings/{offeringId}
 */

const API_BASE_URL = process.env.SOLUTION_BUILDER_API_BASE_URL || "";
const API_KEY = process.env.SOLUTION_BUILDER_API_KEY || "";
const UI_OFFERING_URL_TEMPLATE = process.env.SOLUTION_BUILDER_UI_OFFERING_URL_TEMPLATE || "";

// Reference data (product catalog, offering catalog) is shared across all
// clients/users and changes rarely — cache it in memory instead of re-fetching
// on every Insights page view.
const CACHE_TTL_MS = 15 * 60 * 1000;

interface SbProduct {
  product_id: string;
  product_name: string;
  brand_id: string;
}

interface SbCatalogItem {
  offering_id: string;
  offering_name: string;
  brand: string | null;
  offering_tags: string | null;
  product_id: string | null;
  supported_product: string | null;
}

interface SbCatalogResponse {
  offerings: SbCatalogItem[];
}

interface CatalogEntry {
  offeringName: string;
  brand: string | null;
  tags: string[];
  productId: string | null;
  supportedProduct: string | null;
}

export interface SubscriptionOfferingRow {
  productName: string;
  matched: boolean;
  reason: string | null;
  offeringId: string | null;
  offeringName: string | null;
  category: string | null;
  supportedPlatforms: string | null;
  viewDetailsUrl: string | null;
}

let productsCache: {
  byName: Map<string, SbProduct>;
  byId: Map<string, SbProduct>;
  fetchedAt: number;
} | null = null;
let catalogCache: { byOfferingId: Map<string, CatalogEntry>; fetchedAt: number } | null = null;

function isConfigured(): boolean {
  return Boolean(API_BASE_URL && API_KEY);
}

async function sbFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "x-api-key": API_KEY, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`Solution Builder API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function getProductsIndex(): Promise<{
  byName: Map<string, SbProduct>;
  byId: Map<string, SbProduct>;
}> {
  const now = Date.now();
  if (productsCache && now - productsCache.fetchedAt < CACHE_TTL_MS) {
    return { byName: productsCache.byName, byId: productsCache.byId };
  }
  const products = await sbFetch<SbProduct[]>("/api/v1/products/all");
  const byName = new Map<string, SbProduct>();
  const byId = new Map<string, SbProduct>();
  for (const p of products) {
    byName.set(p.product_name.trim().toLowerCase(), p);
    byId.set(p.product_id, p);
  }
  productsCache = { byName, byId, fetchedAt: now };
  return { byName, byId };
}

async function getCatalogIndex(): Promise<Map<string, CatalogEntry>> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.fetchedAt < CACHE_TTL_MS) return catalogCache.byOfferingId;
  const resp = await sbFetch<SbCatalogResponse>("/api/v1/offerings/catalog");
  const byOfferingId = new Map<string, CatalogEntry>();
  for (const o of resp.offerings) {
    const tags = (o.offering_tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    byOfferingId.set(o.offering_id, {
      offeringName: o.offering_name,
      brand: o.brand ?? null,
      tags,
      productId: o.product_id ?? null,
      supportedProduct: o.supported_product ?? null,
    });
  }
  catalogCache = { byOfferingId, fetchedAt: now };
  return byOfferingId;
}

function buildViewDetailsUrl(offeringId: string): string | null {
  if (!UI_OFFERING_URL_TEMPLATE) return null;
  return UI_OFFERING_URL_TEMPLATE.replace("{offeringId}", offeringId);
}

/**
 * Choose the text to search offering names with.
 *
 * CSP product names and Solution Builder product names do not agree, and the
 * SB product catalog is small (~136 entries) and not a superset of what the
 * offering catalog covers. So the product catalog is used to IMPROVE the search
 * term where it can, never to gate the search:
 *
 *   1. exact SB product name                — "Business Automation Workflow"
 *   2. the longest SB product name related to the CSP name, in either direction
 *      — CSP "WebSphere Application Server" → SB product "WebSphere", whose
 *        offering is named "Expertise Connect for WebSphere" and would never
 *        match the longer CSP string; and CSP "Operational Decision Manager" →
 *        "Operational Decision Manager (ODM)", which carries the suffix the
 *        offering name also uses.
 *   3. the CSP name itself — "IBM i" is absent from the product catalog
 *      entirely, yet "Expertise Connect for IBM i on IBM Power" exists.
 *
 * Gating on step 1 alone was silently hiding real offerings for every product
 * whose CSP spelling differs from its SB spelling.
 */
function resolveSearchNeedle(cspProductName: string, productsByName: Map<string, SbProduct>): string {
  const needle = cspProductName.trim().toLowerCase();
  if (!needle) return "";

  const exact = productsByName.get(needle);
  if (exact) return exact.product_name.trim().toLowerCase();

  let best = "";
  for (const [lowerName] of productsByName) {
    if (!lowerName) continue;
    if (lowerName.includes(needle) || needle.includes(lowerName)) {
      if (lowerName.length > best.length) best = lowerName;
    }
  }
  return best || needle;
}

/**
 * For each given product name, find offerings tagged "Subscription" whose name
 * contains the product name. This mirrors how the Solution Builder web UI's own
 * search behaves — a plain text search across the whole offering catalog by
 * name — rather than a database "linked to this product_id" join. The join
 * (`/offerings/by-products`) is both too broad (returns umbrella offerings like
 * "Expertise Connect for Cloud Pak for Integration" for every product it
 * mentions in free text) and too narrow (variant products like "MQ Advanced"
 * have their own separate product_id, never linked to plain "MQ", so a
 * product_id-scoped join can never surface them for an "MQ" search the way the
 * real UI's text search does) — so catalog-wide name matching is what actually
 * reproduces the UI's results, not a stricter-looking relational lookup.
 * The search term itself is chosen by {@link resolveSearchNeedle}, which uses
 * the SB product catalog to sharpen the term but never to reject a product.
 * Products with no Subscription-tagged offerings still produce one row
 * (matched: false) so the caller can render the gap.
 */
export async function getSubscriptionOfferingsForProducts(
  productNames: string[],
): Promise<SubscriptionOfferingRow[]> {
  if (!isConfigured()) {
    return productNames.map((productName) => ({
      productName,
      matched: false,
      reason:
        "Solution Builder API is not configured (set SOLUTION_BUILDER_API_BASE_URL / SOLUTION_BUILDER_API_KEY).",
      offeringId: null,
      offeringName: null,
      category: null,
      supportedPlatforms: null,
      viewDetailsUrl: null,
    }));
  }

  const { byName: productsByName, byId: productsById } = await getProductsIndex();
  const catalog = await getCatalogIndex();
  const catalogEntries = [...catalog.entries()];

  const rows: SubscriptionOfferingRow[] = [];

  for (const productName of productNames) {
    const needle = resolveSearchNeedle(productName, productsByName);
    const subscriptionOfferings = catalogEntries.filter(
      ([, entry]) =>
        entry.tags.some((t) => t.toLowerCase() === "subscription") &&
        entry.offeringName.toLowerCase().includes(needle),
    );

    if (subscriptionOfferings.length === 0) {
      rows.push({
        productName,
        matched: false,
        reason: 'No offerings tagged "Subscription" were found for this product.',
        offeringId: null,
        offeringName: null,
        category: null,
        supportedPlatforms: null,
        viewDetailsUrl: null,
      });
      continue;
    }

    for (const [offeringId, entry] of subscriptionOfferings) {
      // Supported Platforms = the offering's own primary product UNIONED with
      // whatever's listed in supported_product — not one-or-the-other. E.g.
      // "Expertise Connect for Cognos Analytics on Cloud Pak for Data" has
      // primary product "Cognos Analytics" and supported_product "Cloud Pak for
      // Data"; both need to show, not just supported_product alone.
      const primaryName = entry.productId
        ? productsById.get(entry.productId)?.product_name
        : undefined;
      const supportedNames = (entry.supportedProduct ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const platformNames: string[] = [];
      for (const name of [primaryName, ...supportedNames].filter((n): n is string => Boolean(n))) {
        if (!platformNames.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
          platformNames.push(name);
        }
      }
      const supportedPlatforms = platformNames.length > 0 ? platformNames.join(", ") : "—";
      rows.push({
        productName,
        matched: true,
        reason: null,
        offeringId,
        offeringName: entry.offeringName,
        category: entry.brand,
        supportedPlatforms,
        viewDetailsUrl: buildViewDetailsUrl(offeringId),
      });
    }
  }

  return rows;
}
