/**
 * Geography / Market access selector for User Entitlements.
 *
 * Two levels, both with an explicit "All" choice:
 *
 *   Geography — which geographies the user may see. None selected means ALL
 *               geographies, which is how a full-access user is expressed.
 *   Market    — per selected geography. No markets ticked for a geography
 *               means ALL markets within it.
 *
 * Every value comes from the live Clarizen data via /api/demo/geo-markets —
 * nothing is hardcoded, so a new geography or a renamed market appears here on
 * the next upload with no code change.
 *
 * The empty-means-all convention matches how assignedClients already works in
 * this panel, and it is what makes existing records keep their access when
 * geo/market is introduced.
 */
import { useEffect, useState } from "react";
import { Checkbox, InlineLoading, Tag } from "@carbon/react";
import { apiFetch } from "@/lib/apiFetch";

export interface GeoNode {
  geo: string;
  markets: string[];
}

/** The two fields this component edits. */
export interface GeoMarketValue {
  /** Empty = all geographies. */
  geos: string[];
  /** geo -> markets. Missing or empty for a geo = all markets in that geo. */
  markets: Record<string, string[]>;
}

/** Fetch the tree once and share it — it is identical for every row. */
export function useGeoMarketTree(): { tree: GeoNode[]; loading: boolean } {
  const [tree, setTree] = useState<GeoNode[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/demo/geo-markets")
      .then((r) => (r.ok ? (r.json() as Promise<{ tree?: GeoNode[] }>) : null))
      .catch(() => null)
      .then((d) => {
        if (cancelled) return;
        setTree(d?.tree ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { tree, loading };
}

/** Short human summary of a geo/market grant, for the entitlements table. */
export function describeGeoMarket(value: GeoMarketValue): string {
  if (!value.geos || value.geos.length === 0) return "All geographies";
  return value.geos
    .map((g) => {
      const m = value.markets?.[g] ?? [];
      return m.length === 0 ? `${g} (all markets)` : `${g} (${m.join(", ")})`;
    })
    .join(" · ");
}

/**
 * Clients a geo/market grant would actually admit.
 *
 * Mirrors the server's rule in accessControl.geoMarketAllows — empty geos means
 * all, and a geo with no markets listed means all markets within it. Kept in
 * step with the server deliberately: this only narrows what the admin is
 * offered, and the server still decides, so a drift here cannot grant access.
 *
 * Used to scope the client picker, because assigning a client outside the
 * granted geography has no effect — the two restrictions are ANDed — and
 * offering it would invite a silent mis-assignment.
 */
export function clientsInGeoMarketScope<T extends { geo?: string; market?: string }>(
  clients: T[],
  value: GeoMarketValue,
): T[] {
  if (!value.geos || value.geos.length === 0) return clients;
  return clients.filter((c) => {
    const geo = (c.geo ?? "").trim();
    // No geography means no geo-restricted grant can reach it.
    if (!geo || !value.geos.includes(geo)) return false;
    const allowed = value.markets?.[geo] ?? [];
    if (allowed.length === 0) return true;
    const market = (c.market ?? "").trim();
    return market !== "" && allowed.includes(market);
  });
}

const boxStyle: React.CSSProperties = {
  border: "1px solid var(--cds-border-subtle-01, #e0e0e0)",
  background: "var(--cds-layer-01, #f4f4f4)",
  padding: "0.75rem 0.85rem",
};

export function GeoMarketSelect({
  tree,
  loading,
  value,
  disabled,
  onChange,
}: {
  tree: GeoNode[];
  loading: boolean;
  value: GeoMarketValue;
  disabled?: boolean;
  onChange: (next: GeoMarketValue) => void;
}) {
  const allGeos = value.geos.length === 0;

  const setAllGeos = (on: boolean) => {
    // Turning "All" on clears both levels — an unrestricted grant carries no
    // leftover market rules that would resurface if a geo is picked later.
    if (on) onChange({ geos: [], markets: {} });
    else onChange({ geos: tree.map((t) => t.geo), markets: {} });
  };

  const toggleGeo = (geo: string, on: boolean) => {
    const geos = on ? [...value.geos, geo] : value.geos.filter((g) => g !== geo);
    const markets = { ...value.markets };
    // Dropping a geography drops its market rules with it.
    if (!on) delete markets[geo];
    onChange({ geos, markets });
  };

  const toggleMarket = (geo: string, market: string, on: boolean) => {
    const current = value.markets[geo] ?? [];
    const next = on ? [...current, market] : current.filter((m) => m !== market);
    const markets = { ...value.markets };
    if (next.length === 0) delete markets[geo];
    else markets[geo] = next;
    onChange({ geos: value.geos, markets });
  };

  if (loading) return <InlineLoading description="Loading geographies…" />;

  if (tree.length === 0) {
    return (
      <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary, #525252)", margin: 0 }}>
        No geographies found in the Clarizen data. Upload Clarizen data to enable geography and
        market restrictions.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      <div style={boxStyle}>
        <Checkbox
          id="geo-all"
          labelText="All geographies (full access)"
          checked={allGeos}
          disabled={disabled}
          onChange={(_: unknown, { checked }: { checked: boolean }) => setAllGeos(checked)}
        />
      </div>

      {!allGeos && (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {tree.map((node) => {
            const geoOn = value.geos.includes(node.geo);
            const picked = value.markets[node.geo] ?? [];
            const allMarkets = picked.length === 0;
            return (
              <div key={node.geo} style={boxStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Checkbox
                    id={`geo-${node.geo}`}
                    labelText={node.geo}
                    checked={geoOn}
                    disabled={disabled}
                    onChange={(_: unknown, { checked }: { checked: boolean }) =>
                      toggleGeo(node.geo, checked)
                    }
                  />
                  {geoOn && (
                    <Tag type={allMarkets ? "blue" : "cool-gray"} size="sm">
                      {allMarkets ? "All markets" : `${picked.length} of ${node.markets.length}`}
                    </Tag>
                  )}
                </div>

                {geoOn && node.markets.length > 0 && (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      paddingLeft: "1.6rem",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                      gap: "0.1rem 0.75rem",
                    }}
                  >
                    <div style={{ gridColumn: "1 / -1" }}>
                      <Checkbox
                        id={`mkt-all-${node.geo}`}
                        labelText={`All markets in ${node.geo}`}
                        checked={allMarkets}
                        disabled={disabled}
                        onChange={(_: unknown, { checked }: { checked: boolean }) => {
                          const markets = { ...value.markets };
                          // Ticking "all" removes the per-market rule entirely,
                          // so a later market rename cannot orphan the grant.
                          if (checked) delete markets[node.geo];
                          else markets[node.geo] = [...node.markets];
                          onChange({ geos: value.geos, markets });
                        }}
                      />
                    </div>
                    {node.markets.map((m) => (
                      <Checkbox
                        key={m}
                        id={`mkt-${node.geo}-${m}`}
                        labelText={m}
                        checked={allMarkets || picked.includes(m)}
                        disabled={disabled || allMarkets}
                        onChange={(_: unknown, { checked }: { checked: boolean }) =>
                          toggleMarket(node.geo, m, checked)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary, #525252)", margin: 0 }}>
        {describeGeoMarket(value)}
      </p>
    </div>
  );
}
