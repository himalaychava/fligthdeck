/**
 * Health Check user guide link.
 * ──────────────────────────────
 * The help button on the Product Overview page's Health Check section points
 * here.
 *
 * Configured via VITE_HEALTH_CHECK_GUIDE_URL in .env — not hardcoded here —
 * same pattern as VITE_HEALTH_CHECK_TOOL_URL (account-overview.tsx), so both
 * Health Check links are set in the same place.
 */
export const HEALTH_CHECK_GUIDE_URL: string = import.meta.env.VITE_HEALTH_CHECK_GUIDE_URL || "";
