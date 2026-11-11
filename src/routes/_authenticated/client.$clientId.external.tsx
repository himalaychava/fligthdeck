import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { InlineNotification, InlineLoading } from "@carbon/react";
import { AccountHeader } from "@/components/overview/AccountHeader";
import { KPIWidgetGrid } from "@/components/overview/KPIWidgetGrid";
import { ExecutiveSummary } from "@/components/overview/ExecutiveSummary";
import { CommercialSnapshot } from "@/components/overview/CommercialSnapshot";
import { ProductPortfolioHealth } from "@/components/overview/ProductPortfolioHealth";
import { PageReportHeader } from "@/components/layout/PageReportHeader";
import { getClientById } from "@/services/clientService";
import { useViewMode } from "@/contexts/ViewModeContext";
import type { Client } from "@/data/clients";

export const Route = createFileRoute("/_authenticated/client/$clientId/external")({
  component: ExternalClientView,
});

function ExternalClientView() {
  const { clientId } = Route.useParams();
  const { viewMode, setViewMode } = useViewMode();
  const [client, setClient] = useState<Client | null | undefined>(undefined);

  useEffect(() => {
    setViewMode("external");
  }, [setViewMode]);

  useEffect(() => {
    let alive = true;
    getClientById(clientId, "external").then((c) => alive && setClient(c ?? null));
    return () => { alive = false; };
  }, [clientId]);

  if (client === undefined) return <InlineLoading description="Loading…" />;
  if (client === null) return <div>Client not found.</div>;

  return (
    <PageReportHeader
      title="Your Account Dashboard"
      pageSlug="external-dashboard"
      client={client}
    >
      <InlineNotification
        kind="info"
        title="External customer view"
        subtitle="Sensitive commercial fields are hidden in this view. Coming in a future release as a fully customer-facing portal."
        hideCloseButton
        lowContrast
        style={{ marginBottom: "1rem" }}
      />
      <AccountHeader client={client} />
      <div style={{ marginTop: "1.5rem" }}>
        <KPIWidgetGrid client={client} />
      </div>
      {/* Sales opportunity tiles are internal only. */}
      <ExecutiveSummary client={client} hideOpportunities />
      <CommercialSnapshot client={client} />
      <ProductPortfolioHealth client={client} />
      <p style={{ marginTop: "2rem", fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
        View mode: {viewMode}
      </p>
    </PageReportHeader>
  );
}