/**
 * End-customer rules for Clarizen contracts held by a reseller.
 *
 * Clarizen files every contract under its holder ("Customer Name" and the
 * first "Customer Number"). For the holders listed here, a contract is filed
 * under its END customer instead ("Customer" and the second "Customer Number"),
 * so the end customer gets its own page, keyed by its own customer number,
 * where its CSP cases also land.
 *
 * Both lists are plain rows, shaped like two database tables, so they can move
 * to Db2 unchanged. Only server/endCustomerRules.ts reads them; moving them to
 * Db2 means replacing its two read functions with queries and nothing else.
 */

/** A contract holder whose contracts are filed under their end customers. */
export interface EndCustomerHolderRule {
  /** Holder's Clarizen "Customer Number" (the first Customer Number column). */
  holderCustomerNumber: string;
  /** The holder's "Customer Name" must also contain this, ignoring case and punctuation. */
  holderNameContains: string;
  /** Shown on the end customer's pages as "Contracted through …". */
  holderDisplayName: string;
}

export const END_CUSTOMER_HOLDER_RULES: readonly EndCustomerHolderRule[] = [
  {
    holderCustomerNumber: "565011",
    holderNameContains: "Saudi Business Machines",
    holderDisplayName: "Saudi Business Machines (SBM)",
  },
];

/**
 * Display names for end-customer pages, by customer number. Display only: the
 * page itself is keyed by the customer number. An end customer missing here
 * keeps Clarizen's "Customer" value and is flagged in the upload summary.
 */
export interface EndCustomerDisplayName {
  customerNumber: string;
  displayName: string;
}

export const END_CUSTOMER_DISPLAY_NAMES: readonly EndCustomerDisplayName[] = [
  { customerNumber: "102500", displayName: "Al Rajhi Bank" },
  { customerNumber: "391007", displayName: "Riyad Bank" },
  { customerNumber: "251179", displayName: "Diriyah Gate Development" },
  { customerNumber: "251402", displayName: "Saudi Electricity Company" },
];
