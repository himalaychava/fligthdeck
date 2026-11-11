import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { InlineLoading, InlineNotification, SkeletonText, Button, IconButton, Tile } from "@carbon/react";
import { Launch, Help } from "@carbon/icons-react";
import { HEALTH_CHECK_GUIDE_URL } from "@/constants/healthCheckGuide";
import { ProductPortfolioHealth } from "@/components/overview/ProductPortfolioHealth";
import { DedicatedAccountTeam } from "@/components/overview/DedicatedAccountTeam";
import { PageReportHeader } from "@/components/layout/PageReportHeader";
import { useAuth } from "@/contexts/AuthContext";
import { DemoSourceBanner } from "@/demo-integration/DemoSourceBanner";
import { useLiveOverviewClient } from "@/demo-integration/useLiveOverviewClient";

export const Route = createFileRoute("/_authenticated/client/$clientId/account-overview")({
  component: AccountOverviewPage,
});

function AccountOverviewPage() {
  const { clientId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const { client, isLoading, error, isDemoLive } = useLiveOverviewClient(clientId, refresh);

  useEffect(() => {
    // Customers are locked to the external view route
    if (user?.role === "customer") {
      navigate({ to: "/client/$clientId/external" as any, params: { clientId } as any });
    }
  }, [user, navigate, clientId]);

  if (isLoading) {
    return isDemoLive ? (
      <SkeletonText heading width="60%" />
    ) : (
      <InlineLoading description="Loading product overview…" />
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

  if (!client) return <InlineLoading description="Loading product overview…" />;

  // Check if client has Red Hat OpenShift product
  const hasOpenShift = client.productPortfolio?.some(
    product => {
      const productName = product.productName?.toLowerCase() ?? '';
      return productName.includes('openshift');
    }
  ) ?? false;

  return (
    <PageReportHeader
      title="Product Overview"
      pageSlug="account-overview"
      client={client}
      trailing={
        <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
          Last updated: {new Date().toLocaleString()}
        </span>
      }
    >
      <DemoSourceBanner />
      {/*
        No flex `gap` here — every section below is a `cp-section`, which
        already carries its own margin-bottom (2rem, in styles.css), and
        DedicatedAccountTeam adds a further marginTop on top of that. A gap
        on this wrapper stacked on top of both, compounding into several rem
        of dead space between sections. One spacing mechanism, not two.
      */}
      <div style={{ marginTop: "1rem" }}>
        <ProductPortfolioHealth client={client} onUpdate={() => setRefresh((r) => r + 1)} />

        {/* Health Check — a compact card, not a full-width Tile stretched
            across the page. A short description and one button do not fill
            the same width as a 4-column product grid, so the card is capped
            to a sensible reading width instead of sitting in a mostly-empty
            box — that emptiness was what read as "odd" and "not within the
            frame" previously. */}
        <section className="cp-section">
          {/* Heading and help icon on the same line — the icon sits right
              next to the section title itself now, nothing else in between. */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "1rem" }}>
            <h2 className="cp-section-title" style={{ fontWeight: 700, margin: 0 }}>
              Health Check
            </h2>
            <IconButton
              label="High-level review — not a comprehensive assessment. Click for the user guide."
              kind="ghost"
              size="sm"
              align="top"
              onClick={() => window.open(HEALTH_CHECK_GUIDE_URL, "_blank", "noopener,noreferrer")}
            >
              <Help />
            </IconButton>
          </div>

          <Tile style={{ padding: "1.25rem 0", background: "var(--cds-layer-01)", maxWidth: "34rem" }}>
            <p style={{ fontSize: "0.875rem", fontWeight: 400, color: "var(--cds-text-primary)", margin: "0 0 1.1rem", lineHeight: 1.5 }}>
              A single interface for IBM Delivery Consultants to run automated health reviews
              across supported IBM products.{" "}
              <a
                href={HEALTH_CHECK_GUIDE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--cds-link-primary, #0f62fe)", fontWeight: 400, whiteSpace: "nowrap" }}
              >
                Health Check guide
              </a>
            </p>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <Button
                  kind="primary"
                  size="sm"
                  renderIcon={Launch}
                  data-hide-in-report
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/demo/health-check/generate-template', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clientId: client.clientId, clientName: client.clientName })
                      });
                      const result = await response.json();
                      if (!result.success) {
                        console.error('Failed to generate template:', result.error);
                      }
                    } catch (e) {
                      console.error('Error generating template:', e);
                    }
                    const params = new URLSearchParams({
                      clientId: client.clientId,
                      clientName: client.clientName,
                      tier: client.tier || '',
                      icn: client.icnNumber || '',
                      cmr: client.cmrNumber || ''
                    });
                    const healthCheckUrl = import.meta.env.VITE_HEALTH_CHECK_TOOL_URL || 'http://localhost:5001';
                    window.open(`${healthCheckUrl}/?${params.toString()}`, "_blank");
                  }}
                >
                  Go to Health Check Tool
                </Button>
                {hasOpenShift && (
                  <Button
                    kind="tertiary"
                    size="sm"
                    renderIcon={Launch}
                    data-hide-in-report
                    onClick={() => window.open("http://9.60.247.130:4005/", "_blank")}
                  >
                    OCP Health Check
                  </Button>
                )}
            </div>
          </Tile>
        </section>
        <DedicatedAccountTeam client={client} />
      </div>
    </PageReportHeader>
  );
}
