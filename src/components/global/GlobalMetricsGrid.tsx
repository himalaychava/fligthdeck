import type { ReactNode } from "react";
import { Tile } from "@carbon/react";
import type { GlobalPortfolioMetrics } from "@/services/globalViewAggregator";
import { formatMoneyCompact, formatNrrPercent } from "@/services/globalViewAggregator";
import { TierTag } from "@/components/shared/TierTag";
import { TIER_FEATURE_ENABLED } from "@/constants/tierFeature";
import type { ClientTier } from "@/constants/tierColors";

const TIER_ORDER: ClientTier[] = ["Gold", "Silver", "Bronze", "Free"];

interface GlobalMetricsGridProps {
  metrics: GlobalPortfolioMetrics;
}

function MetricCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cp-global-metric-cell">
      <div className="cp-metric-label">{label}</div>
      <div className="cp-metric-value">{children}</div>
    </div>
  );
}

export function GlobalMetricsGrid({ metrics }: GlobalMetricsGridProps) {
  const tierTags = TIER_ORDER.filter((tier) => metrics.tierBreakdown[tier] > 0).map(
    (tier) => [tier, metrics.tierBreakdown[tier]] as const
  );

  return (
    <Tile className="cp-global-metrics-tile">
      <div className="cp-global-metrics-rows">
        <div className="cp-global-metrics-row">
          <MetricCell label="Total customers">{metrics.totalCustomers}</MetricCell>
          <MetricCell label="ACV">{formatMoneyCompact(metrics.totalAcv)}</MetricCell>
          <MetricCell label="NRR">{formatNrrPercent(metrics.portfolioNrrPercent)}</MetricCell>
          <MetricCell label="Products covered">
            {metrics.totalProducts}
            <span className="cp-global-metric-sub">
              ({metrics.uniqueProducts} unique)
            </span>
          </MetricCell>
        </div>
        <div className="cp-global-metrics-row">
          <MetricCell label="Total revenue (current year)">
            {formatMoneyCompact(metrics.totalCurrentYearRevenue)}
          </MetricCell>
          <MetricCell label="TCV">{formatMoneyCompact(metrics.totalTcv)}</MetricCell>
          <MetricCell label="ARR">
            {metrics.totalCustomers > 0 ? (() => {
              const arrValue = metrics.totalArr / metrics.totalCustomers;
              const arrow = arrValue >= 0 ? "↑" : "↓";
              return `${arrow} ${Math.abs(arrValue).toFixed(1)}`;
            })() : "—"}
          </MetricCell>
          {TIER_FEATURE_ENABLED && (
            <MetricCell label="Tier mix">
              <div className="cp-global-tier-mix">
                {tierTags.length === 0 ? (
                  <span className="cp-global-metric-sub">—</span>
                ) : (
                  tierTags.map(([tier, count]) => (
                    <TierTag key={tier} tier={tier}>
                      {tier}: {count}
                    </TierTag>
                  ))
                )}
              </div>
            </MetricCell>
          )}
        </div>
      </div>
    </Tile>
  );
}
