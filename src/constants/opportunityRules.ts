/**
 * Sales opportunity rules — THE single source of their thresholds.
 *
 * Read by the Executive Account Summary's Opportunities tiles, and by any
 * consolidated opportunity report built later. Both must import from here and
 * calculate through `calculateOpportunityRules` (server/opportunityRules.ts) so
 * the two can never disagree on which products qualify. Change a threshold
 * here, re-run reports, and every surface moves together.
 *
 * Every rule counts Non-EC products only — a product already under Expertise
 * Connect is regular delivery, not a sales opportunity.
 */
export const OPPORTUNITY_RULES = {
  /** Case window, counted back from the newest case in the CSP data (by open date). */
  lookbackMonths: 12,

  /** Essential Management: a product with MORE THAN this many Sev1 cases in the window. */
  essentialManagementSev1Above: 10,

  /** Expertise Connect: a product with MORE THAN this many cases, all severities, in the window. */
  expertiseConnectCasesAbove: 50,
} as const;
