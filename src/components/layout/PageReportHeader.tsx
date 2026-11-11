import type { Client } from "@/data/clients";
import { CurrentAccountBadge } from "@/components/layout/CurrentAccountBadge";
import { DownloadReportButton } from "@/components/report/DownloadReportButton";

/**
 * Page title row + actions. Content in `report-page-capture` is included in PDF snapshots.
 * Download button uses `data-hide-in-report` so it is omitted from exports.
 * `allowDownload={false}` hides it on pages that show customer commercial data.
 */
export function PageReportHeader({
  title,
  pageSlug,
  client,
  allowDownload = true,
  captureElementId = "report-page-capture",
  trailing,
  children,
}: {
  title: string;
  pageSlug: string;
  client?: Client;
  allowDownload?: boolean;
  captureElementId?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="cp-page-header-shell">
      <div id={captureElementId} className="cp-report-page-capture">
        <div className="cp-report-visible-header">
          <h1 className="cp-report-page-title">{title}</h1>
          <div className="cp-report-header-actions">
            <div className="cp-report-header-meta">
              {client && <CurrentAccountBadge client={client} />}
              {trailing}
            </div>
            {allowDownload && (
              <div className="cp-report-download" data-hide-in-report>
                <DownloadReportButton
                  pageTitle={title}
                  pageSlug={pageSlug}
                  client={client}
                  captureElementId={captureElementId}
                />
              </div>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
