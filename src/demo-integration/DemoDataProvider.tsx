import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useDemoDataFetch } from "./useDemoData";
import { DemoDataContext } from "./demoDataContextState";
import { useAuth } from "@/contexts/AuthContext";
import { getImpersonatedEmail } from "@/lib/impersonation";

type EntitlementRecord = {
  email: string;
  role: string;
  clientIds: string[];
  geos?: string[];
  markets?: Record<string, string[]>;
  editAccess?: boolean;
};

export function DemoDataProvider({ children }: { children: ReactNode }) {
  const isDemoLive = true;
  const setIsDemoLive = () => {}; // no-op to maintain type signature
  const [activeClientId, setActiveClientId] = useState("");
  const { user, authReady } = useAuth();
  // The list arrives already scoped by the server; the email is only needed so
  // static-login mode (SSO disabled) can identify the caller. authReady gates
  // the fetch so it waits for the session check to resolve rather than firing
  // once with no caller identity and again once user.email is known.
  const { liveAllClients, isLoading, error, sourceName } = useDemoDataFetch(
    true,
    getImpersonatedEmail() || user?.email || "",
    authReady,
  );

  // Track impersonation as reactive state so scoping re-runs when it changes
  const [impersonatedEmail, setImpersonatedEmail] = useState<string | null>(getImpersonatedEmail);

  // Re-sync impersonation state when localStorage changes (e.g. after "Start Preview" navigates here)
  useEffect(() => {
    const sync = () => setImpersonatedEmail(getImpersonatedEmail());
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    const interval = setInterval(sync, 500);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      clearInterval(interval);
    };
  }, []);

  // ── Entitlement fetching ────────────────────────────────────────────────────
  // myEntitlement: the current user's own record from /api/my/entitlement (works for all users).
  // adminEntitlements: full list from /api/admin/users (only loaded when impersonating, admin only).
  const [myEntitlement, setMyEntitlement] = useState<EntitlementRecord | null | "loading">("loading");
  const [adminEntitlements, setAdminEntitlements] = useState<EntitlementRecord[]>([]);

  // Fetch the current user's own entitlement on mount and when auth changes
  useEffect(() => {
    if (!user) { setMyEntitlement(null); return; }
    setMyEntitlement("loading");
    fetch("/api/my/entitlement", { cache: "no-store" })
      .then(r => r.ok ? r.json() : { entitlement: null })
      .then((data: { entitlement: EntitlementRecord | null }) => setMyEntitlement(data.entitlement))
      .catch(() => setMyEntitlement(null));
  }, [user]);

  // Fetch full entitlements list only when impersonating (admin-only endpoint)
  useEffect(() => {
    if (!impersonatedEmail || !user?.isAdmin) { setAdminEntitlements([]); return; }
    // Sent as the REAL admin, not the impersonated user — this is an
    // admin-only endpoint and the impersonated identity would be refused.
    fetch("/api/admin/users", {
      cache: "no-store",
      headers: user?.email ? { "x-cp-email": user.email } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: EntitlementRecord[]) => setAdminEntitlements(Array.isArray(data) ? data : []))
      .catch(() => setAdminEntitlements([]));
  }, [impersonatedEmail, user?.isAdmin]);

  // Derive the effective entitlement record for all scoping decisions
  const effectiveRecord = useMemo((): EntitlementRecord | null => {
    if (!user) return null;
    // Impersonating: look up the impersonated user in the admin list
    if (impersonatedEmail) {
      return adminEntitlements.find(e => e.email === impersonatedEmail) ?? null;
    }
    // Real user: use their own fetched entitlement ("loading" treated as null until resolved)
    return myEntitlement === "loading" ? null : myEntitlement;
  }, [user, impersonatedEmail, myEntitlement, adminEntitlements]);

  // effectiveRole: drives all UI decisions (Global View visibility, Open Dashboard target, etc.)
  const effectiveRole = useMemo((): import("@/contexts/AuthContext").UserRole => {
    if (!user) return "delivery";
    // Impersonating → use the impersonated user's entitlement record role strictly
    if (impersonatedEmail) {
      if (effectiveRecord?.role === "management") return "management";
      if (effectiveRecord?.role === "sales") return "sales";
      return "delivery";
    }
    // Real admin with no impersonation → use their "View As" selection (user.role)
    if (user.isAdmin) return user.role;
    // Real non-admin → use their entitlement role, fall back to session role
    if (effectiveRecord?.role === "management") return "management";
    if (effectiveRecord?.role === "sales") return "sales";
    if (effectiveRecord?.role === "delivery") return "delivery";
    return user.role;
  }, [user, impersonatedEmail, effectiveRecord]);

  // effectiveEditAccess: mirrors the server's callerHasEditAccess (userEntitlements.ts) so
  // the UI can hide edit controls before a request round-trip — the server still enforces
  // the real rule on every write, so a stale or bypassed client value can never grant more.
  // Only role "delivery" is gated; every other effective role is always true.
  const effectiveEditAccess = useMemo((): boolean => {
    if (effectiveRole !== "delivery") return true;
    if (user?.isAdmin && !impersonatedEmail) return true; // admin previewing "as delivery"
    return effectiveRecord?.editAccess !== false;
  }, [effectiveRole, effectiveRecord, user, impersonatedEmail]);

  // isEntitlementLoading: true while own entitlement is still being fetched (avoid flash of error)
  const isEntitlementLoading = myEntitlement === "loading";

  // Scope visible clients based on effective entitlement
  const scopedClients = useMemo(() => {
    if (!user) return liveAllClients;
    // Still loading own entitlement — return full list temporarily to avoid flash of empty
    if (isEntitlementLoading) return liveAllClients;
    // Impersonating: apply impersonated user's scoping
    if (impersonatedEmail) {
      if (effectiveRecord?.role === "management") return liveAllClients;
      if (!effectiveRecord) return [];
      if (effectiveRecord.clientIds.length === 0) return liveAllClients;
      return liveAllClients.filter(c => effectiveRecord.clientIds.includes(c.clientId));
    }
    // Real admin → full access
    if (user.isAdmin) return liveAllClients;
    // Real non-admin: scope by their entitlement
    if (effectiveRecord?.role === "management") return liveAllClients;
    if (!effectiveRecord) return [];
    if (effectiveRecord.clientIds.length === 0) return liveAllClients;
    return liveAllClients.filter(c => effectiveRecord.clientIds.includes(c.clientId));
  }, [liveAllClients, user, effectiveRecord, impersonatedEmail, isEntitlementLoading]);

  const liveClientData = useMemo(() => {
    if (!activeClientId) return null;
    return scopedClients.find((c) => c.clientId === activeClientId) ?? null;
  }, [activeClientId, scopedClients]);

  const value = useMemo(
    () => ({
      isDemoLive,
      setIsDemoLive,
      liveAllClients: scopedClients,
      liveClientData,
      isLoading,
      isEntitlementLoading,
      error,
      sourceName,
      setActiveClientId,
      effectiveRole,
      effectiveEditAccess,
    }),
    [scopedClients, liveClientData, isLoading, isEntitlementLoading, error, sourceName, effectiveRole, effectiveEditAccess]
  );

  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}
