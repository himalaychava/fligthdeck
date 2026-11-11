import { createFileRoute } from "@tanstack/react-router";
import { InlineNotification, InlineLoading } from "@carbon/react";
import { PageReportHeader } from "@/components/layout/PageReportHeader";
import { useLiveOverviewClient } from "@/demo-integration/useLiveOverviewClient";

export const Route = createFileRoute("/_authenticated/client/$clientId/renewal")({
  component: RenewalPage,
});

function RenewalPage() {
  const { clientId } = Route.useParams();
  const { client, isLoading } = useLiveOverviewClient(clientId, 0);

  if (isLoading || !client) return <InlineLoading description="Loading…" />;

  return (
    <PageReportHeader title="Renewal" pageSlug="renewal" client={client}>
      <InlineNotification
        kind="info"
        title="Under development"
        subtitle="Renewal forecast, playbook, and approvals workflow will live here."
        hideCloseButton
        lowContrast
      />
    </PageReportHeader>
  );
}
