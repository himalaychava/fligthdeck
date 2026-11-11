import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UserRole = "management" | "sales" | "delivery" | "customer";

export interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  team: string;
  isAdmin?: boolean;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  authReady: boolean;
  user: AuthUser | null;
  isAdmin: boolean;
  login: (email: string, kind?: "internal" | "customer") => Promise<void>;
  logout: () => void;
  setRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "cp:auth";
const ROLE_OVERRIDE_KEY = "cp:role-override";

function readRoleOverride(): UserRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ROLE_OVERRIDE_KEY);
    return raw ? (raw as UserRole) : null;
  } catch {
    return null;
  }
}

function writeRoleOverride(role: UserRole): void {
  if (typeof window !== "undefined") window.localStorage.setItem(ROLE_OVERRIDE_KEY, role);
}

function clearRoleOverride(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(ROLE_OVERRIDE_KEY);
}

// ─── AUTHORIZED EMAIL WHITELIST ────────────────────────────────────────────
// Only these email addresses are allowed to access the Control Plane
// Case-insensitive matching
const AUTHORIZED_EMAILS = [
  "rachana.nambisan@ibm.com",
  "tanmayakumar.acharya@ibm.com",
  "sandeep.vasudevan1@ibm.com",
  "trygve.slette@ibm.com",
  "christophe_demelio@be.ibm.com",
  "josh.hart@ibm.com",
  "brent.cornell@ibm.com",
  "kumarrajeev@in.ibm.com",
  "niranjan.k6@ibm.com",
  "sandeep.p3@ibm.com",
  "alok.singh17@ibm.com",
  "sreejith.p@ibm.com",
].map(e => e.toLowerCase());

/**
 * Validates if an email is authorized to access the Control Plane
 * @param email - Email address to validate (case-insensitive)
 * @returns true if email is in the whitelist, false otherwise
 */
function isAuthorizedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return AUTHORIZED_EMAILS.includes(normalized);
}
// ────────────────────────────────────────────────────────────────────────────

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as AuthUser) : null;
    // Validate stored user is still authorized
    if (stored && !isAuthorizedEmail(stored.email)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

/** Wraps off-screen PDF export trees that reuse overview components using useAuth(). */
export function StaticAuthProvider({ children }: { children: ReactNode }) {
  const value: AuthContextValue = {
    isAuthenticated: true,
    authReady: true,
    user: {
      name: "Report Export",
      email: "report@ibm.com",
      role: "delivery",
      team: "Expert Labs — Delivery",
    },
    isAdmin: false,
    login: async () => {},
    logout: () => {},
    setRole: () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Whether OIDC is configured (VITE_ prefix so it's baked at build time)
const OIDC_ENABLED = import.meta.env.VITE_OIDC_ENABLED === "true";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (OIDC_ENABLED) {
      // OIDC mode: read session from server cookie via /auth/session
      fetch("/auth/session")
        .then(r => r.json())
        .then((data: { user: AuthUser | null }) => {
          if (data.user) {
            // Only admins can use the "View As" role override — non-admins always
            // get their real entitlement role from the session cookie.
            const roleOverride = data.user.isAdmin ? readRoleOverride() : null;
            if (!data.user.isAdmin) clearRoleOverride(); // clean up any stale override
            setUser(roleOverride ? { ...data.user, role: roleOverride } : data.user);
          } else {
            setUser(null);
          }
        })
        .catch(() => setUser(null))
        .finally(() => setAuthReady(true));
    } else {
      // Static mode: read from localStorage (legacy / local dev)
      setUser(readStoredUser());
      setAuthReady(true);
    }
  }, []);

  const login = async (email: string, kind: "internal" | "customer" = "internal") => {
    if (OIDC_ENABLED) {
      // Redirect to IBM w3id via server-side OIDC handler
      window.location.href = "/auth/login";
      return;
    }
    // Legacy static login
    if (!isAuthorizedEmail(email)) throw new Error("ACCESS_DENIED");
    const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS ?? "")
      .split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean);
    const isAdminUser = adminEmails.includes(email.toLowerCase().trim());
    const next: AuthUser =
      kind === "customer"
        ? { name: email.split("@")[0] || "Customer User", email, role: "customer", team: "Customer Portal" }
        : { name: email.split("@")[0] || "IBM User", email, role: "delivery", team: "Expert Labs — Delivery", isAdmin: isAdminUser };
    setUser(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const logout = () => {
    setUser(null);
    clearRoleOverride();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem("cp:impersonate");
    }
    if (OIDC_ENABLED) {
      window.location.href = "/auth/logout";
    }
  };

  const setRole = (role: UserRole) => {
    if (!user) return;
    const next = { ...user, role };
    setUser(next);
    // Always persist the role override so it survives a page refresh in both OIDC and static modes
    writeRoleOverride(role);
    if (!OIDC_ENABLED) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  const isAdmin = !!(user?.isAdmin);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated: !!user, authReady, user, isAdmin, login, logout, setRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
