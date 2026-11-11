/**
 * Generates public/data/control_plane_demo.xlsx and control_plane_demo.json
 * Run: node scripts/generate-demo-data.mjs
 */
import * as XLSX from "xlsx";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public/data");
mkdirSync(outDir, { recursive: true });

const MONTHS = ["Dec", "Jan", "Feb", "Mar", "Apr", "May"];

/** @typedef {{ productId: string; name: string; status: string; description: string; healthPercent: number; throughput: string; tickets: number; escalations: number; avgResolution: string; risks?: { level: string; title: string; description: string; score: number }[] }} ProductDef */

/**
 * @typedef {{
 *   clientId: string;
 *   clientName: string;
 *   geo: string;
 *   market: string;
 *   tier: string;
 *   contractValue: number;
 *   contractStart: string;
 *   contractEnd: string;
 *   renewalDate: string;
 *   accountHealth: number;
 *   renewalConfidence: number;
 *   expansionPotential: number;
 *   valueVisibility: number;
 *   executiveSummary: string;
 *   contractionRisk: string;
 *   expansionPipeline: number;
 *   keyPoints: string[];
 *   accountRisks: { severity: string; description: string; mitigation: string; likelihood: number; impact: number }[];
 *   products: ProductDef[];
 *   team: { name: string; role: string; assignment: string; email: string; phone: string }[];
 *   kpis: { kpiId: string; score: number; notes: string }[];
 * }} ClientDef
 */

/** @type {ClientDef[]} */
const CLIENT_DEFS = [
  {
    clientId: "verizon-001",
    clientName: "Verizon",
    geo: "Americas",
    market: "United States",
    tier: "Bronze",
    contractValue: 4200000,
    contractStart: "01/01/2024",
    contractEnd: "31/12/2026",
    renewalDate: "31/12/2026",
    accountHealth: 72,
    renewalConfidence: 68,
    expansionPotential: 55,
    valueVisibility: 64,
    executiveSummary:
      "Verizon is in a steady-state engagement with healthy platform availability but signs of churn risk in their analytics workload.",
    contractionRisk: "Low-Moderate",
    expansionPipeline: 1100000,
    keyPoints: [
      "Platform availability holding above 99.2% over the last quarter",
      "Analytics workload utilisation declined 12% — investigation underway",
      "Renewal conversation initiated 9 months early to address pricing concerns",
    ],
    accountRisks: [
      {
        severity: "MEDIUM",
        description: "Analytics workload utilisation declined 12% QoQ — suggests potential workload migration.",
        mitigation: "TAM scheduled deep-dive workshop with Verizon Data Platform team.",
        likelihood: 45,
        impact: 65,
      },
      {
        severity: "LOW",
        description: "Renewal pricing pushback from procurement during Q1 budget review.",
        mitigation: "Joint business case in development with Sales.",
        likelihood: 30,
        impact: 70,
      },
    ],
    products: [
      {
        productId: "vz-db2",
        name: "IBM Db2",
        status: "EXCELLENT",
        description: "Powers core billing platform. 99.97% uptime YTD.",
        healthPercent: 99,
        throughput: "1.2 TB/day",
        tickets: 24,
        escalations: 0,
        avgResolution: "1.6 hrs",
        risks: [
          { level: "HIGH", title: "Compliance Exposure", description: "Sensitive financial datasets remain partially unencrypted on object storage.", score: 84 },
          { level: "MEDIUM", title: "API Saturation", description: "API Gateway nearing threshold during peak customer sync traffic.", score: 61 },
        ],
      },
      {
        productId: "vz-watsonx-assistant",
        name: "watsonx Assistant",
        status: "GOOD",
        description: "Customer service deployment handling 1.2M calls/mo.",
        healthPercent: 87,
        throughput: "850 GB/day",
        tickets: 18,
        escalations: 1,
        avgResolution: "2.4 hrs",
        risks: [
          { level: "MEDIUM", title: "Resource Exhaustion", description: "Memory utilization exceeds 85% on dev staging nodes.", score: 58 },
        ],
      },
      {
        productId: "vz-cpd",
        name: "Cloud Pak for Data",
        status: "CRITICAL",
        description: "Utilisation down — workshop scheduled to re-engage.",
        healthPercent: 32,
        throughput: "2.4 TB/day",
        tickets: 42,
        escalations: 4,
        avgResolution: "11.2 hrs",
        risks: [
          { level: "CRITICAL", title: "Unpatched Vulnerabilities", description: "17 production systems exceeded remediation SLA thresholds.", score: 92 },
        ],
      },
      {
        productId: "vz-guardium",
        name: "Guardium DS",
        status: "GOOD",
        description: "Data security monitoring across billing and CRM estates.",
        healthPercent: 91,
        throughput: "450 GB/day",
        tickets: 11,
        escalations: 0,
        avgResolution: "2.1 hrs",
        risks: [{ level: "LOW", title: "Package Deprecations", description: "Minor dependency updates recommended.", score: 12 }],
      },
    ],
    team: [
      { name: "Sarah Jenkins", role: "Project Manager", assignment: "Account Level", email: "sjenkins@ibm.com", phone: "+1 (555) 019-2834" },
      { name: "Michael Chang", role: "Primary TAM", assignment: "Account Level", email: "mchang@ibm.com", phone: "+1 (555) 014-9821" },
      { name: "David Miller", role: "Delivery Consultant", assignment: "IBM Db2", email: "dmiller@ibm.com", phone: "+1 (555) 017-8822" },
    ],
    kpis: [
      { kpiId: "platform_availability", score: 99.2, notes: "Q1 checkpoint — strong performance" },
      { kpiId: "renewal_confidence", score: 68, notes: "TAM assessment — on track with caveats" },
      { kpiId: "account_health", score: 72, notes: "Composite health score" },
      { kpiId: "value_visibility", score: 64, notes: "Executive briefing cadence improving" },
    ],
  },
  {
    clientId: "globalbank-002",
    clientName: "Global Trust Bank",
    geo: "EMEA",
    market: "United Kingdom",
    tier: "Gold",
    contractValue: 12800000,
    contractStart: "01/07/2023",
    contractEnd: "30/06/2028",
    renewalDate: "30/06/2028",
    accountHealth: 91,
    renewalConfidence: 88,
    expansionPotential: 82,
    valueVisibility: 85,
    executiveSummary:
      "Flagship Gold-tier engagement — highest CSAT in EMEA portfolio with multi-year roadmap through 2028.",
    contractionRisk: "Low",
    expansionPipeline: 3400000,
    keyPoints: [
      "Highest CSAT in EMEA (9.1/10) for two consecutive quarters",
      "watsonx.governance deal closed Q4 — €2.3M expansion",
      "Joint customer reference planned for IBM Think 2026",
    ],
    accountRisks: [
      {
        severity: "LOW",
        description: "DORA compliance deadline creates platform-change pressure",
        mitigation: "Joint compliance workstream with quarterly CISO review",
        likelihood: 20,
        impact: 50,
      },
    ],
    products: [
      {
        productId: "gb-ibm-z",
        name: "IBM Z",
        status: "EXCELLENT",
        description: "Core banking mainframe — 100% uptime YTD",
        healthPercent: 100,
        throughput: "15.0 TB/day",
        tickets: 8,
        escalations: 0,
        avgResolution: "1.1 hrs",
        risks: [{ level: "LOW", title: "Logging Verbosity Drift", description: "Debug mode active on staging environment.", score: 18 }],
      },
      {
        productId: "gb-cp4i",
        name: "Cloud Pak for Integration",
        status: "EXCELLENT",
        description: "Hybrid integration backbone for payments rail",
        healthPercent: 96,
        throughput: "3.1 TB/day",
        tickets: 14,
        escalations: 0,
        avgResolution: "1.8 hrs",
      },
      {
        productId: "gb-wx-governance",
        name: "watsonx.governance",
        status: "GOOD",
        description: "Governance framework rollout in progress across EU entities",
        healthPercent: 84,
        throughput: "1.1 TB/day",
        tickets: 19,
        escalations: 1,
        avgResolution: "3.2 hrs",
        risks: [{ level: "MEDIUM", title: "Policy Drift", description: "Stale user accounts on test servers.", score: 55 }],
      },
      {
        productId: "gb-qradar",
        name: "QRadar",
        status: "EXCELLENT",
        description: "SOC tooling — exceeding detection SLAs",
        healthPercent: 98,
        throughput: "4.5 TB/day",
        tickets: 6,
        escalations: 0,
        avgResolution: "1.4 hrs",
      },
    ],
    team: [
      { name: "James O'Neill", role: "Project Manager", assignment: "Account Level", email: "joneill@ibm.com", phone: "+44 20 7946 0101" },
      { name: "Amélie Dubois", role: "Primary TAM", assignment: "Account Level", email: "adubois@ibm.com", phone: "+44 20 7946 0102" },
      { name: "Thomas Berg", role: "Delivery Consultant", assignment: "IBM Z", email: "tberg@ibm.com", phone: "+44 20 7946 0103" },
    ],
    kpis: [
      { kpiId: "platform_availability", score: 99.98, notes: "Q1 checkpoint — exceptional" },
      { kpiId: "csat_score", score: 9.1, notes: "EMEA portfolio leader" },
      { kpiId: "account_health", score: 91, notes: "Flagship account composite" },
      { kpiId: "renewal_confidence", score: 88, notes: "Multi-year renewal on track" },
      { kpiId: "sla_compliance", score: 99.2, notes: "All SLAs met in Q1" },
    ],
  },
  {
    clientId: "nordic-retail-004",
    clientName: "Nordic Retail Group",
    geo: "EMEA",
    market: "Nordics",
    tier: "Silver",
    contractValue: 2100000,
    contractStart: "15/03/2024",
    contractEnd: "14/03/2027",
    renewalDate: "14/03/2027",
    accountHealth: 79,
    renewalConfidence: 74,
    expansionPotential: 71,
    valueVisibility: 76,
    executiveSummary:
      "Growing Silver-tier retail account with solid OMS performance and expansion interest in analytics.",
    contractionRisk: "Low",
    expansionPipeline: 950000,
    keyPoints: [
      "OMS integration completed across 3 Nordic markets",
      "Analytics workload expansion under commercial review",
      "Peak-season capacity plan approved for Q4",
    ],
    accountRisks: [
      {
        severity: "MEDIUM",
        description: "Peak-season capacity planning needed for holiday traffic",
        mitigation: "Pre-season load test scheduled with delivery team",
        likelihood: 40,
        impact: 45,
      },
    ],
    products: [
      {
        productId: "nr-sterling",
        name: "Sterling OMS",
        status: "EXCELLENT",
        description: "Order pipeline handling 2.1M transactions/month across Nordics",
        healthPercent: 97,
        throughput: "1.8 TB/day",
        tickets: 12,
        escalations: 0,
        avgResolution: "1.9 hrs",
      },
      {
        productId: "nr-db2",
        name: "IBM Db2",
        status: "GOOD",
        description: "Inventory and pricing datastore for regional DCs",
        healthPercent: 89,
        throughput: "620 GB/day",
        tickets: 16,
        escalations: 1,
        avgResolution: "2.6 hrs",
      },
      {
        productId: "nr-cpd",
        name: "Cloud Pak for Data",
        status: "WATCH",
        description: "Analytics adoption below target — enablement workshop scheduled",
        healthPercent: 61,
        throughput: "2.0 TB/day",
        tickets: 28,
        escalations: 2,
        avgResolution: "5.8 hrs",
        risks: [
          { level: "HIGH", title: "Network Latency Spikes", description: "Packet discard drops under peak workload.", score: 78 },
          { level: "MEDIUM", title: "Access Policy Drift", description: "Stale user accounts on test servers.", score: 55 },
        ],
      },
    ],
    team: [
      { name: "Lars Eriksson", role: "Project Manager", assignment: "Account Level", email: "leriksson@ibm.com", phone: "+46 8 123 4501" },
      { name: "Ingrid Holm", role: "Primary TAM", assignment: "Account Level", email: "iholm@ibm.com", phone: "+46 8 123 4502" },
      { name: "Jonas Lind", role: "Delivery Consultant", assignment: "Sterling OMS", email: "jlind@ibm.com", phone: "+46 8 123 4503" },
    ],
    kpis: [
      { kpiId: "platform_availability", score: 99.5, notes: "Holiday peak readiness verified" },
      { kpiId: "expansion_potential", score: 71, notes: "Analytics upsell opportunity identified" },
      { kpiId: "account_health", score: 79, notes: "Retail vertical benchmark" },
    ],
  },
  {
    clientId: "meditech-003",
    clientName: "MediTech Solutions",
    geo: "Americas",
    market: "United States",
    tier: "Silver",
    contractValue: 5800000,
    contractStart: "01/04/2024",
    contractEnd: "31/03/2027",
    renewalDate: "31/03/2027",
    accountHealth: 84,
    renewalConfidence: 79,
    expansionPotential: 68,
    valueVisibility: 81,
    executiveSummary:
      "Healthcare SaaS provider with strong HIPAA compliance posture and growing watsonx adoption in clinical workflows.",
    contractionRisk: "Low",
    expansionPipeline: 1400000,
    keyPoints: [
      "HIPAA audit passed with zero critical findings",
      "watsonx clinical assistant pilot expanded to 12 hospitals",
      "Db2 migration to hybrid cloud 78% complete",
    ],
    accountRisks: [
      {
        severity: "MEDIUM",
        description: "FHIR API rate limits causing integration delays for partner apps",
        mitigation: "Capacity uplift scheduled with platform engineering",
        likelihood: 35,
        impact: 55,
      },
    ],
    products: [
      {
        productId: "mt-db2",
        name: "IBM Db2",
        status: "EXCELLENT",
        description: "Clinical records datastore — 99.95% availability",
        healthPercent: 98,
        throughput: "2.8 TB/day",
        tickets: 15,
        escalations: 0,
        avgResolution: "1.7 hrs",
      },
      {
        productId: "mt-watsonx",
        name: "watsonx.ai",
        status: "GOOD",
        description: "Clinical decision support models in pilot expansion",
        healthPercent: 86,
        throughput: "1.1 TB/day",
        tickets: 22,
        escalations: 1,
        avgResolution: "3.1 hrs",
        risks: [{ level: "MEDIUM", title: "Model Drift", description: "Inference latency increased 8% on peak shifts.", score: 52 }],
      },
      {
        productId: "mt-guardium",
        name: "Guardium DS",
        status: "EXCELLENT",
        description: "PHI monitoring across all production estates",
        healthPercent: 95,
        throughput: "380 GB/day",
        tickets: 9,
        escalations: 0,
        avgResolution: "1.5 hrs",
      },
    ],
    team: [
      { name: "Rachel Kim", role: "Project Manager", assignment: "Account Level", email: "rkim@ibm.com", phone: "+1 (555) 021-4400" },
      { name: "Brian O'Connor", role: "Primary TAM", assignment: "Account Level", email: "boconnor@ibm.com", phone: "+1 (555) 021-4401" },
      { name: "Priya Nair", role: "Delivery Consultant", assignment: "IBM Db2", email: "pnair@ibm.com", phone: "+1 (555) 021-4402" },
    ],
    kpis: [
      { kpiId: "platform_availability", score: 99.6, notes: "Healthcare SLA tier met" },
      { kpiId: "account_health", score: 84, notes: "Strong compliance posture" },
      { kpiId: "sla_compliance", score: 98.5, notes: "HIPAA-aligned SLAs" },
      { kpiId: "renewal_confidence", score: 79, notes: "Renewal workshop Q2" },
    ],
  },
  {
    clientId: "pacific-energy-005",
    clientName: "Pacific Energy Corp",
    geo: "APAC",
    market: "Australia",
    tier: "Gold",
    contractValue: 9200000,
    contractStart: "01/01/2023",
    contractEnd: "31/12/2027",
    renewalDate: "31/12/2027",
    accountHealth: 88,
    renewalConfidence: 85,
    expansionPotential: 77,
    valueVisibility: 83,
    executiveSummary:
      "APAC Gold account powering grid analytics and IoT telemetry at national scale with Maximo and Cloud Pak for Data.",
    contractionRisk: "Low",
    expansionPipeline: 2200000,
    keyPoints: [
      "Maximo asset lifecycle rollout completed across 40 sites",
      "IoT ingestion pipeline scaled to 2.4M events/min",
      "Executive QBR scheduled with regional CIO",
    ],
    accountRisks: [
      {
        severity: "LOW",
        description: "Typhoon season DR test window overlaps with planned maintenance",
        mitigation: "DR runbook updated; maintenance window shifted",
        likelihood: 25,
        impact: 40,
      },
    ],
    products: [
      {
        productId: "pe-maximo",
        name: "Maximo Application Suite",
        status: "EXCELLENT",
        description: "Enterprise asset management for generation and distribution",
        healthPercent: 97,
        throughput: "5.2 TB/day",
        tickets: 11,
        escalations: 0,
        avgResolution: "1.4 hrs",
      },
      {
        productId: "pe-cpd",
        name: "Cloud Pak for Data",
        status: "GOOD",
        description: "Grid analytics and predictive maintenance models",
        healthPercent: 90,
        throughput: "3.6 TB/day",
        tickets: 17,
        escalations: 0,
        avgResolution: "2.2 hrs",
      },
      {
        productId: "pe-mq",
        name: "IBM MQ",
        status: "EXCELLENT",
        description: "Telemetry bus for field device integration",
        healthPercent: 99,
        throughput: "8.1 TB/day",
        tickets: 7,
        escalations: 0,
        avgResolution: "1.2 hrs",
      },
    ],
    team: [
      { name: "Kenji Tanaka", role: "Project Manager", assignment: "Account Level", email: "ktanaka@ibm.com", phone: "+81 3 1234 5601" },
      { name: "Mei Lin", role: "Primary TAM", assignment: "Account Level", email: "mlin@ibm.com", phone: "+81 3 1234 5602" },
      { name: "Arun Patel", role: "Delivery Consultant", assignment: "Maximo Application Suite", email: "apatel@ibm.com", phone: "+81 3 1234 5603" },
    ],
    kpis: [
      { kpiId: "platform_availability", score: 99.7, notes: "Grid operations SLA" },
      { kpiId: "csat_score", score: 8.7, notes: "APAC energy vertical" },
      { kpiId: "account_health", score: 88, notes: "Gold-tier composite" },
      { kpiId: "product_utilisation", score: 82, notes: "High Maximo adoption" },
    ],
  },
  {
    clientId: "latam-logistics-006",
    clientName: "LatAm Logistics SA",
    geo: "Americas",
    market: "Brazil",
    tier: "Bronze",
    contractValue: 3100000,
    contractStart: "01/06/2024",
    contractEnd: "31/05/2027",
    renewalDate: "31/05/2027",
    accountHealth: 71,
    renewalConfidence: 62,
    expansionPotential: 58,
    valueVisibility: 66,
    executiveSummary:
      "Regional logistics operator modernising warehouse and fleet systems with Sterling and API Connect.",
    contractionRisk: "Moderate",
    expansionPipeline: 720000,
    keyPoints: [
      "Sterling B2B gateway live for top 15 carriers",
      "API Connect developer portal launched for partners",
      "Currency fluctuation impacting expansion budget",
    ],
    accountRisks: [
      {
        severity: "HIGH",
        description: "Legacy WMS integration causing shipment reconciliation gaps",
        mitigation: "Dedicated integration squad assigned through Q3",
        likelihood: 55,
        impact: 70,
      },
      {
        severity: "MEDIUM",
        description: "Renewal budget freeze under regional cost review",
        mitigation: "Value realization deck in progress with finance sponsor",
        likelihood: 40,
        impact: 60,
      },
    ],
    products: [
      {
        productId: "ll-sterling",
        name: "Sterling B2B Integrator",
        status: "GOOD",
        description: "Carrier and customs document exchange",
        healthPercent: 82,
        throughput: "920 GB/day",
        tickets: 31,
        escalations: 2,
        avgResolution: "4.5 hrs",
        risks: [{ level: "HIGH", title: "EDI Backlog", description: "Partner onboarding queue exceeds SLA during peak season.", score: 76 }],
      },
      {
        productId: "ll-apic",
        name: "API Connect",
        status: "WATCH",
        description: "Partner API portal — adoption below plan",
        healthPercent: 68,
        throughput: "210 GB/day",
        tickets: 26,
        escalations: 1,
        avgResolution: "5.2 hrs",
      },
    ],
    team: [
      { name: "Carlos Mendez", role: "Project Manager", assignment: "Account Level", email: "cmendez@ibm.com", phone: "+55 11 3000 7701" },
      { name: "Ana Silva", role: "Primary TAM", assignment: "Account Level", email: "asilva@ibm.com", phone: "+55 11 3000 7702" },
    ],
    kpis: [
      { kpiId: "platform_availability", score: 98.9, notes: "LATAM logistics benchmark" },
      { kpiId: "renewal_confidence", score: 62, notes: "Budget review in progress" },
      { kpiId: "account_health", score: 71, notes: "Integration risk weighted" },
    ],
  },
  {
    clientId: "asia-finserve-007",
    clientName: "Asia FinServe Ltd",
    geo: "APAC",
    market: "Southeast Asia",
    tier: "Silver",
    contractValue: 6500000,
    contractStart: "15/09/2023",
    contractEnd: "14/09/2026",
    renewalDate: "14/09/2026",
    accountHealth: 86,
    renewalConfidence: 81,
    expansionPotential: 74,
    valueVisibility: 80,
    executiveSummary:
      "Digital banking platform across Singapore and Hong Kong with strong QRadar and Cloud Pak for Integration footprint.",
    contractionRisk: "Low",
    expansionPipeline: 1800000,
    keyPoints: [
      "Real-time payments rail migrated to Cloud Pak for Integration",
      "QRadar SOC automation reduced MTTR by 22%",
      "Regulatory sandbox approval for AI fraud detection pilot",
    ],
    accountRisks: [
      {
        severity: "MEDIUM",
        description: "Cross-border data residency requirements for new HK entity",
        mitigation: "Legal and architecture review in flight",
        likelihood: 35,
        impact: 50,
      },
    ],
    products: [
      {
        productId: "af-cp4i",
        name: "Cloud Pak for Integration",
        status: "EXCELLENT",
        description: "Payments and core banking integration hub",
        healthPercent: 96,
        throughput: "4.2 TB/day",
        tickets: 13,
        escalations: 0,
        avgResolution: "1.6 hrs",
      },
      {
        productId: "af-qradar",
        name: "QRadar",
        status: "GOOD",
        description: "SOC and fraud analytics correlation",
        healthPercent: 93,
        throughput: "2.9 TB/day",
        tickets: 10,
        escalations: 0,
        avgResolution: "1.8 hrs",
      },
      {
        productId: "af-watsonx",
        name: "watsonx.governance",
        status: "GOOD",
        description: "Model risk management for AI fraud pilot",
        healthPercent: 85,
        throughput: "780 GB/day",
        tickets: 14,
        escalations: 0,
        avgResolution: "2.5 hrs",
      },
    ],
    team: [
      { name: "Wei Zhang", role: "Project Manager", assignment: "Account Level", email: "wzhang@ibm.com", phone: "+65 6123 8801" },
      { name: "Siti Rahman", role: "Primary TAM", assignment: "Account Level", email: "srahman@ibm.com", phone: "+65 6123 8802" },
      { name: "David Ho", role: "Delivery Consultant", assignment: "QRadar", email: "dho@ibm.com", phone: "+65 6123 8803" },
    ],
    kpis: [
      { kpiId: "platform_availability", score: 99.4, notes: "FinServ APAC SLA" },
      { kpiId: "csat_score", score: 8.4, notes: "Digital banking CSAT" },
      { kpiId: "account_health", score: 86, notes: "Strong integration health" },
      { kpiId: "expansion_potential", score: 74, notes: "AI fraud pilot pipeline" },
    ],
  },
  {
    clientId: "cloudstart-008",
    clientName: "CloudStart Innovations",
    geo: "Americas",
    market: "United States",
    tier: "Free",
    contractValue: 180000,
    contractStart: "01/01/2025",
    contractEnd: "31/12/2025",
    renewalDate: "31/12/2025",
    accountHealth: 58,
    renewalConfidence: 45,
    expansionPotential: 82,
    valueVisibility: 52,
    executiveSummary:
      "Early-stage startup on IBM Cloud Free tier with high expansion potential if Series B closes.",
    contractionRisk: "Moderate-High",
    expansionPipeline: 450000,
    keyPoints: [
      "Free tier consumption at 94% of monthly cap",
      "Series B funding expected Q3 — upsell opportunity",
      "Technical champion engaged via startup program",
    ],
    accountRisks: [
      {
        severity: "HIGH",
        description: "Runway constraints may delay paid tier conversion",
        mitigation: "Startup credits package proposed; exec sponsor outreach",
        likelihood: 60,
        impact: 75,
      },
    ],
    products: [
      {
        productId: "cs-ibm-cloud",
        name: "IBM Cloud",
        status: "WATCH",
        description: "Free tier Kubernetes and object storage",
        healthPercent: 72,
        throughput: "45 GB/day",
        tickets: 19,
        escalations: 1,
        avgResolution: "6.8 hrs",
        risks: [{ level: "MEDIUM", title: "Quota Exhaustion", description: "Monthly free tier cap hit twice in last quarter.", score: 48 }],
      },
      {
        productId: "cs-watsonx",
        name: "watsonx.ai",
        status: "PILOT",
        description: "Gen AI prototype for customer onboarding chatbot",
        healthPercent: 65,
        throughput: "12 GB/day",
        tickets: 8,
        escalations: 0,
        avgResolution: "4.1 hrs",
      },
    ],
    team: [
      { name: "Alex Rivera", role: "Primary TAM", assignment: "Account Level", email: "arivera@ibm.com", phone: "+1 (555) 030-1100" },
    ],
    kpis: [
      { kpiId: "expansion_potential", score: 82, notes: "Series B upsell target" },
      { kpiId: "account_health", score: 58, notes: "Startup program account" },
      { kpiId: "renewal_confidence", score: 45, notes: "Conversion risk — monitor runway" },
    ],
  },
];

function renewalConfidenceLabel(score) {
  if (score >= 80) return `${score}% — Strong`;
  if (score >= 65) return `${score}% — Good`;
  if (score >= 50) return `${score}% — Moderate`;
  return `${score}% — At Risk`;
}

function caseVolumeForProduct(clientId, productId, baseCases) {
  return MONTHS.map((month, i) => ({
    client_id: clientId,
    product_id: productId,
    month,
    cases: baseCases[i] ?? 2,
    sort_order: i + 1,
  }));
}

function buildSheets() {
  const clientOverview = [];
  const keyPoints = [];
  const risks = [];
  const commercialSnapshot = [];
  const productPortfolio = [];
  const productIntegrationMetrics = [];
  const productHealthCheck = [];
  const productCaseVolume = [];
  const productRiskIntelligence = [];
  const productStability = [];
  const productPerformance = [];
  const productRecommendations = [];
  const accountTeam = [];
  const kpiScores = [];

  for (const client of CLIENT_DEFS) {
    const arr = client.contractValue;
    const productNames = client.products.map((p) => p.name).join(", ");

    clientOverview.push({
      client_id: client.clientId,
      client_name: client.clientName,
      geo: client.geo,
      market: client.market,
      tier: client.tier,
      contract_value: client.contractValue,
      contract_start: client.contractStart,
      contract_end: client.contractEnd,
      renewal_date: client.renewalDate,
      products: productNames,
      overall_health: client.accountHealth,
      account_health: client.accountHealth,
      renewal_confidence: client.renewalConfidence,
      expansion_potential: client.expansionPotential,
      value_visibility: client.valueVisibility,
      executive_summary: client.executiveSummary,
      contraction_risk: client.contractionRisk,
      arr,
      expansion_pipeline: client.expansionPipeline,
      acv: client.contractValue,
      tcv: client.contractValue,
      current_year_revenue: client.contractValue,
      nrr_percent: 100,
    });

    commercialSnapshot.push({
      client_id: client.clientId,
      arr,
      renewal_date: client.renewalDate,
      days_to_renewal: "",
      renewal_confidence_score: client.renewalConfidence,
      renewal_confidence_label: renewalConfidenceLabel(client.renewalConfidence),
      expansion_pipeline: client.expansionPipeline,
      contraction_risk: client.contractionRisk,
    });

    client.keyPoints.forEach((point) => {
      keyPoints.push({ client_id: client.clientId, point });
    });

    client.accountRisks.forEach((r) => {
      risks.push({
        client_id: client.clientId,
        severity: r.severity,
        description: r.description,
        mitigation: r.mitigation,
        likelihood_pct: r.likelihood,
        impact_pct: r.impact,
        risk_score: Math.round((r.likelihood * r.impact) / 100),
      });
    });

    client.products.forEach((product, productIndex) => {
      const sortOrder = productIndex + 1;
      const checksFinished = product.healthPercent >= 95 ? 4 : product.healthPercent >= 80 ? 3 : product.healthPercent >= 60 ? 2 : 1;
      const healthRequired = product.status === "CRITICAL" || product.status === "WATCH" ? "YES" : productIndex % 2 === 0 ? "YES" : "NO";
      const baseCases = MONTHS.map((_, i) => Math.max(1, Math.round(product.tickets / 6) + (i % 3) - 1));

      productPortfolio.push({
        client_id: client.clientId,
        product_id: product.productId,
        product_name: product.name,
        status: product.status,
        description: product.description,
        sort_order: sortOrder,
      });

      productIntegrationMetrics.push({
        client_id: client.clientId,
        product_id: product.productId,
        health_percent: product.healthPercent,
        checks_finished: checksFinished,
        data_throughput: product.throughput,
        total_tickets: product.tickets,
        escalations: product.escalations,
        avg_resolution: product.avgResolution,
      });

      productHealthCheck.push({
        client_id: client.clientId,
        product_id: product.productId,
        health_check_required: healthRequired,
        last_check: healthRequired === "YES" ? "12/04/2026 at 09:30 AM" : "",
        next_check: healthRequired === "YES" ? "12/10/2026 at 09:30 AM" : "",
        checks_finished: healthRequired === "YES" ? checksFinished : 0,
      });

      productCaseVolume.push(...caseVolumeForProduct(client.clientId, product.productId, baseCases));

      (product.risks ?? []).forEach((r, riskIndex) => {
        productRiskIntelligence.push({
          client_id: client.clientId,
          product_id: product.productId,
          risk_level: r.level,
          title: r.title,
          description: r.description,
          risk_score: r.score,
          sort_order: riskIndex + 1,
        });
      });

      // Generate Product Stability metrics
      const stabilityMetrics = [
        { metric: "Uptime", value: `${product.healthPercent}%`, status: product.healthPercent >= 99 ? "EXCELLENT" : product.healthPercent >= 95 ? "GOOD" : product.healthPercent >= 90 ? "WATCH" : "CRITICAL", trend: "STABLE", description: "System availability over the last 30 days" },
        { metric: "Error Rate", value: `${(100 - product.healthPercent) / 10}%`, status: product.healthPercent >= 99 ? "EXCELLENT" : product.healthPercent >= 95 ? "GOOD" : "WATCH", trend: product.healthPercent >= 95 ? "DOWN" : "UP", description: "Percentage of failed requests" },
        { metric: "Incident Count", value: `${product.escalations}`, status: product.escalations === 0 ? "EXCELLENT" : product.escalations <= 2 ? "GOOD" : "WATCH", trend: "STABLE", description: "Number of P1/P2 incidents this month" },
        { metric: "MTTR", value: product.avgResolution, status: parseFloat(product.avgResolution) < 2 ? "EXCELLENT" : parseFloat(product.avgResolution) < 4 ? "GOOD" : "WATCH", trend: "DOWN", description: "Mean time to resolution for incidents" },
      ];
      stabilityMetrics.forEach((m, idx) => {
        productStability.push({
          client_id: client.clientId,
          product_id: product.productId,
          metric: m.metric,
          value: m.value,
          status: m.status,
          trend: m.trend,
          description: m.description,
          sort_order: idx + 1,
        });
      });

      // Generate Product Performance metrics
      const performanceMetrics = [
        { metric: "Response Time", value: `${Math.round(50 + Math.random() * 100)}ms`, target: "< 200ms", status: "EXCELLENT", trend: "STABLE", description: "Average API response time" },
        { metric: "Throughput", value: product.throughput, target: `${parseFloat(product.throughput) * 0.8} ${product.throughput.split(' ')[1]}`, status: "GOOD", trend: "UP", description: "Data processing throughput" },
        { metric: "CPU Utilization", value: `${Math.round(40 + Math.random() * 30)}%`, target: "< 80%", status: "EXCELLENT", trend: "STABLE", description: "Average CPU usage across nodes" },
        { metric: "Memory Usage", value: `${Math.round(50 + Math.random() * 25)}%`, target: "< 85%", status: "GOOD", trend: "UP", description: "Average memory consumption" },
        { metric: "Disk I/O", value: `${Math.round(100 + Math.random() * 200)} IOPS`, target: "> 50 IOPS", status: "EXCELLENT", trend: "STABLE", description: "Disk input/output operations per second" },
      ];
      performanceMetrics.forEach((m, idx) => {
        productPerformance.push({
          client_id: client.clientId,
          product_id: product.productId,
          metric: m.metric,
          value: m.value,
          target: m.target,
          status: m.status,
          trend: m.trend,
          description: m.description,
          sort_order: idx + 1,
        });
      });

      // Generate Product Recommendations
      const recommendations = [];
      if (product.status === "CRITICAL" || product.status === "WATCH") {
        recommendations.push({
          priority: "HIGH",
          title: "Implement automated health monitoring",
          description: "Deploy real-time monitoring dashboards to detect anomalies before they impact users",
          impact: "Reduce MTTR by 40%",
          effort: "2-3 weeks",
          timeline: "Q3 2026",
        });
        recommendations.push({
          priority: "MEDIUM",
          title: "Optimize database query performance",
          description: "Review and optimize slow-running queries identified in performance logs",
          impact: "Improve response time by 25%",
          effort: "1 week",
          timeline: "Q2 2026",
        });
      }
      if (product.escalations > 0) {
        recommendations.push({
          priority: "CRITICAL",
          title: "Address recurring incident root cause",
          description: "Conduct RCA workshop to identify and fix underlying issues causing repeated escalations",
          impact: "Eliminate 80% of recurring incidents",
          effort: "2 weeks",
          timeline: "Immediate",
        });
      }
      recommendations.push({
        priority: "LOW",
        title: "Update to latest patch version",
        description: "Apply latest security patches and minor version updates",
        impact: "Enhanced security posture",
        effort: "3-5 days",
        timeline: "Q3 2026",
      });
      recommendations.forEach((r, idx) => {
        productRecommendations.push({
          client_id: client.clientId,
          product_id: product.productId,
          priority: r.priority,
          title: r.title,
          description: r.description,
          impact: r.impact,
          effort: r.effort,
          timeline: r.timeline,
          sort_order: idx + 1,
        });
      });
    });

    client.team.forEach((member, i) => {
      accountTeam.push({
        client_id: client.clientId,
        name: member.name,
        role: member.role,
        assignment: member.assignment,
        email: member.email,
        phone: member.phone,
        sort_order: i + 1,
      });
    });

    const KPI_CHECKPOINTS = [
      { date: "01/09/2025", label: "Q3 2025" },
      { date: "01/12/2025", label: "Q4 2025" },
      { date: "01/03/2026", label: "Q1 2026" },
    ];

    client.kpis.forEach((kpi) => {
      KPI_CHECKPOINTS.forEach((checkpoint, index) => {
        const drift = (2 - index) * 1.2;
        const score =
          index === KPI_CHECKPOINTS.length - 1
            ? kpi.score
            : Math.round((kpi.score - drift) * 10) / 10;

        kpiScores.push({
          client_id: client.clientId,
          kpi_id: kpi.kpiId,
          score_value: score,
          checkpoint_date: checkpoint.date,
          notes:
            index === KPI_CHECKPOINTS.length - 1
              ? kpi.notes
              : `${checkpoint.label} — ${kpi.kpiId.replace(/_/g, " ")}`,
        });
      });
    });
  }

  return {
    clientOverview,
    keyPoints,
    risks,
    commercialSnapshot,
    productPortfolio,
    productIntegrationMetrics,
    productHealthCheck,
    productCaseVolume,
    productRiskIntelligence,
    productStability,
    productPerformance,
    productRecommendations,
    accountTeam,
    kpiScores,
  };
}

const data = buildSheets();

const sheets = [
  ["ClientOverview", data.clientOverview],
  ["KeyPoints", data.keyPoints],
  ["Risks", data.risks],
  ["CommercialSnapshot", data.commercialSnapshot],
  ["ProductPortfolio", data.productPortfolio],
  ["ProductIntegrationMetrics", data.productIntegrationMetrics],
  ["ProductHealthCheck", data.productHealthCheck],
  ["ProductCaseVolume", data.productCaseVolume],
  ["ProductRiskIntelligence", data.productRiskIntelligence],
  ["ProductStability", data.productStability],
  ["ProductPerformance", data.productPerformance],
  ["ProductRecommendations", data.productRecommendations],
  ["AccountTeam", data.accountTeam],
  ["KPIScores", data.kpiScores],
];

const wb = XLSX.utils.book_new();
for (const [name, rows] of sheets) {
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
}

const xlsxPath = join(outDir, "control_plane_demo.xlsx");
XLSX.writeFile(wb, xlsxPath);

const jsonPayload = Object.fromEntries(sheets);
writeFileSync(join(outDir, "control_plane_demo.json"), JSON.stringify(jsonPayload, null, 2));

console.log("Wrote", xlsxPath);
console.log("Wrote", join(outDir, "control_plane_demo.json"));
console.log(`Generated ${CLIENT_DEFS.length} clients across ${sheets.length} sheets.`);
