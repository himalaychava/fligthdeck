/**
 * Report staleness
 * ────────────────
 * A report is stale when the data it was built from has moved.
 *
 * Rather than regenerating everything on a schedule — 600 clients, thousands of
 * Bob CLI calls, real money — each report carries a fingerprint of its inputs.
 * A run compares the stored fingerprint with the current one and regenerates
 * only where they differ. An upload that touches one customer therefore costs
 * one report, not six hundred.
 *
 * The fingerprint deliberately covers INPUTS, not outputs: the CSP case store,
 * the client's own case volume, and the EC product list from Clarizen. If any
 * of those move, the analysis would differ and the report is worth rebuilding.
 */
import crypto from "node:crypto";
import { cspDataFingerprint } from "./dataFingerprint";
import { getCasesForClient, getEcProductsForClient } from "./caseDataReader";

/**
 * Fingerprint of one client's insight inputs.
 *
 * Cheap while a batch case index is primed (see primeCspCaseIndex) — without
 * one, getCasesForClient re-parses the whole CSP store, so callers that check
 * many clients must prime first.
 *
 * `cspToken` lets a batch pass the CSP fingerprint it already computed. Without
 * it this stats every CSP file once per client, which for ~950 clients is
 * thousands of pointless syscalls.
 */
export function clientSourceFingerprint(clientId: string, cspToken?: string): string {
  try {
    const cases = getCasesForClient(clientId, { hwSwSaas: "Software,SaaS" });
    const ec = getEcProductsForClient(clientId);
    // Case count alone would miss an edit that replaced a case; the latest
    // open date catches most real changes without hashing every record.
    const latest = cases.reduce((m, c) => (c.openDate > m ? c.openDate : m), "");
    const material = [
      cspToken ?? cspDataFingerprint(),
      `cases=${cases.length}`,
      `latest=${latest}`,
      `ec=${[...ec].sort().join(",")}`,
    ].join("|");
    return crypto.createHash("sha1").update(material).digest("hex").slice(0, 16);
  } catch {
    // An unfingerprintable client is treated as always stale, which errs
    // toward regenerating rather than serving something we cannot vouch for.
    return `err-${Date.now()}`;
  }
}
