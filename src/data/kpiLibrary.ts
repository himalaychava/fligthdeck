import type { Client } from "@/data/clients";

export type KPIDataSource = "manual" | "csat" | "computed";
export type KPITierLock = "Bronze" | "Silver" | "Gold" | "All";
export type KPIAvailability = "required" | "rotational";

export interface KPIScoringBand {
  range: string;       // e.g. "1-2"
  description: string; // Descriptive text for this score band
}

export interface KPIScoringGuidance {
  /** Guiding question the TAM should answer when scoring. */
  question: string;
  /** Ordered scoring bands from lowest (1-2) to highest (9-10). */
  bands: KPIScoringBand[];
}

export interface KPIDefinition {
  kpiId: string;
  label: string;
  unit: string;
  icon: string;
  description: string;
  thresholds: { excellent: number; good: number; watch: number };
  lowerIsBetter?: boolean;
  dataSource: KPIDataSource;
  externalVisible: boolean;
  tierLock: KPITierLock;
  availability: KPIAvailability;
  /** Weight for future portfolio score calculation (0 = not used yet). */
  weight: number;
  /**
   * Scoring guidance for TAMs — descriptive bands to help calibrate scores
   * consistently. Undefined for KPIs where guidance hasn't been defined yet.
   */
  scoringGuidance?: KPIScoringGuidance;
}

/** Sheet order — flat list in Configure KPI (no category grouping). */
export const KPI_LIBRARY: KPIDefinition[] = [
  {
    kpiId: "product_adoption",
    label: "Product Adoption",
    unit: "/10",
    icon: "ChartBar",
    description:
      "The extent the client is actively using the solution across users, teams, and use cases.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: true,
    tierLock: "Bronze",
    availability: "required",
    weight: 0.2,
    scoringGuidance: {
      question: "What is the level of product adoption across users, teams and use cases?",
      bands: [
        {
          range: "1-2",
          description: "Product is not actively in-use by client teams.",
        },
        {
          range: "3-4",
          description:
            "Product is in-use, small set of users OR product is out of support. Users are early adopters.",
        },
        {
          range: "5-6",
          description:
            "Product is actively used, but full adoption is still in-progress. Product advocates exist in client team.",
        },
        {
          range: "7-8",
          description:
            "Product is actively used across different business functions (workflows/use cases).",
        },
        {
          range: "9-10",
          description:
            "Client is actively engaged with IBM about new product features and new opportunities for use cases.",
        },
      ],
    },
  },
  {
    kpiId: "value_realization",
    label: "Value Realization",
    unit: "/10",
    icon: "Growth",
    description: "How much the expected business value has been delivered.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: true,
    tierLock: "Bronze",
    availability: "required",
    weight: 0.2,
    scoringGuidance: {
      question: "Does the client perceive value from the project/service?",
      bands: [
        {
          range: "1-2",
          description:
            "Value is unclear, or the product currently is not aligned with client priorities.",
        },
        {
          range: "3-4",
          description:
            "Value areas are known, but targets and roadmap may not be met or completed.",
        },
        {
          range: "5-6",
          description:
            "Use cases are active and early ROI exists, but full value realization is still in progress.",
        },
        {
          range: "7-8",
          description: "Agreed value outcomes are being achieved with measurable value.",
        },
        {
          range: "9-10",
          description:
            "Value realization has been exceeded. The service has identified additional value opportunities OR client stakeholders recognize the impact.",
        },
      ],
    },
  },
  {
    kpiId: "engagement",
    label: "Engagement",
    unit: "/10",
    icon: "Events",
    description: "Strength, frequency, and quality of interactions with the client.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: true,
    tierLock: "Bronze",
    availability: "required",
    weight: 0.1,
    scoringGuidance: {
      question: "What is the engagement level of the customer?",
      bands: [
        {
          range: "1-2",
          description:
            "Client is unresponsive, meetings are being missed, or IBM lacks access to the relevant stakeholders.",
        },
        {
          range: "3-4",
          description: "Client engages reactively, when prompted, or when issues occur.",
        },
        {
          range: "5-6",
          description: "Client attends regular engagements, discusses active projects.",
        },
        {
          range: "7-8",
          description:
            "Client actively participates, prioritizes, follows through on actions, uses IBM expertise.",
        },
        {
          range: "9-10",
          description:
            "Client treats IBM as a trusted advisor, engages across multiple stakeholders, co-creates with IBM Expert for future plans.",
        },
      ],
    },
  },
  {
    kpiId: "risk_awareness",
    label: "Risk Awareness",
    unit: "/10",
    icon: "Warning",
    description:
      "Overall level of risk to value realization, adoption, or other client focuses.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: false,
    tierLock: "Silver",
    availability: "required",
    weight: 0.1,
    scoringGuidance: {
      question: "What is the level of risk awareness of the client and delivery team?",
      bands: [
        {
          range: "1-2",
          description: "Risks have not been identified, lack of visibility into risks.",
        },
        {
          range: "3-4",
          description: "Risks have been identified, but no mitigation plans in place.",
        },
        {
          range: "5-6",
          description: "Risks have been identified, but mitigation is mostly reactive.",
        },
        {
          range: "7-8",
          description: "Risks are identified proactively and mitigation plans are in progress.",
        },
        {
          range: "9-10",
          description:
            "IBM Expert and Client actively anticipate and identify future risks and work together on mitigation plans on a regular basis.",
        },
      ],
    },
  },
  {
    kpiId: "time_to_value",
    label: "Time to Value",
    unit: "/10",
    icon: "TimePlot",
    description: "Progress toward delivering client value relative to the project expectation.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: true,
    tierLock: "Bronze",
    availability: "rotational",
    weight: 0.1,
    scoringGuidance: {
      question: "How is the progress towards delivering value relative to project expectations?",
      bands: [
        {
          range: "1-2",
          description:
            "No deliverables/activities/backlog in place, no milestones identified for the engagement.",
        },
        {
          range: "3-4",
          description: "Initiatives delayed/blocked due to various issues.",
        },
        {
          range: "5-6",
          description: "Project deliverables on track/in-progress.",
        },
        {
          range: "7-8",
          description: "Project milestones achieved.",
        },
        {
          range: "9-10",
          description:
            "Project milestones achieved and IBM and client are identifying additional value opportunities.",
        },
      ],
    },
  },
  {
    kpiId: "platform_reliability_confidence",
    label: "Platform Reliability Confidence",
    unit: "/10",
    icon: "Activity",
    description: "Confidence that the platform is stable and supporting client needs.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: true,
    tierLock: "Silver",
    availability: "rotational",
    weight: 0.1,
    scoringGuidance: {
      question: "How would you rate the platform's reliability and your confidence that it is stable and effectively supporting current business/client needs?",
      bands: [
        {
          range: "1-2",
          description: "Environment reliability is unknown or very low; platform may be approaching End of Support (EOS).",
        },
        {
          range: "3-4",
          description: "Platform is unstable with known reliability or performance issues impacting operations.",
        },
        {
          range: "5-6",
          description: "Platform is generally trending toward stability, but current limitations or risks still exist.",
        },
        {
          range: "7-8",
          description: "Platform is reliable and effectively supporting current workloads and business needs.",
        },
        {
          range: "9-10",
          description: "Platform is highly resilient, consistently reliable, and fully prepared for peak or future workloads.",
        },
      ],
    },
  },
  {
    kpiId: "use_case_maturity",
    label: "Use Case Maturity",
    unit: "/10",
    icon: "Application",
    description: "How well-defined, implemented, and operational the client use cases are.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: true,
    tierLock: "Silver",
    availability: "rotational",
    weight: 0.1,
    scoringGuidance: {
      question: "How would you rate the maturity of the identified use cases in terms of definition, implementation, and business operational utilization?",
      bands: [
        {
          range: "1-2",
          description: "No use cases or business objectives have been defined.",
        },
        {
          range: "3-4",
          description: "Use cases have been identified, but implementation has not yet started.",
        },
        {
          range: "5-6",
          description: "Use cases are being piloted or are actively in progress.",
        },
        {
          range: "7-8",
          description: "Use cases are live/deployed and delivering the expected business outcomes.",
        },
        {
          range: "9-10",
          description: "Client teams are proactively identifying opportunities to expand, optimize, and enhance existing use cases.",
        },
      ],
    },
  },
  {
    kpiId: "onboarding",
    label: "Onboarding",
    unit: "/10",
    icon: "UserFollow",
    description: "Completion and effectiveness of initial onboarding activities.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: true,
    tierLock: "Bronze",
    availability: "rotational",
    weight: 0.1,
    // scoringGuidance: to be added when criteria are provided
  },
  {
    kpiId: "change_readiness",
    label: "Change Readiness",
    unit: "/10",
    icon: "Renew",
    description: "Client's ability and willingness to expand or evolve usage.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: false,
    tierLock: "Silver",
    availability: "rotational",
    weight: 0.1,
    scoringGuidance: {
      question: "What is the client's readiness to expand or evolve usage?",
      bands: [
        {
          range: "1-2",
          description: "Client is resistant to change (for e.g. - end of support but not wanting to upgrade)",
        },
        {
          range: "3-4",
          description: "Client has limited ability to improve/adapt/transform.",
        },
        {
          range: "5-6",
          description: "Client can change/transform with direct IBM involvement, but not yet proactive.",
        },
        {
          range: "7-8",
          description: "Client adopts IBM recommendations when provided without resistance.",
        },
        {
          range: "9-10",
          description: "Client is adaptive, proactively interested in continuous improvement opportunities.",
        },
      ],
    },
  },
  {
    kpiId: "ai_maturity",
    label: "AI Maturity",
    unit: "/10",
    icon: "WatsonHealth3DCurveAutoColon",
    description: "Client's ability to identify and operationalise AI automation",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: false,
    tierLock: "Silver",
    availability: "rotational",
    weight: 0.1,
    scoringGuidance: {
      question: "What is the client's ability to identify and operationalise AI automation?",
      bands: [
        {
          range: "1-2",
          description: "No meaningful AI or automation activity, or no use of product AI features",
        },
        {
          range: "3-4",
          description: "Client and IBM have identified opportunities but limited execution",
        },
        {
          range: "5-6",
          description: "AI automation use cases are being built, piloted, tested or product AI features are being used",
        },
        {
          range: "7-8",
          description: "AI use cases are in production delivering outcomes",
        },
        {
          range: "9-10",
          description: "AI is embedded in client workflows and driving transformation.",
        },
      ],
    },
  },
  {
    kpiId: "service_utilization",
    label: "Service Utilization",
    unit: "/10",
    icon: "DataVis_4",
    description: "Measures the extent the client is consuming/utilising the service",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "manual",
    externalVisible: false,
    tierLock: "Silver",
    availability: "rotational",
    weight: 0.1,
    scoringGuidance: {
      question: "What is the extent the client is consuming/utilising the service?",
      bands: [
        {
          range: "1-2",
          description: "Client rarely engages, IBM input isnt considered in operations or decision-making.",
        },
        {
          range: "3-4",
          description: "Client uses the service reactively, occasional use for specific requests.",
        },
        {
          range: "5-6",
          description: "Client consumes the service not consistently, passively receptive to guidance",
        },
        {
          range: "7-8",
          description: "Client consistently utilises and relies on IBM service/expertise",
        },
        {
          range: "9-10",
          description: "IBM service is deeply integrated in client operations and decision-making.",
        },
      ],
    },
  },
  {
    kpiId: "sla_compliance",
    label: "SLO Compliance",
    unit: "/10",
    icon: "Certificate",
    description: "Percentage of SLO obligations met in the measurement period.",
    thresholds: { excellent: 9.5, good: 9.0, watch: 8.0 },
    dataSource: "manual",
    externalVisible: true,
    tierLock: "Gold",
    availability: "required",
    weight: 0.1,
    // scoringGuidance: to be added when criteria are provided
  },
  {
    kpiId: "feature_adoption",
    label: "Feature Adoption",
    unit: "/10",
    icon: "ChartLine",
    description: "Adoption rate of new features released in the past quarter.",
    thresholds: { excellent: 7.5, good: 5.5, watch: 3.5 },
    dataSource: "manual",
    externalVisible: true,
    tierLock: "Gold",
    availability: "required",
    weight: 0.1,
    // scoringGuidance: to be added when criteria are provided
  },
  {
    kpiId: "csat",
    label: "Client Sentiment",
    unit: "/10",
    icon: "FaceActivated",
    description: "How satisfied are they with the services they are receiving",
    thresholds: { excellent: 8.5, good: 7.0, watch: 5.5 },
    // Changed to "manual" — TAMs now record CSAT via per-tile checkpoint like all other KPIs
    dataSource: "manual",
    externalVisible: true,
    tierLock: "All",
    availability: "required",
    weight: 0,
    scoringGuidance: {
      question: "How satisfied are they with the services they are receiving?",
      bands: [
        {
          range: "1-2",
          description: "There is frequent/ongoing escalations, customer is vocal and highly dissatisfied.",
        },
        {
          range: "3-4",
          description: "There are ongoing challenges, they are somewhat dissatisfied.",
        },
        {
          range: "5-6",
          description: "Customer is mostly satisfied with ongoing concerns being addressed regularly.",
        },
        {
          range: "7-8",
          description: "Customer is generally satisfied with the service.",
        },
        {
          range: "9-10",
          description: "Customer is happy with the service, evidenced from feedback/ratings/survey results.",
        },
      ],
    },
  },
  {
    kpiId: "account_health",
    label: "Account Health",
    unit: "/10",
    icon: "Health",
    description: "Overall health score of the client account.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "computed",
    externalVisible: true,
    tierLock: "All",
    availability: "required",
    weight: 0,
  },
  {
    kpiId: "renewal_confidence",
    label: "Renewal Confidence",
    unit: "%",
    icon: "Renew",
    description: "Confidence level in client renewal.",
    thresholds: { excellent: 80.0, good: 60.0, watch: 40.0 },
    dataSource: "computed",
    externalVisible: false,
    tierLock: "All",
    availability: "required",
    weight: 0,
  },
  {
    kpiId: "expansion_potential",
    label: "Expansion Potential",
    unit: "/10",
    icon: "Growth",
    description: "Potential for account expansion and upsell opportunities.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "computed",
    externalVisible: false,
    tierLock: "All",
    availability: "required",
    weight: 0,
  },
  {
    kpiId: "value_visibility",
    label: "Value Visibility",
    unit: "/10",
    icon: "View",
    description: "Visibility and recognition of value delivered to the client.",
    thresholds: { excellent: 8.0, good: 6.0, watch: 4.0 },
    dataSource: "computed",
    externalVisible: true,
    tierLock: "All",
    availability: "required",
    weight: 0,
  },
  {
    kpiId: "nps",
    label: "NPS Score",
    unit: "/10",
    icon: "ThumbsUp",
    description: "Net Promoter Score measuring client loyalty and satisfaction.",
    thresholds: { excellent: 7.0, good: 5.0, watch: 3.0 },
    dataSource: "manual",
    externalVisible: true,
    tierLock: "All",
    availability: "required",
    weight: 0,
  },
];

export const KPI_LIBRARY_BY_ID = new Map(KPI_LIBRARY.map((k) => [k.kpiId, k]));

export type KPIStatus = "excellent" | "good" | "watch" | "critical" | "pending";

export function getKpiDefinition(kpiId: string): KPIDefinition | undefined {
  return KPI_LIBRARY_BY_ID.get(kpiId);
}

export function scoreStatus(kpi: KPIDefinition, value: number | null): KPIStatus {
  if (value === null || value === undefined) return "pending";
  const t = kpi.thresholds;
  if (kpi.lowerIsBetter) {
    if (value <= t.excellent) return "excellent";
    if (value <= t.good) return "good";
    if (value <= t.watch) return "watch";
    return "critical";
  }
  if (value >= t.excellent) return "excellent";
  if (value >= t.good) return "good";
  if (value >= t.watch) return "watch";
  return "critical";
}

/**
 * Input bounds for checkpoint entry.
 * All KPIs now use a 0–10 scale (converted to % for display).
 * Decimal values are permitted (e.g. 5.2 = 52%).
 */
export function kpiScoreInputBounds(_kpi: KPIDefinition): {
  min: number;
  max: number;
  step: number;
} {
  return { min: 0, max: 10, step: 0.1 };
}

/**
 * Convert a stored 0–10 value to a display percentage string.
 * e.g. 7.2 → "72%", 5.25 → "52.5%"
 */
export function kpiValueToPercent(value: number): string {
  const pct = value * 10;
  // Show 1 decimal only when needed
  const formatted = Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1);
  return `${formatted}%`;
}

/**
 * Future weighted portfolio score — uses KPI weights; skips weight 0.
 */
export function computeWeightedKpiScore(client: Client, kpiIds: string[]): number | null {
  let weightSum = 0;
  let weighted = 0;

  for (const kpiId of kpiIds) {
    const def = getKpiDefinition(kpiId);
    if (!def || def.weight <= 0) continue;
    const cfg = (client.kpiConfig ?? []).find((c) => c.kpiId === kpiId);
    if (!cfg?.history.length) continue;
    const sorted = [...cfg.history].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1]?.value;
    if (latest == null || !Number.isFinite(latest)) continue;
    weighted += latest * def.weight;
    weightSum += def.weight;
  }

  if (weightSum <= 0) return null;
  return Math.round((weighted / weightSum) * 10) / 10;
}

/** Rows for Excel KPILibrary sheet — includes scoring guidance columns. */
export function kpiLibrarySheetRows(): Record<string, unknown>[] {
  return KPI_LIBRARY.map((k) => ({
    kpi_id: k.kpiId,
    label: k.label,
    tier_lock: k.tierLock,
    weight: k.weight,
    availability: k.availability,
    description: k.description,
    unit: k.unit,
    data_source: k.dataSource,
    external_visible: k.externalVisible ? "Y" : "N",
    scoring_question: k.scoringGuidance?.question ?? "",
    scoring_band_1_2: k.scoringGuidance?.bands[0]?.description ?? "",
    scoring_band_3_4: k.scoringGuidance?.bands[1]?.description ?? "",
    scoring_band_5_6: k.scoringGuidance?.bands[2]?.description ?? "",
    scoring_band_7_8: k.scoringGuidance?.bands[3]?.description ?? "",
    scoring_band_9_10: k.scoringGuidance?.bands[4]?.description ?? "",
  }));
}
