import type { KPIDefinition } from "./kpiLibrary";
import { buildMockKpiConfig } from "@/lib/mockKpiConfig";

export interface KPIScoreEntry {
  date: string;
  value: number;
  notes?: string;
  recordedBy?: string;
}

export interface ClientKPIConfig {
  kpiId: string;
  history: KPIScoreEntry[];
}

export interface Risk {
  severity: "Low" | "Medium" | "High" | "Critical";
  description: string;
  mitigation: string;
  likelihood: number;
  impact: number;
  riskScore: number;
}

export interface ProductRiskIntelligence {
  level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  score: number;
}

export interface ProductCaseVolumePoint {
  month: string;
  cases: number;
}

export interface ProductStabilityMetric {
  metric: string;
  value: string;
  status: "EXCELLENT" | "GOOD" | "WATCH" | "CRITICAL";
  trend: "UP" | "DOWN" | "STABLE";
  description: string;
}

export interface ProductPerformanceMetric {
  metric: string;
  value: string;
  target: string;
  status: "EXCELLENT" | "GOOD" | "WATCH" | "CRITICAL";
  trend: "UP" | "DOWN" | "STABLE";
  description: string;
}

export interface ProductRecommendation {
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  impact: string;
  effort: string;
  timeline: string;
}

/** Populated only when client data is loaded from the live demo source (Excel/JSON). */
export interface ProductLiveIntegration {
  healthPercent: number | null;
  checksFinished: number | null;
  dataThroughput: string | null;
  totalTickets: number | null;
  escalations: number | null;
  avgResolution: string | null;
  healthCheck: {
    required: boolean;
    finishedCount: number | null;
    lastCheck: string | null;
    nextCheck: string | null;
  };
  caseVolume: ProductCaseVolumePoint[];
  riskIntelligence: ProductRiskIntelligence[];
  stability: ProductStabilityMetric[];
  performance: ProductPerformanceMetric[];
  recommendations: ProductRecommendation[];
}

export interface ProductHealth {
  productId?: string;
  productName: string;
  status: "Excellent" | "Good" | "Watch" | "Critical" | "Pilot";
  description: string;
  liveIntegration?: ProductLiveIntegration;
  /**
   * Per-product Product Adoption KPI history.
   * Recorded individually from the Product Overview (product detail modal).
   * The client-level Product Adoption KPI in Client Overview shows the
   * average of the latest score from each product.
   */
  adoptionKpiConfig?: ClientKPIConfig;
}

export interface AccountTeamMember {
  name: string;
  role: string;
  assignment: string;
  email: string;
  phone: string;
}

export interface Client {
  clientId: string;
  clientName: string;
  /** IBM Customer Number — sourced from ClientOverview.icn_number in live data. */
  icnNumber: string;
  /** Customer Master Record number — sourced from ClientOverview.cmr_number in live data. Used for linking Salesforce cases. */
  cmrNumber: string;
  geo: string;
  /** Market within geo — reserved for future market-level filters (backend/Excel only for now). */
  market: string;
  tier: "Free" | "Bronze" | "Silver" | "Gold";
  contractValue: string;
  contractPeriod: string;
  renewalDate: string;
  daysToRenewal: number;
  products: string[];
  /**
   * Live product count from the server: productPortfolio.length for a
   * hand-maintained client, otherwise the active (non-removed) Clarizen/EC
   * product count — see /api/demo/clients. Optional because MOCK_CLIENTS and
   * any hand-built Client in tests don't carry it.
   */
  productCount?: number;
  scores: {
    accountHealth: number;
    renewalConfidence: number;
    expansionPotential: number;
    valueVisibility: number;
  };
  executiveSummary: { summary: string; keyPoints: string[] };
  commercialSnapshot: {
    /** Annual Revenue Retention percentage (0-100%) */
    arr: string;
    renewalDate: string;
    daysToRenewal: number;
    renewalConfidence: string;
    expansionPipeline: string;
    contractionRisk: string;
  };
  risks: Risk[];
  productPortfolio: ProductHealth[];
  kpiConfig: ClientKPIConfig[];
  healthCheckData: null;
  /** Numeric financial fields for global metrics aggregation (sourced from ClientOverview / CommercialSnapshot). */
  financials?: {
    arr: number;
    acv: number;
    tcv: number;
    currentYearRevenue: number;
    nrrPercent?: number;
  };
  /** Populated only when client data is loaded from the live demo source (Excel/JSON). */
  accountTeam?: AccountTeamMember[];
}

const hist = (vals: Array<[string, number]>): KPIScoreEntry[] =>
  vals.map(([date, value]) => ({ date, value, recordedBy: "Niranjan (TAM)" }));

// ─── Mock adoption histories for demo products ────────────────────────────────

function mockAdoptionHistory(values: [number, number, number]): ClientKPIConfig {
  return {
    kpiId: "product_adoption",
    history: [
      { date: "2025-10-01", value: values[0], recordedBy: "Niranjan (TAM)" },
      { date: "2026-01-01", value: values[1], recordedBy: "Niranjan (TAM)" },
      { date: "2026-04-01", value: values[2], recordedBy: "Niranjan (TAM)" },
    ],
  };
}

export const MOCK_CLIENTS: Client[] = [
  {
    clientId: "verizon-001",
    clientName: "Verizon Communications",
    icnNumber: "ICN-US-1001847",
    cmrNumber: "2000100",
    geo: "Americas",
    market: "United States",
    tier: "Bronze",
    contractValue: "$4.2M",
    contractPeriod: "Jan 2024 — Dec 2026",
    renewalDate: "Dec 31, 2026",
    daysToRenewal: 593,
    products: ["IBM Db2", "watsonx Assistant", "Cloud Pak for Data"],
    scores: { accountHealth: 72, renewalConfidence: 68, expansionPotential: 55, valueVisibility: 64 },
    executiveSummary: {
      summary:
        "Verizon is in a steady-state engagement with healthy platform availability but signs of churn risk in their analytics workload. Strong technical engagement; commercial sentiment is mixed following the Q1 pricing discussion.",
      keyPoints: [
        "Platform availability holding above 99.2% over the last quarter",
        "Analytics workload utilisation declined 12% — investigation underway",
        "Renewal conversation initiated 9 months early to address pricing concerns",
        "Expansion opportunity: watsonx.governance pilot proposed for Q3",
      ],
    },
    commercialSnapshot: {
      arr: "$4.2M",
      renewalDate: "Dec 31, 2026",
      daysToRenewal: 593,
      renewalConfidence: "68% — Moderate",
      expansionPipeline: "$1.1M",
      contractionRisk: "Low-Moderate",
    },
    risks: [
      {
        severity: "Medium",
        description: "Analytics workload utilisation declined 12% QoQ — suggests potential workload migration to a competitor.",
        mitigation: "TAM scheduled deep-dive workshop with Verizon Data Platform team for week of June 3.",
        likelihood: 45,
        impact: 65,
        riskScore: 29,
      },
      {
        severity: "Low",
        description: "Renewal pricing pushback from procurement during Q1 budget review.",
        mitigation: "Joint business case in development with Sales; value-realization report due May 30.",
        likelihood: 30,
        impact: 70,
        riskScore: 21,
      },
    ],
    productPortfolio: [
      {
        productName: "IBM Db2",
        productId: "ibm-db2",
        status: "Excellent",
        description: "Powers core billing platform. 99.97% uptime YTD.",
        adoptionKpiConfig: mockAdoptionHistory([6.5, 6.8, 7.2]),
      },
      {
        productName: "watsonx Assistant",
        productId: "watsonx-assistant",
        status: "Good",
        description: "Customer service deployment handling 1.2M calls/mo.",
        adoptionKpiConfig: mockAdoptionHistory([6.0, 6.5, 6.8]),
      },
      {
        productName: "Cloud Pak for Data",
        productId: "cloud-pak-data",
        status: "Critical",
        description: "Utilisation down — workshop scheduled to re-engage.",
        adoptionKpiConfig: mockAdoptionHistory([4.0, 3.8, 3.5]),
      },
    ],
    // NOTE: All scores scaled from 0-100 to 0-10 (e.g. 68 → 6.8)
    kpiConfig: buildMockKpiConfig("Bronze", ["time_to_value", "onboarding"], {
      product_adoption: [6.8, 7.0, 7.2],
      value_realization: [6.4, 6.6, 6.4],
      engagement: [7.0, 6.8, 7.2],
      csat: [7.8, 7.4, 7.2],
      time_to_value: [6.2, 6.5, 6.8],
      onboarding: [7.5, 7.8, 8.0],
    }),
    healthCheckData: null,
  },
  {
    clientId: "globalbank-002",
    clientName: "Global Trust Bank",
    icnNumber: "ICN-EM-2003921",
    cmrNumber: "2000101",
    geo: "EMEA",
    market: "United Kingdom",
    tier: "Gold",
    contractValue: "$12.8M",
    contractPeriod: "Jul 2023 — Jun 2028",
    renewalDate: "Jun 30, 2028",
    daysToRenewal: 1140,
    products: ["IBM Z", "Cloud Pak for Integration", "watsonx.governance", "QRadar"],
    scores: { accountHealth: 91, renewalConfidence: 88, expansionPotential: 82, valueVisibility: 85 },
    executiveSummary: {
      summary:
        "Flagship Gold-tier engagement performing exceptionally. Strategic partnership extending beyond technology into joint go-to-market for financial-services regulatory tooling.",
      keyPoints: [
        "Highest CSAT in EMEA portfolio (9.1/10) for two consecutive quarters",
        "watsonx.governance deal closed Q4 — $2.3M expansion",
        "Joint customer reference for IBM Think 2026",
        "Multi-year roadmap aligned through 2028 renewal",
      ],
    },
    commercialSnapshot: {
      arr: "$12.8M",
      renewalDate: "Jun 30, 2028",
      daysToRenewal: 1140,
      renewalConfidence: "88% — Strong",
      expansionPipeline: "$3.4M",
      contractionRisk: "Low",
    },
    risks: [
      {
        severity: "Low",
        description: "EU Digital Operational Resilience Act (DORA) compliance deadline creates platform-change pressure.",
        mitigation: "Joint compliance workstream established; quarterly review with their CISO.",
        likelihood: 20,
        impact: 50,
        riskScore: 10,
      },
    ],
    productPortfolio: [
      {
        productName: "IBM Z",
        productId: "ibm-z",
        status: "Excellent",
        description: "Core banking mainframe — 100% uptime YTD.",
        adoptionKpiConfig: mockAdoptionHistory([8.5, 8.8, 9.1]),
      },
      {
        productName: "Cloud Pak for Integration",
        productId: "cloud-pak-integration",
        status: "Excellent",
        description: "Hybrid integration backbone.",
        adoptionKpiConfig: mockAdoptionHistory([8.0, 8.5, 8.8]),
      },
      {
        productName: "watsonx.governance",
        productId: "watsonx-governance",
        status: "Critical",
        description: "Newly deployed; governance framework being rolled out.",
        adoptionKpiConfig: mockAdoptionHistory([5.0, 6.0, 7.0]),
      },
      {
        productName: "QRadar",
        productId: "qradar",
        status: "Excellent",
        description: "SOC tooling — exceeding detection SLAs.",
        adoptionKpiConfig: mockAdoptionHistory([8.8, 9.0, 9.1]),
      },
    ],
    kpiConfig: buildMockKpiConfig(
      "Gold",
      [
        "time_to_value",
        "onboarding",
        "platform_reliability_confidence",
        "use_case_maturity",
        "change_readiness",
      ],
      {
        product_adoption: [8.8, 9.0, 9.1],
        value_realization: [9.0, 9.1, 9.2],
        engagement: [8.6, 8.8, 9.0],
        risk_awareness: [8.2, 8.5, 8.8],
        csat: [9.0, 9.1, 9.1],
        sla_compliance: [9.9, 9.9, 10.0],
        feature_adoption: [7.2, 7.8, 8.2],
        time_to_value: [8.0, 8.2, 8.5],
        onboarding: [9.0, 9.2, 9.4],
        platform_reliability_confidence: [9.6, 9.7, 9.8],
        use_case_maturity: [7.8, 8.2, 8.6],
        change_readiness: [8.4, 8.6, 8.8],
      }
    ),
    healthCheckData: null,
  },
  {
    clientId: "meditech-003",
    clientName: "MediTech Solutions APAC",
    icnNumber: "ICN-US-3007784",
    cmrNumber: "2000102",
    geo: "APAC",
    market: "Southeast Asia",
    tier: "Silver",
    contractValue: "$6.5M",
    contractPeriod: "Mar 2024 — Feb 2027",
    renewalDate: "Feb 28, 2027",
    daysToRenewal: 651,
    products: ["watsonx.ai", "Cloud Pak for Data", "Db2 Warehouse"],
    scores: { accountHealth: 81, renewalConfidence: 76, expansionPotential: 70, valueVisibility: 78 },
    executiveSummary: {
      summary:
        "Healthcare analytics partner with strong watsonx.ai adoption. Expansion potential in their Indonesia and Vietnam markets pending compliance review.",
      keyPoints: [
        "watsonx.ai powering clinical-decision support across 14 hospitals",
        "APAC regional expansion roadmap under joint development",
        "Compliance review for ID/VN markets in progress",
        "Q2 checkpoint scheduled June 18",
      ],
    },
    commercialSnapshot: {
      arr: "$6.5M",
      renewalDate: "Feb 28, 2027",
      daysToRenewal: 651,
      renewalConfidence: "76% — Good",
      expansionPipeline: "$1.8M",
      contractionRisk: "Low",
    },
    risks: [
      {
        severity: "Medium",
        description: "Regulatory compliance approvals for ID/VN markets delayed beyond original timeline.",
        mitigation: "Engaged IBM regional compliance counsel; bi-weekly checkpoints with customer legal team.",
        likelihood: 50,
        impact: 55,
        riskScore: 27,
      },
    ],
    productPortfolio: [
      {
        productName: "watsonx.ai",
        productId: "watsonx-ai",
        status: "Excellent",
        description: "Clinical decision support — 99.5% accuracy.",
        adoptionKpiConfig: mockAdoptionHistory([7.5, 7.8, 8.1]),
      },
      {
        productName: "Cloud Pak for Data",
        productId: "cloud-pak-data-med",
        status: "Critical",
        description: "Data fabric handling 8TB ingestion/day.",
        adoptionKpiConfig: mockAdoptionHistory([5.5, 5.8, 6.0]),
      },
      {
        productName: "Db2 Warehouse",
        productId: "db2-warehouse",
        status: "Pilot",
        description: "New deployment in pilot phase across 3 hospitals.",
        adoptionKpiConfig: mockAdoptionHistory([3.0, 4.0, 4.5]),
      },
    ],
    kpiConfig: buildMockKpiConfig(
      "Silver",
      ["time_to_value", "onboarding", "platform_reliability_confidence", "use_case_maturity"],
      {
        product_adoption: [7.6, 7.8, 8.1],
        value_realization: [7.8, 8.0, 8.1],
        engagement: [7.4, 7.6, 7.8],
        risk_awareness: [8.0, 8.2, 8.4],
        csat: [8.2, 8.4, 8.5],
        time_to_value: [7.0, 7.3, 7.6],
        onboarding: [8.2, 8.5, 8.8],
        platform_reliability_confidence: [9.2, 9.4, 9.5],
        use_case_maturity: [6.8, 7.2, 7.5],
      }
    ),
    healthCheckData: null,
  },
];

export const findClient = (id: string) => MOCK_CLIENTS.find((c) => c.clientId === id);

export function getKPIByDefinition(client: Client, kpi: KPIDefinition) {
  return client.kpiConfig.find((c) => c.kpiId === kpi.kpiId);
}