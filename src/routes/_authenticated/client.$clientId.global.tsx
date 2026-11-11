import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { InlineLoading, InlineNotification } from "@carbon/react";
import { useAuth } from "@/contexts/AuthContext";
import { DemoSourceBanner } from "@/demo-integration/DemoSourceBanner";
import { useDemoData } from "@/demo-integration/DemoDataContext";
import { MOCK_CLIENTS } from "@/data/clients";
import { GlobalViewDashboard } from "@/components/global/GlobalViewDashboard";
import { PageReportHeader } from "@/components/layout/PageReportHeader";

export const Route = createFileRoute("/_authenticated/client/$clientId/global")({
  component: GlobalViewPage,
});

function GlobalViewPage() {
  const { clientId } = Route.useParams();
  const { authReady } = useAuth();
  const navigate = useNavigate();
  const { isDemoLive, liveAllClients, isLoading, error, effectiveRole } = useDemoData();

  const clients = useMemo(() => {
    if (isDemoLive) return liveAllClients;
    return MOCK_CLIENTS;
  }, [isDemoLive, liveAllClients]);

  // Wait for auth to hydrate before deciding to redirect.
  // Without this guard, a page refresh fires the redirect while user is still null.
  useEffect(() => {
    if (!authReady) return;
    if (effectiveRole !== "management") {
      const fallback = clients[0]?.clientId;
      if (fallback) {
        navigate({ to: "/client/$clientId", params: { clientId: fallback } });
      }
    }
  }, [authReady, effectiveRole, navigate, clients]);

  // While auth is loading, show nothing — avoid premature redirect flash
  if (!authReady) {
    return <InlineLoading description="Loading…" />;
  }

  if (effectiveRole !== "management") {
    return <InlineLoading description="Redirecting…" />;
  }

  if (isDemoLive && isLoading) {
    return <InlineLoading description="Loading global portfolio data…" />;
  }

  if (isDemoLive && error) {
    return (
      <InlineNotification
        kind="error"
        title="Live data unavailable"
        subtitle={error}
        lowContrast
      />
    );
  }

  return (
    <PageReportHeader
      title="Global View"
      pageSlug="global-view"
      trailing={
        <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
          Last updated: {new Date().toLocaleString()}
        </span>
      }
    >
      <DemoSourceBanner />
      <GlobalViewDashboard clients={clients} />
    </PageReportHeader>
  );
}
