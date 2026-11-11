import { createContext } from "react";
import type { Client } from "@/data/clients";
import type { UserRole } from "@/contexts/AuthContext";

export interface DemoDataContextValue {
  isDemoLive: boolean;
  setIsDemoLive: (value: boolean) => void;
  liveAllClients: Client[];
  liveClientData: Client | null;
  isLoading: boolean;
  error: string | null;
  sourceName: string;
  setActiveClientId: (clientId: string) => void;
  /** The role that should drive UI decisions — respects impersonation.
   *  Admin previewing a management user → "management"; previewing delivery → "delivery". */
  effectiveRole: UserRole;
  /**
   * Whether edit controls (Contract edits, Product Overview verify/edit,
   * KPI and adoption score entry) should be shown, mirroring the server's
   * callerHasEditAccess. Only meaningful when effectiveRole is "delivery" —
   * every other role is unaffected and this is always true for them. The
   * server enforces the real rule on every write; this only decides what the
   * UI offers, so a stale client value can never grant more than the server
   * allows.
   */
  effectiveEditAccess: boolean;
}

export const DemoDataContext = createContext<DemoDataContextValue | undefined>(undefined);
