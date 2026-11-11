/**
 * Contract Overrides Service
 * ──────────────────────────
 * The manually maintained half of a contract, stored per work order.
 *
 * Two distinct kinds of data live here, and they behave differently:
 *
 *  1. GAP FILLS for Owner / Project Manager. These are commercial roles owned
 *     by Clarizen, so a stored value is only ever a stand-in for a blank. The
 *     moment Clarizen supplies its own value, Clarizen wins and the field
 *     locks read-only — see {@link mergeContractOverrides}.
 *
 *  2. DELIVERY CONSULTANTS. Never sourced from Clarizen at all; these are the
 *     hands-on technical people on the account and are always user-maintained,
 *     several per contract, each with their own products.
 *
 * Keyed by work order number so overrides follow the contract rather than the
 * client — a customer commonly holds several contracts with different teams.
 */
import fs from "node:fs";
import path from "node:path";
import { getExcelFilePath } from "./demoDataPaths";
import { getContractsForClient, type Contract } from "./caseDataReader";

/** One hands-on technical person on a contract. */
export interface DeliveryConsultant {
  id: string;
  name: string;
  /** CSP product names this consultant covers. Empty is valid. */
  products: string[];
}

/** The user-maintained fields for a single work order. */
export interface ContractOverride {
  /** Manual Owner, used only while Clarizen has none. */
  owner: string | null;
  /** Manual Project Manager, used only while Clarizen has none. */
  projectManager: string | null;
  deliveryConsultants: DeliveryConsultant[];
}

/** A contract with its overrides applied, as the UI consumes it. */
export interface ContractWithTeam extends Contract {
  /** Effective owner — Clarizen's if present, else the manual value. */
  owner: string | null;
  primaryTam: string | null;
  /** True when Clarizen supplied the value, so the field renders read-only. */
  ownerLocked: boolean;
  projectManagerLocked: boolean;
  deliveryConsultants: DeliveryConsultant[];
}

interface OverridesFile {
  clientId: string;
  /** work order number → override */
  overrides: Record<string, ContractOverride>;
  savedAt: string | null;
  savedBy: string | null;
}

function overridesDir(): string {
  return path.join(path.dirname(getExcelFilePath()), "contract_overrides");
}

function overridesPath(clientId: string): string {
  const safe = clientId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(overridesDir(), `${safe}.json`);
}

function makeId(): string {
  return `dc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readOverridesFile(clientId: string): OverridesFile {
  try {
    const p = overridesPath(clientId);
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<OverridesFile>;
      if (raw.overrides && typeof raw.overrides === "object") {
        return {
          clientId,
          overrides: raw.overrides as Record<string, ContractOverride>,
          savedAt: raw.savedAt ?? null,
          savedBy: raw.savedBy ?? null,
        };
      }
    }
  } catch {
    /* fall through to empty rather than failing the page */
  }
  return { clientId, overrides: {}, savedAt: null, savedBy: null };
}

/**
 * Contracts for a client with their manual fields merged in.
 *
 * The lock rule is applied here, in one place: a Clarizen value wins over any
 * stored manual value AND marks the field read-only. A stored value is only
 * surfaced while Clarizen's is null.
 */
export function getContractsWithTeam(clientId: string): {
  clientId: string;
  contracts: ContractWithTeam[];
  savedAt: string | null;
} {
  const file = readOverridesFile(clientId);
  const contracts = getContractsForClient(clientId).map<ContractWithTeam>((c) => {
    const o = file.overrides[c.workOrderNumber];
    const ownerLocked = c.owner !== null;
    const projectManagerLocked = c.primaryTam !== null;
    return {
      ...c,
      owner: ownerLocked ? c.owner : (o?.owner ?? null),
      primaryTam: projectManagerLocked ? c.primaryTam : (o?.projectManager ?? null),
      ownerLocked,
      projectManagerLocked,
      deliveryConsultants: o?.deliveryConsultants ?? [],
    };
  });
  return { clientId, contracts, savedAt: file.savedAt };
}

/**
 * Persist the manual fields for one work order.
 *
 * Owner and Project Manager are only stored when Clarizen has no value — a
 * locked field cannot be overridden, so an attempt to save one is ignored
 * rather than silently kept and later surprising someone.
 */
export function saveContractOverride(
  clientId: string,
  workOrderNumber: string,
  patch: {
    owner?: string | null;
    projectManager?: string | null;
    deliveryConsultants?: DeliveryConsultant[];
  },
  savedBy: string,
): { clientId: string; contracts: ContractWithTeam[]; savedAt: string | null } {
  const file = readOverridesFile(clientId);

  // Consult Clarizen so a locked field is never written.
  const clarizen = getContractsForClient(clientId).find(
    (c) => c.workOrderNumber === workOrderNumber,
  );
  const ownerLocked = clarizen ? clarizen.owner !== null : false;
  const pmLocked = clarizen ? clarizen.primaryTam !== null : false;

  const existing: ContractOverride = file.overrides[workOrderNumber] ?? {
    owner: null,
    projectManager: null,
    deliveryConsultants: [],
  };

  const clean = (v: string | null | undefined): string | null => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  /**
   * Resolve one manual field from the patch.
   *
   * A key PRESENT in the patch is authoritative even when its value is null or
   * blank — that is how the UI clears a name someone added by hand. Only an
   * ABSENT key means "leave whatever is stored alone".
   *
   * Coalescing with `??` here instead would make clearing impossible: the null
   * sent to erase the field would fall straight through to the stored value and
   * silently restore it.
   */
  const resolveField = (key: "owner" | "projectManager"): string | null =>
    key in patch ? clean(patch[key]) : clean(existing[key]);

  file.overrides[workOrderNumber] = {
    owner: ownerLocked ? null : resolveField("owner"),
    projectManager: pmLocked ? null : resolveField("projectManager"),
    deliveryConsultants: (patch.deliveryConsultants ?? existing.deliveryConsultants).map((d) => ({
      id: d.id || makeId(),
      name: String(d.name ?? "").trim(),
      products: Array.isArray(d.products) ? d.products.filter(Boolean) : [],
    })),
  };

  file.savedAt = new Date().toISOString();
  file.savedBy = savedBy || "Unknown";

  fs.mkdirSync(overridesDir(), { recursive: true });
  fs.writeFileSync(overridesPath(clientId), JSON.stringify(file, null, 2), "utf-8");

  return getContractsWithTeam(clientId);
}
