/**
 * Tier feature switch.
 * ─────────────────────
 * Tier (Gold/Silver/Bronze/Free) is switched off for now — everything behaves
 * as Bronze, and no tier tag, badge, filter or column is shown anywhere.
 *
 * ── How this works ──
 * The ONLY thing this flag changes is what `Client.tier` resolves to in memory
 * — see dataAdapters.ts, where every client object is built from its workbook
 * row. That single override point is what makes every KPI-catalog function,
 * every tier badge, every Global View filter and the PDF export all fall back
 * to Bronze automatically, without editing each of them separately.
 *
 * The STORED tier value on disk is never touched. A client seeded as "Gold"
 * still has "Gold" sitting in the workbook; the app just never reads it while
 * this flag is off. Restoring tier later is flipping this one flag back to
 * true — nothing to re-enter, nothing to migrate.
 *
 * ── What stays exactly as it was ──
 * A client's already-recorded KPI scores for a Silver/Gold-only KPI are not
 * deleted or modified. They simply stop being SELECTABLE and stop being shown
 * on the Overview page while tier is off, because Bronze's catalog does not
 * include them — the same way any KPI outside a client's current tier already
 * behaves today. Turning tier back on makes them reappear.
 */
export const TIER_FEATURE_ENABLED = false;
