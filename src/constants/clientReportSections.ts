/**
 * Client sidenav sections included in a full client PDF report.
 *
 * Client Sentiment, Initiatives and Renewal are deliberately left out — their
 * routes exist but are still 27-line placeholder stubs, not a built feature.
 * Hidden from both the side nav and the PDF report since both are driven by
 * this one list; the route files themselves are untouched, so a direct URL
 * still reaches them.
 */
export const CLIENT_REPORT_SECTIONS = [
  { slug: "client-overview", label: "Client Overview", path: "/client/$clientId" as const },
  {
    slug: "account-overview",
    label: "Product Overview",
    path: "/client/$clientId/account-overview" as const,
  },
  { slug: "insights", label: "Insights", path: "/client/$clientId/insights" as const },
  { slug: "contract", label: "Contract", path: "/client/$clientId/contract" as const },
] as const;

export type ClientReportSectionSlug = (typeof CLIENT_REPORT_SECTIONS)[number]["slug"];
