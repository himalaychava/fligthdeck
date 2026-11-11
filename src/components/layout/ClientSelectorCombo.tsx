import { useEffect, useMemo, useState } from "react";
import { ComboBox, Select, SelectItem } from "@carbon/react";
import type { Client } from "@/data/clients";
import { TIER_FEATURE_ENABLED } from "@/constants/tierFeature";
import { GLOBAL_CLIENT_ID, GLOBAL_VIEW_SELECTOR } from "@/constants/globalView";
import { ALL_GEOS, GEO_FILTER_OPTIONS, type GeoFilter } from "@/constants/geos";
import { ALL_MARKETS, type MarketFilter } from "@/constants/markets";
import { useGeoMarketTree } from "@/components/admin/GeoMarketSelect";

export const CLIENT_SELECTOR_NO_RESULTS_ID = "__no_results__";

export type ClientSelectorItem = Client | typeof GLOBAL_VIEW_SELECTOR;

type MenuItem = ClientSelectorItem | typeof NO_RESULTS_ITEM;

const NO_RESULTS_ITEM = {
  clientId: CLIENT_SELECTOR_NO_RESULTS_ID,
  clientName: "No clients found",
} as const;

function isGlobalSelector(item: MenuItem): item is typeof GLOBAL_VIEW_SELECTOR {
  return item.clientId === GLOBAL_CLIENT_ID;
}

function isNoResultsItem(item: MenuItem | null | undefined): item is typeof NO_RESULTS_ITEM {
  return item?.clientId === CLIENT_SELECTOR_NO_RESULTS_ID;
}

function matchesFilters(
  item: ClientSelectorItem,
  nameQuery: string,
  geoFilter: GeoFilter,
  marketFilter: MarketFilter,
  tierFilter: string,
): boolean {
  if (isGlobalSelector(item)) {
    // Global view always matches if name query matches
    return !nameQuery || item.clientName.toLowerCase().includes(nameQuery);
  }

  const client = item as Client;

  // Check name/ICN/CMR filter
  if (nameQuery) {
    const icn = client.icnNumber?.toLowerCase() ?? "";
    const cmr = client.cmrNumber?.toLowerCase() ?? "";
    const nameMatch =
      client.clientName.toLowerCase().includes(nameQuery) ||
      icn.includes(nameQuery) ||
      cmr.includes(nameQuery);
    if (!nameMatch) return false;
  }

  // Check geo filter
  if (geoFilter !== ALL_GEOS && client.geo !== geoFilter) {
    return false;
  }

  // Check market filter
  if (marketFilter !== ALL_MARKETS && client.market !== marketFilter) {
    return false;
  }

  // Check tier filter
  if (tierFilter !== "all" && client.tier !== tierFilter) {
    return false;
  }

  return true;
}

/**
 * Longest client name kept in the collapsed input before it is elided.
 *
 * The input holds a single string, so CSS ellipsis trims from the end and eats
 * the ICN — the part most worth keeping. Truncating the NAME instead keeps the
 * id in view, matching how the dropdown rows read. Sized for the 256px side
 * nav; the full value returns while the field has focus.
 */
const COLLAPSED_NAME_MAX = 18;

function collapsedLabel(name: string, id: string | undefined): string {
  const shortName =
    name.length > COLLAPSED_NAME_MAX ? `${name.slice(0, COLLAPSED_NAME_MAX)}…` : name;
  return id ? `${shortName} (${id})` : shortName;
}

export function ClientSelectorCombo({
  items,
  selectedItem,
  onSelect,
}: {
  items: ClientSelectorItem[];
  selectedItem: ClientSelectorItem | null | undefined;
  onSelect: (item: ClientSelectorItem) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  // Focus decides whether the input shows the elided or the full label.
  const [isFocused, setIsFocused] = useState(false);
  const [geoFilter, setGeoFilter] = useState<GeoFilter>(ALL_GEOS);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>(ALL_MARKETS);
  const [tierFilter, setTierFilter] = useState<string>("all");

  // Live from Clarizen via /api/demo/geo-markets — same source Global View's
  // own market filter uses, and for the same reason: the static
  // GEO_MARKET_HIERARCHY constant doesn't share market names with real data,
  // so a filter built on it would never match a real client.
  const { tree: geoTree } = useGeoMarketTree();

  // Cascading: picking a geography narrows the markets offered to that
  // geography's own, same as Global View.
  const availableMarkets = useMemo(() => {
    if (geoFilter === ALL_GEOS) {
      return [...new Set(geoTree.flatMap((n) => n.markets))].sort();
    }
    return geoTree.find((n) => n.geo === geoFilter)?.markets ?? [];
  }, [geoTree, geoFilter]);

  // A market chosen under one geography is meaningless under another.
  useEffect(() => {
    if (marketFilter !== ALL_MARKETS && !availableMarkets.includes(marketFilter)) {
      setMarketFilter(ALL_MARKETS);
    }
  }, [availableMarkets, marketFilter]);

  useEffect(() => {
    setInputValue("");
  }, [selectedItem?.clientId]);

  // Get unique tiers from items (filtered by geo if selected)
  const availableTiers = useMemo(() => {
    const tiers = new Set<string>();
    items.forEach((item) => {
      if (!isGlobalSelector(item)) {
        const client = item as Client;
        // Only include tiers from clients matching the geo filter
        if (geoFilter === ALL_GEOS || client.geo === geoFilter) {
          tiers.add(client.tier);
        }
      }
    });
    return Array.from(tiers).sort();
  }, [items, geoFilter]);

  // Filter items based on geo, market and tier filters first, then by search query
  const menuItems: MenuItem[] = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    const matched = items.filter((item) =>
      matchesFilters(item, query, geoFilter, marketFilter, tierFilter),
    );
    return matched.length > 0 ? matched : [NO_RESULTS_ITEM];
  }, [items, inputValue, geoFilter, marketFilter, tierFilter]);

  // Whether the client currently shown in the search box still belongs to the
  // active Geo/Market filter. Changing either filter can leave the box
  // displaying a client that's no longer in the (now-filtered) list below it
  // — e.g. filter to EMEA while viewing a client in Americas — which reads as
  // "this client matches," though it no longer does. Cleared below rather
  // than navigating away: the user stays on the page they were viewing, only
  // the search box (and the "current selection" line under it) goes blank
  // until they pick a client that actually matches.
  const selectedMatchesFilters =
    !selectedItem || isNoResultsItem(selectedItem)
      ? true
      : matchesFilters(selectedItem, "", geoFilter, marketFilter, tierFilter);

  return (
    <>
      {/* Row 1: Geo, Market and Tier filters side by side */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <label
            htmlFor="client-geo-filter"
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 400,
              color: "var(--cds-text-secondary)",
              marginBottom: "0.25rem",
            }}
          >
            Geo
          </label>
          <Select
            id="client-geo-filter"
            labelText=""
            size="sm"
            value={geoFilter}
            onChange={(e) => {
              const newGeo = e.target.value as GeoFilter;
              setGeoFilter(newGeo);
              // Market is reset by the availableMarkets effect above once it
              // recomputes for the new geo.
              // Reset tier filter if it's no longer available in the new geo
              if (tierFilter !== "all") {
                const tiersInNewGeo = new Set<string>();
                items.forEach((item) => {
                  if (!isGlobalSelector(item)) {
                    const client = item as Client;
                    if (newGeo === ALL_GEOS || client.geo === newGeo) {
                      tiersInNewGeo.add(client.tier);
                    }
                  }
                });
                if (!tiersInNewGeo.has(tierFilter)) {
                  setTierFilter("all");
                }
              }
            }}
          >
            <SelectItem value={ALL_GEOS} text="All" />
            {GEO_FILTER_OPTIONS.map((geo) => (
              <SelectItem key={geo} value={geo} text={geo} />
            ))}
          </Select>
        </div>
        <div style={{ flex: 1 }}>
          <label
            htmlFor="client-market-filter"
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 400,
              color: "var(--cds-text-secondary)",
              marginBottom: "0.25rem",
            }}
          >
            Market
          </label>
          <Select
            id="client-market-filter"
            labelText=""
            size="sm"
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value as MarketFilter)}
          >
            <SelectItem value={ALL_MARKETS} text="All" />
            {availableMarkets.map((market) => (
              <SelectItem key={market} value={market} text={market} />
            ))}
          </Select>
        </div>
        {TIER_FEATURE_ENABLED && (
          <div style={{ flex: 1 }}>
            <label
              htmlFor="client-tier-filter"
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: 400,
                color: "var(--cds-text-secondary)",
                marginBottom: "0.25rem",
              }}
            >
              Tier
            </label>
            <Select
              id="client-tier-filter"
              labelText=""
              size="sm"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
            >
              <SelectItem value="all" text="All" />
              {availableTiers.map((tier) => (
                <SelectItem key={tier} value={tier} text={tier} />
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Row 2: Client Name/ICN search.
          Focus/blur are captured on the wrapper because Carbon does not expose
          the inner input's handlers. */}
      <div onFocusCapture={() => setIsFocused(true)} onBlurCapture={() => setIsFocused(false)}>
        <ComboBox
          key={selectedItem?.clientId ?? "default"}
          id="client-selector"
          className="cp-client-selector"
          titleText=""
          placeholder="Search by Client Name / ICN"
          size="sm"
          items={menuItems}
          selectedItem={selectedMatchesFilters ? (selectedItem ?? null) : null}
          itemToString={(item) => {
            if (!item || isNoResultsItem(item)) return "";
            if (isGlobalSelector(item)) return item.clientName;
            const client = item as Client;
            // Elided while collapsed so the ICN stays visible; full on focus.
            // The id is always present so keyboard navigation announces it.
            return isFocused
              ? client.cmrNumber
                ? `${client.clientName} (${client.cmrNumber})`
                : client.clientName
              : collapsedLabel(client.clientName, client.cmrNumber);
          }}
          itemToElement={(item) => {
            if (!item) return null;
            if (isNoResultsItem(item)) {
              return <span className="cp-client-selector__no-results">No clients found</span>;
            }
            if (isGlobalSelector(item)) {
              return (
                <span className="cp-client-selector__option" style={{ fontWeight: 600 }}>
                  {item.clientName}
                </span>
              );
            }
            const client = item as Client;
            return (
              <span className="cp-client-selector__option">
                <span className="cp-client-selector__name">{client.clientName}</span>
                {client.cmrNumber ? (
                  <span className="cp-client-selector__icn">({client.cmrNumber})</span>
                ) : client.icnNumber ? (
                  <span className="cp-client-selector__icn">{client.icnNumber}</span>
                ) : null}
              </span>
            );
          }}
          shouldFilterItem={() => true}
          onInputChange={(value) => setInputValue(value ?? "")}
          onChange={({ selectedItem: next }) => {
            if (!next || isNoResultsItem(next)) return;
            onSelect(next);
            setInputValue("");
          }}
        />
      </div>

      {/* Current selection, shown in full beneath the search field.
          A single-line input can only ever elide a long client name; this block
          wraps, so the name and ICN are both fully readable without focusing or
          hovering anything. */}
      {selectedItem && !isNoResultsItem(selectedItem) && selectedMatchesFilters && (
        <div className="cp-client-selector__selected">
          <span className="cp-client-selector__selected-name">{selectedItem.clientName}</span>
          {!isGlobalSelector(selectedItem) && (selectedItem as Client).cmrNumber && (
            <span className="cp-client-selector__selected-id">
              ICN {(selectedItem as Client).cmrNumber}
            </span>
          )}
        </div>
      )}
    </>
  );
}
