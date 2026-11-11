/** Geo filter values for Global View (management). */
export const GEO_FILTER_OPTIONS = ["APAC", "Japan", "EMEA", "Americas"] as const;

export type Geo = (typeof GEO_FILTER_OPTIONS)[number];

export const ALL_GEOS = "ALL";

export type GeoFilter = typeof ALL_GEOS | Geo;

const LEGACY_GEO_MAP: Record<string, Geo> = {
  APAC: "APAC",
  JAPAN: "Japan",
  EMEA: "EMEA",
  AMERICAS: "Americas",
  "NORTH AMERICA": "Americas",
  "ASIA PACIFIC": "APAC",
  LATAM: "Americas",
};

/** Normalizes stored geo strings to canonical filter values. */
export function normalizeGeo(value: string): Geo | null {
  const key = value.trim().toUpperCase();
  if (key === "JAPAN") return "Japan";
  const mapped = LEGACY_GEO_MAP[key];
  if (mapped) return mapped;
  const direct = GEO_FILTER_OPTIONS.find((g) => g.toUpperCase() === key);
  return direct ?? null;
}
