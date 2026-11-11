import { Tile, Tag, Button, IconButton } from "@carbon/react";
import { Information } from "@carbon/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { ScoreGauge } from "@/components/shared/ScoreGauge";
import { TierTag } from "@/components/shared/TierTag";
import { TIER_FEATURE_ENABLED } from "@/constants/tierFeature";
import type { Client } from "@/data/clients";
import { useState, useEffect } from "react";
import { getProductHealthKpis } from "@/services/productHealthKpiService";
import { calculateProductHealth } from "@/lib/productHealthCalculator";
import { useClientProductCount } from "@/lib/clientProductCount";
import { formatMoneyCompact } from "@/lib/moneyFormat";

/** Active-contract roll-up, served by /api/demo/contract-summary/:clientId. */
export interface ContractSummary {
  totalTcv: number;
  activeCount: number;
  /** ISO date, or "" when the client has no active contract. */
  earliestRenewal: string;
  /** Holders that signed on this customer's behalf, e.g. SBM. Empty when held directly. */
  contractedThrough?: string[];
}

const EMPTY = "—";

function formatIsoDate(iso: string): string {
  if (!iso) return EMPTY;
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AccountHeader({
  client,
  contractSummary,
}: {
  client: Client;
  /** null while loading. Undefined means the caller isn't supplying one. */
  contractSummary?: ContractSummary | null;
}) {
  const [overallProductHealth, setOverallProductHealth] = useState<number>(0);
  // Same source Product Overview renders from, so the two never disagree.
  const productCount = useClientProductCount(client);
  const navigate = useNavigate();

  // Calculate Overall Product Health from individual product health scores
  useEffect(() => {
    const calculateOverallHealth = async () => {
      const healthScores: number[] = [];

      // Fetch health score for each product
      for (const product of client.productPortfolio) {
        const healthKpis = await getProductHealthKpis(client.clientId, product.productName);
        const healthCalculation = calculateProductHealth(healthKpis);

        // Only include products that have health check data
        if (healthCalculation.hasData) {
          healthScores.push(healthCalculation.healthPercent);
        }
      }

      // Calculate average of all product health scores
      if (healthScores.length > 0) {
        const average = healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length;
        setOverallProductHealth(Math.round(average));
      } else {
        setOverallProductHealth(0);
      }
    };

    calculateOverallHealth();
  }, [client.clientId, client.productPortfolio]);

  const goToContract = () =>
    navigate({
      to: "/client/$clientId/contract",
      params: { clientId: client.clientId },
    });

  /**
   * Label for a value derived from the Contract page.
   *
   * Carbon's IconButton carries its own tooltip on hover and focus, so the
   * hint and the keyboard affordance come from the design system rather than
   * being rebuilt here. Activating it opens the page it is describing.
   */
  const derivedLabel = (text: string) => (
    <div className="cp-metric-label">
      <span>{text}</span>
      <IconButton
        label="Go to Contract page for more details"
        kind="ghost"
        size="sm"
        align="bottom"
        className="cp-metric-info"
        onClick={goToContract}
      >
        <Information />
      </IconButton>
    </div>
  );

  // While the roll-up is loading, keep the cells empty rather than flashing a
  // zero — a zero here is a real, meaningful value and must not be faked.
  const loading = contractSummary === null || contractSummary === undefined;

  return (
    <Tile style={{ padding: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 300, margin: 0 }}>{client.clientName}</h1>
          <div style={{ marginTop: "0.5rem" }}>
            <Tag type="outline">{client.geo}</Tag>
            {TIER_FEATURE_ENABLED && <TierTag tier={client.tier}>{client.tier} Tier</TierTag>}
          </div>
          {!!contractSummary?.contractedThrough?.length && (
            <div
              style={{
                marginTop: "0.5rem",
                fontSize: "0.75rem",
                color: "var(--cds-text-secondary)",
              }}
            >
              Contracts held through {contractSummary.contractedThrough.join(", ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button kind="tertiary" size="md">
            Account Notes
          </Button>
          <Button kind="tertiary" size="md" onClick={goToContract}>
            Contract
          </Button>
        </div>
      </div>
      <div className="cp-metric-row cp-account-header-row">
        <div>
          {derivedLabel("TCV")}
          <div className="cp-metric-value">
            {loading ? EMPTY : formatMoneyCompact(contractSummary.totalTcv)}
          </div>
        </div>
        <div>
          {derivedLabel("Number of Active Contracts")}
          <div className="cp-metric-value">{loading ? EMPTY : contractSummary.activeCount}</div>
        </div>
        <div>
          <div className="cp-metric-label">Earliest Renewal Date</div>
          <div className="cp-metric-value">
            {loading ? EMPTY : formatIsoDate(contractSummary.earliestRenewal)}
          </div>
        </div>
        <div>
          <div className="cp-metric-label">Products</div>
          <div className="cp-metric-value">
            {productCount.loading ? EMPTY : productCount.count}
          </div>
        </div>
        <div>
          <div className="cp-metric-label">Overall Product Health</div>
          <div className="cp-metric-value">
            <ScoreGauge value={overallProductHealth} />
          </div>
        </div>
      </div>
    </Tile>
  );
}
