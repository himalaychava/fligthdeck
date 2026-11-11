import { createFileRoute } from "@tanstack/react-router";
import { InlineNotification, InlineLoading } from "@carbon/react";
import { PageReportHeader } from "@/components/layout/PageReportHeader";
import { useLiveOverviewClient } from "@/demo-integration/useLiveOverviewClient";

export const Route = createFileRoute("/_authenticated/client/$clientId/csat")({
  component: CSATPage,
});

function CSATPage() {
  const { clientId } = Route.useParams();
  const { client, isLoading } = useLiveOverviewClient(clientId, 0);

  if (isLoading || !client) return <InlineLoading description="Loading..." />;

  return (
    <PageReportHeader title="Client Sentiment" pageSlug="csat" client={client}>
      <InlineNotification
        kind="info"
        title="Under development"
        subtitle="Client Sentiment & NPS history, survey breakdowns, and trend analysis will live here."
        hideCloseButton
        lowContrast
      />
    </PageReportHeader>
  );
}
