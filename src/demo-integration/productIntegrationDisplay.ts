import type { ProductRiskIntelligence, ProductHealth, ProductStabilityMetric, ProductPerformanceMetric, ProductRecommendation } from "@/data/clients";
import { withRiskLevelFromScore } from "@/lib/riskLevel";

export const LIVE_NO_DATA = "No data";

export interface ProductDisplayMetrics {
  healthPercent: string | number;
  checksDisplay: { value: string | number; unit: string };
  dataThroughput: string;
  totalTickets: string | number;
  escalations: string | number;
  avgResolution: string;
  chartData: { month: string; Cases: number }[];
  hasCaseVolume: boolean;
  healthCheck: {
    required: boolean;
    finishedCount: number | null;
    lastCheck: string;
    nextCheck: string;
  };
  risks: ProductRiskIntelligence[];
  stability: ProductStabilityMetric[];
  performance: ProductPerformanceMetric[];
  recommendations: ProductRecommendation[];
}

const getHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

const mockHealthPercentage = (status: string, name: string): number => {
  const h = getHash(name);
  switch (status) {
    case "Excellent":
      return 95 + (h % 5);
    case "Good":
      return 85 + (h % 8);
    case "Watch":
      return 58 + (h % 15);
    case "Critical":
      return 28 + (h % 18);
    case "Pilot":
      return 78 + (h % 7);
    default:
      return 80 + (h % 10);
  }
};

const mockDataUsage = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes("db2") && lower.includes("warehouse")) return "950 GB/day";
  if (lower.includes("db2")) return "1.2 TB/day";
  if (lower.includes("guardium")) return "450 GB/day";
  if (lower.includes("watsonx.ai")) return "5.2 TB/day";
  if (lower.includes("watsonx") && lower.includes("assistant")) return "850 GB/day";
  if (lower.includes("watsonx") && lower.includes("governance")) return "1.1 TB/day";
  if (lower.includes("pak for data")) return "2.4 TB/day";
  if (lower.includes("pak for integration")) return "3.1 TB/day";
  if (lower.includes("z")) return "15.0 TB/day";
  if (lower.includes("qradar")) return "4.5 TB/day";
  const h = getHash(name);
  return `${(((h % 80) + 10) / 10).toFixed(1)} ${h % 2 === 0 ? "TB" : "GB"}/day`;
};

const mockTickets = (status: string, name: string): number => {
  const h = getHash(name);
  let base = 10 + (h % 15);
  if (status === "Watch") base += 15;
  if (status === "Critical") base += 35;
  return base;
};

const mockEscalations = (status: string, name: string): number => {
  const h = getHash(name);
  if (status === "Critical") return 2 + (h % 3);
  if (status === "Watch") return 1 + (h % 2);
  if (status === "Excellent") return 0;
  return h % 2;
};

const mockAvgResolution = (status: string, name: string): string => {
  const h = getHash(name);
  switch (status) {
    case "Excellent":
      return `${(1.2 + (h % 10) / 10).toFixed(1)} hrs`;
    case "Good":
      return `${(2.0 + (h % 15) / 10).toFixed(1)} hrs`;
    case "Watch":
      return `${(4.5 + (h % 30) / 10).toFixed(1)} hrs`;
    case "Critical":
      return `${(10.0 + (h % 50) / 10).toFixed(1)} hrs`;
    case "Pilot":
      return `${(1.5 + (h % 10) / 10).toFixed(1)} hrs`;
    default:
      return `${(3.0 + (h % 20) / 10).toFixed(1)} hrs`;
  }
};

const mockCaseVolumeHistory = (status: string, name: string, totalTickets: number) => {
  const h = getHash(name);
  const months = ["Dec", "Jan", "Feb", "Mar", "Apr", "May"];
  const base = Math.max(1, Math.floor(totalTickets / 6));
  const rem = totalTickets % 6;
  const vars = [-Math.min(2, base - 1), Math.min(1, base), 0, Math.min(2, base), -Math.min(1, base - 1), 0];
  return months.map((month, idx) => {
    let val = base + vars[(h + idx) % vars.length];
    if (idx === 0) val += rem;
    return { month, Cases: Math.max(0, Math.min(val, totalTickets)) };
  });
};

const mockHealthCheck = (status: string, name: string) => {
  if (status === "Pilot" || name.toLowerCase().includes("assistant")) {
    return { required: false, finishedCount: 0, lastCheck: "", nextCheck: "" };
  }
  if (status === "Excellent")
    return {
      required: true,
      finishedCount: 3,
      lastCheck: "12/04/2026 at 09:30 AM",
      nextCheck: "12/10/2026 at 09:30 AM",
    };
  if (status === "Good")
    return {
      required: true,
      finishedCount: 2,
      lastCheck: "20/04/2026 at 02:00 PM",
      nextCheck: "20/10/2026 at 02:00 PM",
    };
  if (status === "Watch")
    return {
      required: true,
      finishedCount: 2,
      lastCheck: "05/05/2026 at 11:15 AM",
      nextCheck: "05/06/2026 at 11:15 AM",
    };
  if (status === "Critical")
    return {
      required: true,
      finishedCount: 1,
      lastCheck: "10/05/2026 at 09:00 AM",
      nextCheck: "25/05/2026 at 09:00 AM",
    };
  return {
    required: true,
    finishedCount: 2,
    lastCheck: "15/04/2026 at 10:00 AM",
    nextCheck: "15/10/2026 at 10:00 AM",
  };
};

const mockRiskFactors = (status: string, name: string): ProductRiskIntelligence[] => {
  const lower = name.toLowerCase();
  if (lower.includes("db2") && !lower.includes("warehouse")) {
    return [
      {
        level: "HIGH",
        title: "Compliance Exposure",
        description:
          "Sensitive financial datasets remain partially unencrypted on object storage.",
        score: 84,
      },
      {
        level: "MEDIUM",
        title: "API Saturation",
        description: "API Gateway nearing threshold during peak customer sync traffic.",
        score: 61,
      },
      {
        level: "LOW",
        title: "Minor Certificate Expiry",
        description: "Secondary sandbox TLS certificate expires within the next 45 days.",
        score: 25,
      },
    ];
  }
  if (status === "Critical")
    return [
      {
        level: "CRITICAL",
        title: "Unpatched Vulnerabilities",
        description: "17 production systems exceeded remediation SLA thresholds.",
        score: 92,
      },
      {
        level: "HIGH",
        title: "Database Contention",
        description: "Transaction write locks causing transaction queuing on primary DB nodes.",
        score: 81,
      },
    ];
  if (status === "Watch")
    return [
      {
        level: "HIGH",
        title: "Network Latency Spikes",
        description: "Core network switch queues showing packet discard drops under peak workload.",
        score: 78,
      },
      {
        level: "MEDIUM",
        title: "Access Policy Drift",
        description: "Stale user accounts retaining authorization privileges on test servers.",
        score: 55,
      },
    ];
  if (status === "Good")
    return [
      {
        level: "MEDIUM",
        title: "Resource Exhaustion",
        description: "Memory utilization exceeds 85% on dev staging nodes during daily build cycles.",
        score: 58,
      },
      {
        level: "LOW",
        title: "Backup Delay Warning",
        description: "Daily backups taking 20% longer to complete due to file count inflation.",
        score: 30,
      },
    ];
  if (status === "Excellent")
    return [
      {
        level: "LOW",
        title: "Package Deprecations",
        description: "Minor dependency updates recommended for two package modules.",
        score: 12,
      },
      {
        level: "LOW",
        title: "Logging Verbosity Drift",
        description: "Debug mode active on staging environment causing storage logs inflation.",
        score: 18,
      },
    ];
  return [
    {
      level: "MEDIUM",
      title: "Experimental Integration Scope",
      description: "Trial integration features enabled for public developer sandbox group.",
      score: 42,
    },
    {
      level: "LOW",
      title: "Untrusted Sandbox Integration",
      description: "Sandbox webhook events lack payload signature verification rules.",
      score: 28,
    },
  ];
};

function liveOrNoData<T>(value: T | null | undefined, formatter?: (v: T) => string | number): string | number {
  if (value == null || value === "") return LIVE_NO_DATA;
  return formatter ? formatter(value) : (value as string | number);
}

function buildChecksDisplay(
  required: boolean,
  finished: number | null
): { value: string | number; unit: string } {
  if (!required) return { value: "—", unit: "" };
  if (finished == null) return { value: LIVE_NO_DATA, unit: "" };
  return { value: finished, unit: " checks" };
}

export function resolveProductDisplay(
  product: ProductHealth,
  isDemoLive: boolean
): ProductDisplayMetrics {
  const { productName, status } = product;

  if (!isDemoLive) {
    const totalTickets = mockTickets(status, productName);
    const healthCheck = mockHealthCheck(status, productName);
    return {
      healthPercent: mockHealthPercentage(status, productName),
      checksDisplay: healthCheck.required
        ? { value: healthCheck.finishedCount, unit: " checks" }
        : { value: "—", unit: "" },
      dataThroughput: mockDataUsage(productName),
      totalTickets,
      escalations: mockEscalations(status, productName),
      avgResolution: mockAvgResolution(status, productName),
      chartData: mockCaseVolumeHistory(status, productName, totalTickets),
      hasCaseVolume: true,
      healthCheck,
      risks: mockRiskFactors(status, productName).map(withRiskLevelFromScore),
      stability: [],
      performance: [],
      recommendations: [],
    };
  }

  const live = product.liveIntegration;
  const hc = live?.healthCheck ?? { required: false, finishedCount: null, lastCheck: null, nextCheck: null };
  const checksFinished =
    hc.finishedCount ?? live?.checksFinished ?? null;

  return {
    healthPercent: liveOrNoData(live?.healthPercent),
    checksDisplay: buildChecksDisplay(hc.required, checksFinished),
    dataThroughput: liveOrNoData(live?.dataThroughput) as string,
    totalTickets: liveOrNoData(live?.totalTickets),
    escalations: liveOrNoData(live?.escalations),
    avgResolution: liveOrNoData(live?.avgResolution) as string,
    chartData: (live?.caseVolume ?? []).map((row) => ({ month: row.month, Cases: row.cases })),
    hasCaseVolume: (live?.caseVolume?.length ?? 0) > 0,
    healthCheck: {
      required: hc.required,
      finishedCount: checksFinished,
      lastCheck: hc.lastCheck || LIVE_NO_DATA,
      nextCheck: hc.nextCheck || LIVE_NO_DATA,
    },
    risks: (live?.riskIntelligence ?? []).map(withRiskLevelFromScore),
    stability: live?.stability ?? [],
    performance: live?.performance ?? [],
    recommendations: live?.recommendations ?? [],
  };
}

export function isNumericDisplay(value: string | number): value is number {
  return typeof value === "number";
}
