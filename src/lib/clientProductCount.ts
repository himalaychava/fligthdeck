/**
 * The client's product count — one rule, shared.
 *
 * Client Overview and Product Overview were each deciding for themselves what
 * "products" meant, and disagreeing:
 *
 *   Product Overview : a hand-maintained productPortfolio when the client has
 *                      one, otherwise the EC products identified from Clarizen.
 *   Client Overview  : client.products — a comma-separated column on the
 *                      workbook row, unrelated to either.
 *
 * For a Clarizen-sourced client the second is usually empty or stale while the
 * first shows real tiles, so the header reported a number the page beneath it
 * contradicted. This module owns the rule so both read the same source.
 */
import { useEffect, useState } from "react";
import type { Client } from "@/data/clients";
import { apiFetch } from "@/lib/apiFetch";

/**
 * Whether this client's products come from the EC mapping rather than a
 * hand-maintained portfolio.
 *
 * A sample client carries a productPortfolio and wins; a real one does not and
 * falls back to EC. Exported so ProductPortfolioHealth applies the identical
 * test instead of repeating the expression.
 */
export function usesEcProducts(client: Pick<Client, "productPortfolio">): boolean {
  return client.productPortfolio.length === 0;
}

interface ProductBoxesPayload {
  products?: { productId: string }[];
}

export interface ProductCount {
  count: number;
  /** True until the EC list has arrived. Lets the caller avoid flashing "0". */
  loading: boolean;
}

/**
 * How many products this client has, matching what Product Overview renders.
 *
 * Counts only products the server returns as active — removed ones are already
 * excluded from that payload, so a false positive somebody deleted does not
 * keep inflating the header.
 */
export function useClientProductCount(client: Client): ProductCount {
  const ecMode = usesEcProducts(client);
  const [ecCount, setEcCount] = useState<number | null>(null);

  useEffect(() => {
    if (!ecMode) {
      setEcCount(null);
      return;
    }
    let cancelled = false;
    setEcCount(null);
    apiFetch(`/api/demo/product-verification/${encodeURIComponent(client.clientId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<ProductBoxesPayload>) : null))
      .catch(() => null)
      .then((d) => {
        if (!cancelled) setEcCount(d?.products?.length ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [client.clientId, ecMode]);

  if (!ecMode) return { count: client.productPortfolio.length, loading: false };
  return { count: ecCount ?? 0, loading: ecCount === null };
}
