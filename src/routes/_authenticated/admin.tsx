import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Button,
  TextInput,
  Checkbox,
  InlineLoading,
  InlineNotification,
  Tag,
  Select,
  SelectItem,
  Toggle,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "@carbon/react";
import { TrashCan, Edit, Save, Close, View, Search } from "@carbon/icons-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/demo-integration/DemoDataContext";
import { MOCK_CLIENTS } from "@/data/clients";
import {
  getImpersonatedEmail,
  setImpersonatedEmail,
  clearImpersonation,
} from "@/lib/impersonation";
import { UploadSection } from "@/components/admin/UploadSection";
import { OccUploadSection } from "@/components/admin/OccUploadSection";
import { LifecycleUploadSection } from "@/components/admin/LifecycleUploadSection";
import { ProductLifecycleMappingSection } from "@/components/admin/ProductLifecycleMappingSection";
import { RunReportsSection } from "@/components/admin/RunReportsSection";
import { UploadHistorySection } from "@/components/admin/UploadHistorySection";
import { ClarizenRejectsPanel } from "@/components/admin/ClarizenRejectsPanel";
import type { FieldDef } from "@/components/admin/ColumnMappingModal";
import {
  GeoMarketSelect,
  useGeoMarketTree,
  describeGeoMarket,
  clientsInGeoMarketScope,
  type GeoMarketValue,
} from "@/components/admin/GeoMarketSelect";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

// ─── ClientMultiSelect ────────────────────────────────────────────────────────

interface ClientOption {
  clientId: string;
  clientName: string;
  cmrNumber?: string;
  icnNumber?: string;
}

function getClientLabel(c: ClientOption): string {
  const num = c.cmrNumber || c.icnNumber;
  return num ? `${c.clientName} (${num})` : c.clientName;
}

function ClientMultiSelect({
  allClients,
  selected,
  disabled,
  onChange,
}: {
  allClients: ClientOption[];
  selected: string[];
  disabled?: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filtered = allClients.filter(
    (c) =>
      !selected.includes(c.clientId) &&
      (c.clientName.toLowerCase().includes(query.toLowerCase()) ||
        (c.cmrNumber && c.cmrNumber.toLowerCase().includes(query.toLowerCase())) ||
        (c.icnNumber && c.icnNumber.toLowerCase().includes(query.toLowerCase()))),
  );

  const add = (clientId: string) => {
    onChange([...selected, clientId]);
    setQuery("");
  };

  const remove = (clientId: string) => {
    onChange(selected.filter((id) => id !== clientId));
  };

  const selectedClients = allClients.filter((c) => selected.includes(c.clientId));

  return (
    <div ref={containerRef} style={{ position: "relative", maxWidth: 560 }}>
      {/* Selected tags */}
      {selectedClients.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.5rem" }}>
          {selectedClients.map((c) => (
            <span
              key={c.clientId}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                background: "#e8f1ff",
                border: "1px solid #a6c8ff",
                borderRadius: 2,
                padding: "0.2rem 0.5rem",
                fontSize: "0.8125rem",
                color: "#0043ce",
              }}
            >
              {getClientLabel(c)}
              {!disabled && (
                <button
                  onClick={() => remove(c.clientId)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                    color: "#0043ce",
                    display: "flex",
                    alignItems: "center",
                  }}
                  aria-label={`Remove ${c.clientName}`}
                >
                  <Close size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      {!disabled && (
        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: "0.625rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#525252",
              pointerEvents: "none",
              display: "flex",
            }}
          >
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder={`Search clients… (${allClients.length - selected.length} available)`}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem 0.5rem 2rem",
              border: "1px solid #c6c6c6",
              borderRadius: 2,
              fontSize: "0.875rem",
              fontFamily: "'IBM Plex Sans', sans-serif",
              color: "#161616",
              background: "#fff",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {/* Dropdown list */}
      {open && !disabled && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #c6c6c6",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            maxHeight: 220,
            overflowY: "auto",
            zIndex: 1000,
            borderRadius: 2,
          }}
        >
          {filtered.map((c) => (
            <div
              key={c.clientId}
              onMouseDown={(e) => {
                e.preventDefault();
                add(c.clientId);
              }}
              style={{
                padding: "0.5rem 0.875rem",
                fontSize: "0.875rem",
                color: "#161616",
                cursor: "pointer",
                borderBottom: "1px solid #f4f4f4",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#e8f1ff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              {getClientLabel(c)}
            </div>
          ))}
        </div>
      )}
      {open && !disabled && filtered.length === 0 && query && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #c6c6c6",
            padding: "0.5rem 0.875rem",
            fontSize: "0.8125rem",
            color: "#6f6f6f",
            zIndex: 1000,
            borderRadius: 2,
          }}
        >
          No clients match "{query}"
        </div>
      )}
    </div>
  );
}

// ─── Field definitions for column mapping ─────────────────────────────────────

const CLARIZEN_FIELDS: FieldDef[] = [
  { key: "customerNumber", label: "Customer Number", required: true },
  { key: "customerName", label: "Customer Name", required: true },
  { key: "ecEmProducts", label: "EC/EM Products", required: false },
  { key: "contractStart", label: "Contract Start", required: false },
  { key: "contractEnd", label: "Contract End", required: false },
];

const CSP_FIELDS: FieldDef[] = [
  { key: "caseNumber", label: "Case Number", required: true },
  { key: "cmrNumber", label: "CMR Number", required: true },
  { key: "customerName", label: "Customer Name", required: false },
  { key: "productName", label: "Ut 30 Name", required: true },
  { key: "productNameAlt", label: "Product", required: false },
  { key: "productVersion", label: "Product Version", required: false },
  { key: "priority", label: "Priority", required: false },
  { key: "initialSeverity", label: "Initial Severity", required: false },
  { key: "currentSeverity", label: "Current Severity", required: false },
  { key: "maxSeverity", label: "Max Severity", required: false },
  { key: "status", label: "Status", required: true },
  { key: "openDate", label: "Open Date", required: false },
  { key: "closeDate", label: "Close Date", required: false },
  { key: "summary", label: "Summary", required: false },
  { key: "hwSwSaas", label: "HW/SW/SaaS", required: false },
  { key: "division", label: "Division", required: false },
  { key: "segment", label: "Segment", required: false },
];

const OCC_FIELDS: FieldDef[] = [
  { key: "l30Code", label: "SWS L30 Code", required: true },
  { key: "l30Desc", label: "SWS L30 Desc", required: true },
];

const LIFECYCLE_FIELDS: FieldDef[] = [
  { key: "productName", label: "IBM Product", required: true },
  { key: "vrm", label: "VRM", required: true },
  { key: "type", label: "Type", required: true },
  {
    key: "endOfSupport",
    label: "Transition to Extended/Sustained, End of Support",
    required: true,
  },
  {
    key: "extendedEndOfSupport",
    label: "Completion of Extended, Sustained, Extension availability",
    required: false,
  },
  { key: "lifecyclePolicy", label: "Lifecycle Policy", required: false },
  { key: "generalAvailability", label: "General Availability", required: false },
  { key: "pid", label: "PID", required: false },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "management" | "delivery" | "sales";

interface UserEntitlement {
  email: string;
  role: Role;
  clientIds: string[];
  /** Empty = all geographies. */
  geos: string[];
  /** geo -> markets. Missing or empty for a geo = all markets in that geo. */
  markets: Record<string, string[]>;
  /**
   * Whether this user sees edit controls app-wide. Only enforced for role
   * "delivery" today — Management and Sales are unaffected regardless of this
   * value, which is what makes it safe to store (and default true) for every
   * role now rather than special-casing the shape per role.
   */
  editAccess: boolean;
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "management", label: "Management" },
  { value: "delivery", label: "Delivery" },
  { value: "sales", label: "Sales" },
];

function adminHeaders(email: string): Record<string, string> {
  return { "x-cp-email": email };
}

async function fetchUsers(email: string): Promise<UserEntitlement[]> {
  const res = await fetch("/api/admin/users", { cache: "no-store", headers: adminHeaders(email) });
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  return res.json() as Promise<UserEntitlement[]>;
}

async function saveUser(email: string, entry: UserEntitlement): Promise<UserEntitlement[]> {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminHeaders(email) },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Failed to save user (${res.status})`);
  const data = (await res.json()) as { users: UserEntitlement[] };
  return data.users;
}

async function deleteUser(email: string, target: string): Promise<UserEntitlement[]> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(target)}`, {
    method: "DELETE",
    headers: adminHeaders(email),
  });
  if (!res.ok) throw new Error(`Failed to remove user (${res.status})`);
  const data = (await res.json()) as { users: UserEntitlement[] };
  return data.users;
}

interface UploadStatus {
  clarizen: { customerCount: number; lastUpdated: string | null };
  csp: {
    caseCount: number;
    lastUpdated: string | null;
    history?: Array<{ id: string; fileName: string; uploadedAt: string; uploadedBy: string }>;
  };
  occ: { productCount: number; lastUpdated: string | null };
  lifecycle: { productCount: number; lastUpdated: string | null };
  mappings: {
    clarizen?: Record<string, string>;
    csp?: Record<string, string>;
    occ?: Record<string, string>;
    lifecycle?: Record<string, string>;
  };
}

function AdminPage() {
  const { user, isAdmin, authReady } = useAuth();

  // Selected Admin tab, remembered in this browser only.
  const [adminTab, setAdminTab] = useState(0);
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem("cp:admin-tab"));
      if (Number.isInteger(saved) && saved >= 0 && saved <= 3) setAdminTab(saved);
    } catch {
      /* storage unavailable — stay on the first tab */
    }
  }, []);
  const selectAdminTab = (index: number) => {
    setAdminTab(index);
    try {
      window.localStorage.setItem("cp:admin-tab", String(index));
    } catch {
      /* not remembered, which is fine */
    }
  };
  const navigate = useNavigate();
  const { isDemoLive, liveAllClients } = useDemoData();
  const allClients = isDemoLive && liveAllClients.length > 0 ? liveAllClients : MOCK_CLIENTS;

  const [users, setUsers] = useState<UserEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // ── Data ingestion state ─────────────────────────────────────────────────
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);

  const callerEmail = user?.email ?? "";

  const refreshUploadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/upload/status", {
        cache: "no-store",
        headers: adminHeaders(callerEmail),
      });
      if (res.ok) setUploadStatus((await res.json()) as UploadStatus);
    } catch {
      /* non-fatal */
    }
  }, [callerEmail]);

  // ── Add / Update form state ───────────────────────────────────────────────
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<Role>("delivery");
  const [formClients, setFormClients] = useState<string[]>([]);
  const [formGeo, setFormGeo] = useState<GeoMarketValue>({ geos: [], markets: {} });
  // Only shown/enforced for Delivery today. Defaults on, per the requirement
  // that a new Delivery user starts with edit access.
  const [formEditAccess, setFormEditAccess] = useState(true);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  // ── Inline edit state ─────────────────────────────────────────────────────
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<Role>("delivery");
  const [editClients, setEditClients] = useState<string[]>([]);
  const [editGeo, setEditGeo] = useState<GeoMarketValue>({ geos: [], markets: {} });
  const [editEditAccess, setEditEditAccess] = useState(true);
  // One fetch shared by the add form and every edit row.
  const { tree: geoTree, loading: geoLoading } = useGeoMarketTree();

  // Only clients the chosen geography/market would actually admit are offered.
  // Assigning one outside it has no effect — the two restrictions are ANDed —
  // so showing them would invite a mis-assignment that fails silently.
  const formScopedClients = useMemo(
    () => clientsInGeoMarketScope(allClients, formGeo),
    [allClients, formGeo],
  );
  const editScopedClients = useMemo(
    () => clientsInGeoMarketScope(allClients, editGeo),
    [allClients, editGeo],
  );

  // Narrowing the geography drops any already-picked client that falls outside
  // it, so what is saved always matches what is on screen.
  useEffect(() => {
    const ok = new Set(formScopedClients.map((c: ClientOption) => c.clientId));
    setFormClients((prev) =>
      prev.every((id) => ok.has(id)) ? prev : prev.filter((id) => ok.has(id)),
    );
  }, [formScopedClients]);

  useEffect(() => {
    const ok = new Set(editScopedClients.map((c: ClientOption) => c.clientId));
    setEditClients((prev) =>
      prev.every((id) => ok.has(id)) ? prev : prev.filter((id) => ok.has(id)),
    );
  }, [editScopedClients]);
  const [editSaving, setEditSaving] = useState(false);

  // ── Impersonation state ───────────────────────────────────────────────────
  const [impersonating, setImpersonating] = useState<string | null>(getImpersonatedEmail());
  const [impersonateTarget, setImpersonateTarget] = useState<string>("");

  const startImpersonation = () => {
    if (!impersonateTarget) return;
    setImpersonatedEmail(impersonateTarget);
    setImpersonating(impersonateTarget);
    navigate({ to: "/home" as any });
  };

  const stopImpersonation = () => {
    clearImpersonation();
    setImpersonating(null);
    setImpersonateTarget("");
  };

  // Redirect non-admins
  useEffect(() => {
    if (!authReady) return;
    if (!isAdmin) navigate({ to: "/home" as any });
  }, [authReady, isAdmin, navigate]);

  const reload = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const data = await fetchUsers(callerEmail);
      setUsers(data);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [callerEmail]);

  useEffect(() => {
    if (authReady && isAdmin) {
      reload();
      refreshUploadStatus();
    }
  }, [authReady, isAdmin, reload, refreshUploadStatus]);

  // When management is selected, auto-select and lock all clients
  const handleFormRoleChange = (role: Role) => {
    setFormRole(role);
    if (role === "management") setFormClients([]);
  };

  const handleFormSubmit = async () => {
    if (!formEmail.trim()) {
      setFormError("Email is required.");
      return;
    }
    // A grant needs SOME boundary, but either kind will do.
    //
    // Selecting no clients while a geography/market is granted is a valid and
    // useful grant — it means "every client in that geography", which is how
    // most regional users should be set up. It is only an unbounded grant
    // (no geography AND no clients) that is refused, since that would quietly
    // hand a Delivery or Sales user the entire customer base.
    if (formRole !== "management" && formClients.length === 0 && formGeo.geos.length === 0) {
      setFormError(
        `Saving with no geography and no clients would grant access to all ${allClients.length} customers, ` +
          "because an empty list means \u201cno restriction\u201d. Grant a geography/market, or assign specific clients.",
      );
      return;
    }
    setFormSaving(true);
    setFormError(null);
    setFormSuccess(false);
    try {
      const updated = await saveUser(callerEmail, {
        email: formEmail.trim().toLowerCase(),
        role: formRole,
        clientIds: formClients,
        geos: formGeo.geos,
        markets: formGeo.markets,
        editAccess: formEditAccess,
      });
      setUsers(updated);
      setFormEmail("");
      setFormRole("delivery");
      setFormClients([]);
      setFormGeo({ geos: [], markets: {} });
      setFormEditAccess(true);
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 3000);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setFormSaving(false);
    }
  };

  const startEdit = (u: UserEntitlement) => {
    setEditingEmail(u.email);
    setEditRole(u.role);
    setEditClients([...u.clientIds]);
    setEditGeo({ geos: [...(u.geos ?? [])], markets: { ...(u.markets ?? {}) } });
    setEditEditAccess(u.editAccess !== false);
  };

  const cancelEdit = () => setEditingEmail(null);

  const handleEditRoleChange = (role: Role) => {
    setEditRole(role);
    if (role === "management") setEditClients([]);
  };

  const handleEditSave = async () => {
    if (!editingEmail) return;
    setEditSaving(true);
    try {
      const updated = await saveUser(callerEmail, {
        email: editingEmail,
        role: editRole,
        clientIds: editClients,
        geos: editGeo.geos,
        markets: editGeo.markets,
        editAccess: editEditAccess,
      });
      setUsers(updated);
      setEditingEmail(null);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (email: string) => {
    if (!confirm(`Remove access for ${email}?`)) return;
    try {
      const updated = await deleteUser(callerEmail, email);
      setUsers(updated);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Remove failed");
    }
  };

  if (!authReady) return <InlineLoading description="Loading…" />;
  if (!isAdmin) return null;

  const sectionStyle: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid #e0e0e0",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: "0.875rem",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    borderBottom: "2px solid #0f62fe",
    paddingBottom: "0.5rem",
    marginBottom: "1.25rem",
    color: "#161616",
  };

  return (
    <div style={{ maxWidth: 960, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 300, marginBottom: "0.25rem" }}>Admin Panel</h1>
      <p style={{ color: "#525252", marginBottom: "1.25rem", fontSize: "0.875rem" }}>
        Manage user roles, client access, and data ingestion for the Control Plane.
      </p>

      {/* Admin info banner */}
      <div
        style={{
          borderLeft: "4px solid #0f62fe",
          background: "#edf5ff",
          padding: "0.75rem 1rem",
          marginBottom: "1.5rem",
          fontSize: "0.875rem",
        }}
      >
        Logged in as <strong>{user?.email}</strong> (Administrator).
      </div>

      {pageError && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={pageError}
          lowContrast
          style={{ marginBottom: "1rem" }}
        />
      )}

      <Tabs
        selectedIndex={adminTab}
        onChange={({ selectedIndex }: { selectedIndex: number }) => selectAdminTab(selectedIndex)}
      >
        <TabList aria-label="Admin sections">
          <Tab>Users &amp; Access</Tab>
          <Tab>Data Uploads</Tab>
          <Tab>Run Reports</Tab>
          <Tab>Upload History</Tab>
        </TabList>
        <TabPanels>
          <TabPanel style={{ padding: "1.5rem 0 0" }}>
            {/* ── Section 1: Add / Update ── */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Add or Update User Entitlements</div>

              <div style={{ marginBottom: "1rem", maxWidth: 400 }}>
                <TextInput
                  id="admin-email"
                  labelText="IBM SSO Email Address"
                  placeholder="user@ibm.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  size="md"
                />
              </div>

              {/* Role — checkbox style (radio behaviour) */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Role
                </div>
                <div style={{ display: "flex", gap: "1.5rem" }}>
                  {ROLE_OPTIONS.map((r) => (
                    <Checkbox
                      key={r.value}
                      id={`form-role-${r.value}`}
                      labelText={r.label}
                      checked={formRole === r.value}
                      onChange={() => handleFormRoleChange(r.value)}
                    />
                  ))}
                </div>
                {/* Edit Access — Delivery only for now; structured so extending to
                    another role later is adding it to this same condition. */}
                {formRole === "delivery" && (
                  <div style={{ marginTop: "0.75rem" }}>
                    <Toggle
                      id="form-edit-access"
                      size="sm"
                      labelText="Edit Access"
                      labelA="No"
                      labelB="Yes"
                      toggled={formEditAccess}
                      onToggle={(checked: boolean) => setFormEditAccess(checked)}
                    />
                    <p style={{ fontSize: "0.75rem", color: "#525252", marginTop: "0.25rem" }}>
                      When off, this user sees view-only pages — no Contract edits, no Product
                      Overview verify/edit, no KPI score entry.
                    </p>
                  </div>
                )}
              </div>

              {/* Geography & Market — applies to every role, including Management */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Geography &amp; Market Access
                </div>
                <GeoMarketSelect
                  tree={geoTree}
                  loading={geoLoading}
                  value={formGeo}
                  onChange={setFormGeo}
                />
              </div>

              {/* Client entitlements — scoped to the geography/market chosen above */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Client Entitlements
                  {formRole === "management" && (
                    <span style={{ fontWeight: 400, color: "#525252", marginLeft: "0.5rem" }}>
                      (All clients — Management sees everything)
                    </span>
                  )}
                </div>
                {formRole === "management" ? (
                  <div style={{ fontSize: "0.8125rem", color: "#525252", fontStyle: "italic" }}>
                    All clients automatically assigned
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: "0.75rem", color: "#525252", marginBottom: "0.4rem" }}>
                      {formGeo.geos.length === 0
                        ? `All ${allClients.length} clients available. Pick specific clients, or grant a geography above instead.`
                        : `${formScopedClients.length} of ${allClients.length} clients are in the selected geography/market. ` +
                          `Leave this empty to grant all ${formScopedClients.length}, or pick specific ones to narrow further.`}
                    </div>
                    <ClientMultiSelect
                      allClients={formScopedClients}
                      selected={formClients}
                      onChange={setFormClients}
                    />
                  </>
                )}
              </div>

              {formError && (
                <p style={{ color: "#da1e28", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
                  ⚠ {formError}
                </p>
              )}
              {formSuccess && (
                <p style={{ color: "#198038", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
                  ✓ User entitlement saved.
                </p>
              )}

              <Button kind="primary" onClick={handleFormSubmit} disabled={formSaving}>
                {formSaving ? <InlineLoading description="Saving…" /> : "Save Entitlements"}
              </Button>
            </div>

            {/* ── Section 2: Current Entitlements ── */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Current User Entitlements</div>

              {loading ? (
                <InlineLoading description="Loading users…" />
              ) : users.length === 0 ? (
                <p style={{ color: "#525252", fontSize: "0.875rem" }}>
                  No user entitlements configured yet.
                </p>
              ) : (
                /* Scrolls inside its own container so the widest column can never
                   push the table past the section border. */
                <div style={{ overflowX: "auto", width: "100%" }}>
                  <table
                    style={{
                      width: "100%",
                      minWidth: 880,
                      tableLayout: "fixed",
                      borderCollapse: "collapse",
                      fontSize: "0.875rem",
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "21%" }} />
                      <col style={{ width: "9%" }} />
                      <col style={{ width: "26%" }} />
                      <col style={{ width: "28%" }} />
                      <col style={{ width: "16%" }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: "#f4f4f4", textAlign: "left" }}>
                        {[
                          "EMAIL",
                          "ROLE",
                          "GEOGRAPHY / MARKET",
                          "ASSIGNED CLIENTS",
                          "UPDATE / REMOVE",
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "0.625rem 0.75rem",
                              fontWeight: 600,
                              fontSize: "0.75rem",
                              letterSpacing: "0.06em",
                              borderBottom: "1px solid #e0e0e0",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        const isEditing = editingEmail === u.email;
                        const assignedNames =
                          u.role === "management"
                            ? allClients.map((c) => c.clientName)
                            : allClients
                                .filter((c) => u.clientIds.includes(c.clientId))
                                .map((c) => c.clientName);

                        return (
                          <tr
                            key={u.email}
                            style={{ borderBottom: "1px solid #e0e0e0", verticalAlign: "top" }}
                          >
                            {/* Email */}
                            <td
                              style={{
                                padding: "0.875rem 0.75rem",
                                fontWeight: 500,
                                overflowWrap: "anywhere",
                              }}
                            >
                              {u.email}
                            </td>

                            {/* Role — show Tag or edit inline */}
                            <td style={{ padding: "0.875rem 0.75rem", verticalAlign: "top" }}>
                              {isEditing ? (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.25rem",
                                  }}
                                >
                                  {ROLE_OPTIONS.map((r) => (
                                    <Checkbox
                                      key={r.value}
                                      id={`edit-role-${u.email}-${r.value}`}
                                      labelText={r.label}
                                      checked={editRole === r.value}
                                      onChange={() => handleEditRoleChange(r.value)}
                                    />
                                  ))}
                                  {editRole === "delivery" && (
                                    <div style={{ marginTop: "0.4rem" }}>
                                      <Toggle
                                        id={`edit-edit-access-${u.email}`}
                                        size="sm"
                                        labelText="Edit Access"
                                        labelA="No"
                                        labelB="Yes"
                                        toggled={editEditAccess}
                                        onToggle={(checked: boolean) => setEditEditAccess(checked)}
                                      />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.3rem",
                                    alignItems: "flex-start",
                                  }}
                                >
                                  <Tag
                                    type={
                                      u.role === "management"
                                        ? "blue"
                                        : u.role === "sales"
                                          ? "teal"
                                          : "gray"
                                    }
                                    size="sm"
                                  >
                                    {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                                  </Tag>
                                  {/* Only Delivery is gated today — this stays quiet for
                                      every other role so the table doesn't clutter. */}
                                  {u.role === "delivery" && u.editAccess === false && (
                                    <Tag type="red" size="sm">
                                      Edit access: No
                                    </Tag>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Geography / Market — editable inline, same as role and clients */}
                            <td style={{ padding: "0.875rem 0.75rem", verticalAlign: "top" }}>
                              {isEditing ? (
                                <GeoMarketSelect
                                  tree={geoTree}
                                  loading={geoLoading}
                                  value={editGeo}
                                  onChange={setEditGeo}
                                />
                              ) : (u.geos?.length ?? 0) === 0 ? (
                                <span
                                  style={{
                                    color: "#525252",
                                    fontStyle: "italic",
                                    fontSize: "0.8125rem",
                                  }}
                                >
                                  All geographies
                                </span>
                              ) : (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                                  {u.geos.map((g) => {
                                    const m = u.markets?.[g] ?? [];
                                    return (
                                      <Tag
                                        key={g}
                                        type={m.length === 0 ? "blue" : "cool-gray"}
                                        size="sm"
                                        style={{ maxWidth: "100%" }}
                                      >
                                        {m.length === 0
                                          ? `${g} — all markets`
                                          : `${g}: ${m.join(", ")}`}
                                      </Tag>
                                    );
                                  })}
                                </div>
                              )}
                            </td>

                            {/* Clients */}
                            <td style={{ padding: "0.875rem 1rem" }}>
                              {isEditing ? (
                                editRole === "management" ? (
                                  <div
                                    style={{
                                      fontSize: "0.8125rem",
                                      color: "#525252",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    All clients automatically assigned
                                  </div>
                                ) : (
                                  <>
                                    <div
                                      style={{
                                        fontSize: "0.75rem",
                                        color: "#525252",
                                        marginBottom: "0.4rem",
                                      }}
                                    >
                                      {editGeo.geos.length === 0
                                        ? "All geographies — every client available"
                                        : `${editScopedClients.length} client${editScopedClients.length === 1 ? "" : "s"} in scope`}
                                    </div>
                                    <ClientMultiSelect
                                      allClients={editScopedClients}
                                      selected={editClients}
                                      onChange={setEditClients}
                                    />
                                  </>
                                )
                              ) : u.role === "management" ? (
                                <span
                                  style={{
                                    color: "#525252",
                                    fontStyle: "italic",
                                    fontSize: "0.8125rem",
                                  }}
                                >
                                  All clients
                                </span>
                              ) : (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                                  {assignedNames.length === 0 ? (
                                    <span style={{ color: "#a8a8a8", fontSize: "0.8125rem" }}>
                                      None
                                    </span>
                                  ) : (
                                    assignedNames.map((name) => (
                                      <Tag
                                        key={name}
                                        type="blue"
                                        size="sm"
                                        style={{ maxWidth: "100%" }}
                                      >
                                        {name}
                                      </Tag>
                                    ))
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Actions — stacked, so a narrow column still fits both */}
                            <td style={{ padding: "0.875rem 0.75rem", verticalAlign: "top" }}>
                              {isEditing ? (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.35rem",
                                  }}
                                >
                                  <Button
                                    kind="primary"
                                    size="sm"
                                    renderIcon={editSaving ? undefined : Save}
                                    onClick={handleEditSave}
                                    disabled={editSaving}
                                  >
                                    {editSaving ? "Saving…" : "Update"}
                                  </Button>
                                  <Button
                                    kind="ghost"
                                    size="sm"
                                    renderIcon={Close}
                                    onClick={cancelEdit}
                                    disabled={editSaving}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.35rem",
                                  }}
                                >
                                  <Button
                                    kind="tertiary"
                                    size="sm"
                                    renderIcon={Edit}
                                    onClick={() => startEdit(u)}
                                  >
                                    Update
                                  </Button>
                                  <Button
                                    kind="danger"
                                    size="sm"
                                    renderIcon={TrashCan}
                                    onClick={() => handleDelete(u.email)}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Impersonation panel ── */}
            <div
              style={{ ...sectionStyle, borderLeft: "4px solid #f1c21b", background: "#fdf6dd" }}
            >
              <div
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  marginBottom: "0.75rem",
                  color: "#161616",
                }}
              >
                🔍 Preview as Another User (Test Entitlements)
              </div>
              <p style={{ fontSize: "0.8125rem", color: "#525252", margin: "0 0 0.875rem" }}>
                Select a user from the entitlements list to preview the app exactly as they would
                see it. A banner will appear at the top. Click <strong>Stop Preview</strong> to
                return to your admin view.
              </p>

              {impersonating ? (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}
                >
                  <span style={{ fontSize: "0.875rem" }}>
                    Currently previewing as <strong>{impersonating}</strong>
                  </span>
                  <Button kind="danger" size="sm" renderIcon={Close} onClick={stopImpersonation}>
                    Stop Preview
                  </Button>
                  <Button kind="ghost" size="sm" onClick={() => navigate({ to: "/home" as any })}>
                    Go to Home
                  </Button>
                </div>
              ) : (
                <div
                  style={{ display: "flex", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}
                >
                  <div style={{ flex: "0 0 320px" }}>
                    <Select
                      id="impersonate-select"
                      labelText="Select user to preview as"
                      value={impersonateTarget}
                      onChange={(e) => setImpersonateTarget(e.target.value)}
                    >
                      <SelectItem value="" text="— choose a user —" />
                      {users.map((u) => (
                        <SelectItem
                          key={u.email}
                          value={u.email}
                          text={`${u.email} (${u.role}${u.role !== "management" ? `, ${u.clientIds.length} client${u.clientIds.length !== 1 ? "s" : ""}` : ""})`}
                        />
                      ))}
                    </Select>
                  </div>
                  <Button
                    kind="secondary"
                    size="md"
                    renderIcon={View}
                    onClick={startImpersonation}
                    disabled={!impersonateTarget}
                  >
                    Start Preview
                  </Button>
                </div>
              )}
            </div>
          </TabPanel>
          <TabPanel style={{ padding: "1.5rem 0 0" }}>
            {/* ── Section: Data Ingestion ── */}
            <div style={{ ...sectionStyle, padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  ...sectionTitleStyle,
                  margin: 0,
                  padding: "1rem 1.5rem 0.875rem",
                  borderBottom: "2px solid #0f62fe",
                }}
              >
                Data Ingestion
              </div>
              <div style={{ padding: "1.25rem 1.5rem 0.25rem" }}>
                <p style={{ fontSize: "0.8125rem", color: "#525252", marginBottom: "1.25rem" }}>
                  Upload Clarizen customer master data and monthly CSP case exports. Uploaded data
                  powers the Insights module for all clients.
                </p>

                {/* ── Filtered Insights Export download ── */}
                <div
                  style={{
                    background: "#f4f4f4",
                    border: "1px solid #e0e0e0",
                    padding: "0.75rem 1rem",
                    marginBottom: "1.25rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#161616" }}>
                      Filtered Insights Data Export
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#525252", marginTop: 2 }}>
                      Auto-generated after each CSP upload — Software cases only, known clients
                      only, one sheet per month.
                    </div>
                  </div>
                  <a
                    href="/api/admin/export/csp-insights"
                    download="csp_filtered_insights.xlsx"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      padding: "0.5rem 1rem",
                      background: "#0f62fe",
                      color: "#fff",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      textDecoration: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    ⬇ Download Excel
                  </a>
                </div>

                {/* ── Clarizen Upload ── */}
                <UploadSection
                  uploadType="clarizen"
                  title="Upload Clarizen Data"
                  description="Upload the Clarizen customer master dataset. All rows are stored as-is — multiple rows per customer are preserved (one per product code). New customers are automatically onboarded to the Control Plane."
                  fieldDefs={CLARIZEN_FIELDS}
                  savedMapping={uploadStatus?.mappings?.clarizen ?? {}}
                  statusBadge={
                    uploadStatus
                      ? {
                          label: "contract rows in master (multiple rows per customer)",
                          count: uploadStatus.clarizen.customerCount,
                          lastUpdated: uploadStatus.clarizen.lastUpdated,
                        }
                      : null
                  }
                  onUploadComplete={refreshUploadStatus}
                  accentColor="#0f62fe"
                  callerEmail={callerEmail}
                />

                {/* ── CSP Upload ── */}
                <UploadSection
                  uploadType="csp"
                  title="Upload CSP Data"
                  description="Upload the monthly Salesforce (CSP) case dump. The 'Ut 30 Name' column is used as the product name. Enable 'Clear & Replace' to wipe existing data before importing."
                  fieldDefs={CSP_FIELDS}
                  savedMapping={uploadStatus?.mappings?.csp ?? {}}
                  statusBadge={
                    uploadStatus
                      ? {
                          label: "cases in store",
                          count: uploadStatus.csp.caseCount,
                          lastUpdated: uploadStatus.csp.lastUpdated,
                        }
                      : null
                  }
                  onUploadComplete={refreshUploadStatus}
                  accentColor="#6929c4"
                  callerEmail={callerEmail}
                />

                {/* ── OCC Upload ── */}
                <OccUploadSection
                  fieldDefs={OCC_FIELDS}
                  savedMapping={uploadStatus?.mappings?.occ ?? {}}
                  statusBadge={
                    uploadStatus
                      ? {
                          label: "products in OCC store",
                          count: uploadStatus.occ?.productCount ?? 0,
                          lastUpdated: uploadStatus.occ?.lastUpdated ?? null,
                        }
                      : null
                  }
                  onUploadComplete={refreshUploadStatus}
                  callerEmail={callerEmail}
                />

                {/* ── Rows the last Clarizen upload refused ── */}
                <ClarizenRejectsPanel />

                {/* ── Product Lifecycle Catalog Upload ── */}
                <LifecycleUploadSection
                  fieldDefs={LIFECYCLE_FIELDS}
                  savedMapping={uploadStatus?.mappings?.lifecycle ?? {}}
                  statusBadge={
                    uploadStatus
                      ? {
                          label: "software products in lifecycle catalog",
                          count: uploadStatus.lifecycle?.productCount ?? 0,
                          lastUpdated: uploadStatus.lifecycle?.lastUpdated ?? null,
                        }
                      : null
                  }
                  onUploadComplete={refreshUploadStatus}
                  callerEmail={callerEmail}
                />

                {/* ── Product Lifecycle Mapping ── */}
                <ProductLifecycleMappingSection callerEmail={callerEmail} />
              </div>
            </div>
          </TabPanel>
          <TabPanel style={{ padding: "1.5rem 0 0" }}>
            <RunReportsSection />
          </TabPanel>
          <TabPanel style={{ padding: "1.5rem 0 0" }}>
            <UploadHistorySection active={adminTab === 3} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}
