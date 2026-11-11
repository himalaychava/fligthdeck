import { useState } from "react";
import { Button, Modal, InlineLoading } from "@carbon/react";
import { Download } from "@carbon/icons-react";
import type { Client } from "@/data/clients";
import { defaultReportFilename, exportElementToPdf } from "@/lib/pdfExport";

/**
 * PDF snapshot of the current page.
 *
 * The full client report option was removed: it bundled the Client Overview
 * section, which carries customer commercial data (TCV, contracts, renewals),
 * into a download from any client page.
 */
export function DownloadReportButton({
  pageTitle,
  pageSlug,
  client,
  captureElementId = "report-page-capture",
}: {
  pageTitle: string;
  pageSlug: string;
  client?: Client;
  captureElementId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runExport = async () => {
    setBusy(true);
    setError(null);

    try {
      const clientName = client?.clientName ?? "report";
      const el = document.getElementById(captureElementId);
      if (!el) throw new Error("Page content not ready. Try again in a moment.");
      await exportElementToPdf(el, {
        filename: defaultReportFilename(clientName, pageTitle),
        snapshotOnly: true,
      });

      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        kind="tertiary"
        size="sm"
        renderIcon={Download}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Download Report
      </Button>

      <Modal
        id={`report-download-${pageSlug}`}
        open={open}
        modalHeading="Download report"
        primaryButtonText={busy ? "Generating…" : "Download PDF"}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={busy}
        onRequestClose={() => !busy && setOpen(false)}
        onRequestSubmit={() => runExport()}
      >
        <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
          Downloads a PDF snapshot of <strong>{pageTitle}</strong> exactly as it appears on screen
          (same layout and formatting).
        </p>

        {error && (
          <p style={{ marginTop: "1rem", color: "var(--cds-support-error)" }} role="alert">
            {error}
          </p>
        )}
        {busy && (
          <div style={{ marginTop: "1rem" }}>
            <InlineLoading description="Building PDF…" />
          </div>
        )}
      </Modal>
    </>
  );
}
