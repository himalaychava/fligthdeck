/** Market filter values for Global View. */
export const ALL_MARKETS = "ALL";

export type MarketFilter = typeof ALL_MARKETS | string;

/** Complete Geo/Market hierarchy structure */
export const GEO_MARKET_HIERARCHY = {
  Americas: ["Canada", "US", "Latam"],
  EMEA: ["DACH", "France", "Italy", "MEA", "NCEE", "sPGI", "UKI"],
  APAC: ["ASEAN", "ISA", "GCG", "South Korea"],
  Japan: ["Japan"],
} as const;

export type Geo = keyof typeof GEO_MARKET_HIERARCHY;
export type Market = (typeof GEO_MARKET_HIERARCHY)[Geo][number];

/** Get all available markets across all geos */
export function getAllMarkets(): string[] {
  return Object.values(GEO_MARKET_HIERARCHY).flat();
}

/** Get markets for a specific geo */
export function getMarketsForGeo(geo: Geo): readonly string[] {
  return GEO_MARKET_HIERARCHY[geo] || [];
}

/** Validate if a market belongs to a specific geo */
export function isMarketInGeo(market: string, geo: Geo): boolean {
  const markets = GEO_MARKET_HIERARCHY[geo];
  return markets ? (markets as readonly string[]).includes(market) : false;
}

/** Get the geo that a market belongs to */
export function getGeoForMarket(market: string): Geo | null {
  for (const [geo, markets] of Object.entries(GEO_MARKET_HIERARCHY)) {
    if ((markets as readonly string[]).includes(market)) {
      return geo as Geo;
    }
  }
  return null;
}

/** Get unique markets from clients (for backward compatibility) */
export function getUniqueMarkets(clients: Array<{ market: string }>): string[] {
  const markets = new Set<string>();
  clients.forEach((client) => {
    if (client.market && client.market.trim()) {
      markets.add(client.market);
    }
  });
  return Array.from(markets).sort();
}

/** Validate client geo/market combination */
export function validateClientGeoMarket(geo: string, market: string): {
  valid: boolean;
  error?: string;
} {
  // Check if geo exists
  if (!(geo in GEO_MARKET_HIERARCHY)) {
    return {
      valid: false,
      error: `Invalid geo: ${geo}. Must be one of: ${Object.keys(GEO_MARKET_HIERARCHY).join(", ")}`,
    };
  }

  // Check if market belongs to geo
  if (!isMarketInGeo(market, geo as Geo)) {
    const validMarkets = getMarketsForGeo(geo as Geo);
    return {
      valid: false,
      error: `Market "${market}" does not belong to geo "${geo}". Valid markets for ${geo}: ${validMarkets.join(", ")}`,
    };
  }

  return { valid: true };
}

// Made with Bob
