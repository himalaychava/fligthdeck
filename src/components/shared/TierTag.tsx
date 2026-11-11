import { Tag } from "@carbon/react";
import type { Client } from "@/data/clients";
import { getTierTagStyle } from "@/constants/tierColors";

interface TierTagProps {
  tier: Client["tier"] | string;
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}

export function TierTag({ tier, size = "sm", children }: TierTagProps) {
  return (
    <Tag size={size} style={getTierTagStyle(tier)}>
      {children ?? tier}
    </Tag>
  );
}
