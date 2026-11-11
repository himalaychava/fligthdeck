/**
 * CSP "Product Name" values that are service categories, not IBM products.
 *
 * Keyed by the CSP value lowercased; the value is the label shown instead.
 * Cases under these still count in a client's overall case totals, but are
 * kept out of every product-level breakdown (product stats, EC/Non-EC split,
 * opportunities, upgrade opportunities) — a service bucket is not an upsell
 * or upgrade target. Add further non-product entries here.
 */
export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  // Essential Management service cases — several real products can sit under it.
  "analytics cloud service": "Essential Management Service",
};

/** The service-category label for a CSP product name, or null if it is a real product. */
export function serviceCategoryFor(productName: string): string | null {
  return SERVICE_CATEGORY_LABELS[productName.trim().toLowerCase()] ?? null;
}
