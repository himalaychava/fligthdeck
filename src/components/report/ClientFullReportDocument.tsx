import { InlineNotification } from "@carbon/react";
import type { Client } from "@/data/clients";
import { CLIENT_REPORT_SECTIONS } from "@/constants/clientReportSections";
import { AccountHeader } from "@/components/overview/AccountHeader";
import { KPIWidgetGrid } from "@/components/overview/KPIWidgetGrid";
import { ExecutiveSummary } from "@/components/overview/ExecutiveSummary";
import { RiskIntervention } from "@/components/overview/RiskIntervention";
import { ProductPortfolioHealth } from "@/components/overview/ProductPortfolioHealth";
import { DedicatedAccountTeam } from "@/components/overview/DedicatedAccountTeam";
import { TIER_FEATURE_ENABLED } from "@/constants/tierFeature";

const PLACEHOLDER_SECTIONS = CLIENT_REPORT_SECTIONS.filter(
  (s) => !["client-overview", "account-overview"].includes(s.slug)
);

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="cp-report-section"
      style={{
        marginBottom: "2rem",
        paddingBottom: "1.5rem",
        borderBottom: "1px solid #e0e0e0",
      }}
    >
      <h2
        style={{
          fontSize: "1.25rem",
          fontWeight: 400,
          margin: "0 0 1rem",
          color: "#161616",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ClientFullReportDocument({
  client,
  generatedAt,
}: {
  client: Client;
  generatedAt: string;
}) {
  return (
    <div className="cp-full-report-document" style={{ background: "#fff", color: "#161616" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "#525252" }}>IBM Expert Labs Control Plane</p>
        <h1 style={{ margin: "0.25rem 0", fontSize: "1.75rem", fontWeight: 300 }}>
          Client report — {client.clientName}
        </h1>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "#525252" }}>
          ICN {client.icnNumber}
          {TIER_FEATURE_ENABLED && <> · {client.tier}</>} · {client.geo} · Generated {generatedAt}
        </p>
      </header>

      <ReportSection title="Client Overview">
        <AccountHeader client={client} />
        <div style={{ marginTop: "1.5rem" }}>
          <KPIWidgetGrid client={client} readOnlyReport />
        </div>
        <ExecutiveSummary client={client} />
        <RiskIntervention client={client} />
      </ReportSection>

      <ReportSection title="Product Overview">
        <ProductPortfolioHealth client={client} />
        <div style={{ marginTop: "1.5rem" }}>
          <DedicatedAccountTeam client={client} />
        </div>
      </ReportSection>

      {PLACEHOLDER_SECTIONS.map((section) => (
        <ReportSection key={section.slug} title={section.label}>
          <InlineNotification
            kind="info"
            title="Section in progress"
            subtitle={`${section.label} content will be included in future releases of the full client report.`}
            hideCloseButton
            lowContrast
          />
        </ReportSection>
      ))}
    </div>
  );
}
