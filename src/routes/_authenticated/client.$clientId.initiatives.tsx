import { createFileRoute } from "@tanstack/react-router";
import { InlineNotification, InlineLoading } from "@carbon/react";
import { PageReportHeader } from "@/components/layout/PageReportHeader";
import { useLiveOverviewClient } from "@/demo-integration/useLiveOverviewClient";

export const Route = createFileRoute("/_authenticated/client/$clientId/initiatives")({
  component: InitiativesPage,
});

function InitiativesPage() {
  const { clientId } = Route.useParams();
  const { client, isLoading } = useLiveOverviewClient(clientId, 0);

  if (isLoading || !client) return <InlineLoading description="Loading..." />;

  return (
    <PageReportHeader title="Initiatives" pageSlug="initiatives" client={client}>
      <InlineNotification
        kind="info"
        title="Under development"
        subtitle="Initiative tracking and milestone status will live here."
        hideCloseButton
        lowContrast
      />
    </PageReportHeader>
  );
}
