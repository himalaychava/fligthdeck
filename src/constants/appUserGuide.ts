/**
 * App user guide link — the "Download the user guide" item in the header's
 * support menu.
 *
 * Configured via VITE_APP_USER_GUIDE_URL in .env — not hardcoded here — so
 * the Box link can be swapped per-environment without touching source.
 */
export const APP_USER_GUIDE_URL: string = import.meta.env.VITE_APP_USER_GUIDE_URL || "";
