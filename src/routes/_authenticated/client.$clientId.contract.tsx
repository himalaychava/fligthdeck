import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { InlineLoading } from "@carbon/react";
import { PageReportHeader } from "@/components/layout/PageReportHeader";
import { useLiveOverviewClient } from "@/demo-integration/useLiveOverviewClient";
import { useAuth } from "@/contexts/AuthContext";
import { ContractsSection, type ContractWithTeam } from "@/components/contract/ContractsSection";
import { apiFetch } from "@/lib/apiFetch";
import { useDemoData } from "@/demo-integration/DemoDataContext";

export const Route = createFileRoute("/_authenticated/client/$clientId/contract")({
  component: ContractPage,
});

function ContractPage() {
  const { clientId } = Route.useParams();
  const { client, isLoading } = useLiveOverviewClient(clientId, 0);
  const { user } = useAuth();
  const { effectiveEditAccess } = useDemoData();

  const [contracts, setContracts] = useState<ContractWithTeam[] | null>(null);
  const [products, setProducts] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setContracts(null);
    Promise.all([
      apiFetch(`/api/demo/contracts/${encodeURIComponent(clientId)}`)
        .then((r) => r.json() as Promise<{ contracts?: ContractWithTeam[] }>)
        .catch(() => null),
      apiFetch("/api/demo/csp-products")
        .then((r) => r.json() as Promise<{ products?: string[] }>)
        .catch(() => null),
    ]).then(([c, p]) => {
      if (cancelled) return;
      setContracts(c?.contracts ?? []);
      setProducts(p?.products ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const handleReload = useCallback((next: ContractWithTeam[]) => setContracts(next), []);

  if (isLoading || !client) return <InlineLoading description="Loading…" />;

  return (
    // Customer commercial data — no PDF download.
    <PageReportHeader title="Contract" pageSlug="contract" client={client} allowDownload={false}>
      {contracts === null ? (
        <InlineLoading description="Loading contracts…" />
      ) : (
        <ContractsSection
          clientId={clientId}
          contracts={contracts}
          products={products}
          onReload={handleReload}
          callerEmail={user?.email ?? ""}
          canEdit={effectiveEditAccess}
        />
      )}
    </PageReportHeader>
  );
}
