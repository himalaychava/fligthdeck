import type { Client } from "@/data/clients";
import type { CSSProperties } from "react";

export type ClientTier = Client["tier"];

/** IBM Carbon Design System v11 palette — tier → official color tokens */
export const TIER_CARBON_COLORS: Record<
  ClientTier,
  { background: string; color: string; border: string; token: string }
> = {
  Gold: {
    background: "#e8daff",
    color: "#6929c4",
    border: "#8a3ffc",
    token: "Purple 60 / Purple 70",
  },
  Silver: {
    background: "#dde1e6",
    color: "#121619",
    border: "#525252",
    token: "Cool Gray 20 / Cool Gray 70",
  },
  Bronze: {
    background: "#fff1e6",
    color: "#8a3800",
    border: "#ba4e00",
    token: "Orange 10 / Orange 70",
  },
  Free: {
    background: "#e0e0e0",
    color: "#161616",
    border: "#6f6f6f",
    token: "Gray 20 / Gray 60",
  },
};

export function getTierTagStyle(tier: ClientTier | string): CSSProperties {
  const palette = TIER_CARBON_COLORS[tier as ClientTier] ?? TIER_CARBON_COLORS.Free;
  return {
    backgroundColor: palette.background,
    color: palette.color,
    border: `1px solid ${palette.border}`,
    fontWeight: 500,
  };
}
