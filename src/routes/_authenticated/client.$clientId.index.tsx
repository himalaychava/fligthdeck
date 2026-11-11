import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { InlineLoading, InlineNotification, SkeletonText } from "@carbon/react";
import { AccountHeader, type ContractSummary } from "@/components/overview/AccountHeader";
import { KPIWidgetGrid } from "@/components/overview/KPIWidgetGrid";
import { ExecutiveSummary } from "@/components/overview/ExecutiveSummary";
import { PageReportHeader } from "@/components/layout/PageReportHeader";
import { useAuth } from "@/contexts/AuthContext";
import { DemoSourceBanner } from "@/demo-integration/DemoSourceBanner";
import { useLiveOverviewClient } from "@/demo-integration/useLiveOverviewClient";
import { GLOBAL_CLIENT_ID, isGlobalClientId } from "@/constants/globalView";
import { apiFetch } from "@/lib/apiFetch";

export const Route = createFileRoute("/_authenticated/client/$clientId/")({
  component: ClientOverviewPage,
});

function ClientOverviewPage() {
  const { clientId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const { client, isLoading, error, isDemoLive } = useLiveOverviewClient(clientId, refresh);
  const [contractSummary, setContractSummary] = useState<ContractSummary | null>(null);

  // Active-contract roll-up for the header. Fetched separately from the client
  // payload so it stays sourced from the Contract page's own data rather than
  // being duplicated into the workbook.
  useEffect(() => {
    let cancelled = false;
    setContractSummary(null);
    apiFetch(`/api/demo/contract-summary/${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<ContractSummary>) : null))
      .catch(() => null)
      .then((s) => {
        if (!cancelled) setContractSummary(s);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (isGlobalClientId(clientId)) {
      navigate({ to: "/client/$clientId/global", params: { clientId: GLOBAL_CLIENT_ID } });
      return;
    }
    if (user?.role === "customer") {
      navigate({ to: "/client/$clientId/external" as any, params: { clientId } as any });
    }
  }, [user, navigate, clientId]);

  if (isLoading) {
    return isDemoLive ? (
      <SkeletonText heading width="60%" />
    ) : (
      <InlineLoading description="Loading client overview…" />
    );
  }

  if (error) {
    return (
      <InlineNotification
        kind="error"
        title="Live data unavailable"
        subtitle={error}
        lowContrast
      />
    );
  }

  if (!client) return <InlineLoading description="Loading client overview…" />;

  return (
    <PageReportHeader
      title="Client Overview"
      pageSlug="client-overview"
      client={client}
      // Customer commercial data — no PDF download.
      allowDownload={false}
      trailing={
        <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
          Last updated: {new Date().toLocaleString()}
        </span>
      }
    >
      <DemoSourceBanner />
      <AccountHeader client={client} contractSummary={contractSummary} />
      <div style={{ marginTop: "1.5rem" }}>
        <KPIWidgetGrid client={client} onUpdate={() => setRefresh((r) => r + 1)} />
      </div>
      <ExecutiveSummary client={client} onUpdate={() => setRefresh((r) => r + 1)} />
    </PageReportHeader>
  );
}
