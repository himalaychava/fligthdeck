import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Dropdown, Pagination } from "@carbon/react";
import {
  ArrowRight,
  Dashboard,
  Activity,
  Group,
  Package,
  Calendar,
  Stethoscope,
  Analytics,
  Document,
} from "@carbon/icons-react";
import { useDemoData } from "@/demo-integration/DemoDataContext";
import { MOCK_CLIENTS } from "@/data/clients";
import { useAuth } from "@/contexts/AuthContext";
import { CLIENT_REPORT_SECTIONS } from "@/constants/clientReportSections";
import { SALES_ALLOWED_PATHS } from "@/components/layout/SideNavigation";
import { CustomerPickerModal } from "@/components/home/CustomerPickerModal";
import { OpportunityOverview } from "@/components/home/OpportunityOverview";
import { apiFetch } from "@/lib/apiFetch";
import { getImpersonatedEmail } from "@/lib/impersonation";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

// One quick-access tile per client section, kept in sync with the same
// section list (and Sales allow-list) the side nav uses — so a role never
// sees a landing-page shortcut to a tab it can't actually reach.
const QUICK_LINK_META: Record<string, { desc: string; icon: typeof Dashboard }> = {
  "client-overview": { desc: "Key account snapshot and executive summary", icon: Dashboard },
  "account-overview": { desc: "Contracts, renewals, product health and adoption", icon: Activity },
  // csat and initiatives removed for now — not ready to surface as landing
  // page shortcuts yet.
  // renewal removed for now — also still under development.
  insights: { desc: "Delivery insights and engagement trends", icon: Analytics },
  contract: { desc: "Contract terms and commercial details", icon: Document },
};

const QUICK_LINKS = CLIENT_REPORT_SECTIONS.filter((s) => QUICK_LINK_META[s.slug]).map((s) => ({
  label: s.label,
  path: s.path,
  ...QUICK_LINK_META[s.slug],
}));

const STAT_ICONS = [Group, Package, Calendar, Stethoscope];

/**
 * Soft Carbon tints for the four stat boxes: blue, teal, purple, green.
 * `accent` is the light top edge, `iconBg`/`icon` the badge, `bg` the faint wash.
 */
const STAT_SHADOW = "0 1px 2px rgba(0, 0, 0, 0.06), 0 4px 8px rgba(0, 0, 0, 0.06), 0 10px 20px rgba(0, 0, 0, 0.05)";
const STAT_SHADOW_HOVER = "0 2px 4px rgba(0, 0, 0, 0.07), 0 8px 16px rgba(0, 0, 0, 0.08), 0 16px 28px rgba(0, 0, 0, 0.07)";

const STAT_TONES = [
  { accent: "#a6c8ff", bg: "#f5f9ff", iconBg: "#edf5ff", icon: "#4589ff", text: "#4f6a91" },
  { accent: "#9ef0f0", bg: "#f2fcfc", iconBg: "#e3f9f9", icon: "#08bdba", text: "#4a7575" },
  { accent: "#d4bbff", bg: "#faf7ff", iconBg: "#f6f2ff", icon: "#a56eff", text: "#6e5a91" },
  { accent: "#a7f0ba", bg: "#f3fcf6", iconBg: "#e6f9ec", icon: "#42be65", text: "#4d7559" },
];

/** Customers shown on the landing page before "View all". */
const CUSTOMER_PREVIEW_COUNT = 5;
/** Rows per page once "View all" is open. */
const CUSTOMER_PAGE_SIZE = 10;

// IBM logo SVG (simplified wordmark)
function IbmLogo() {
  return (
    <svg width="38" height="15" viewBox="0 0 38 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="6" height="2" fill="#161616"/>
      <rect x="0" y="4" width="6" height="2" fill="#161616"/>
      <rect x="0" y="8" width="6" height="2" fill="#161616"/>
      <rect x="0" y="12" width="6" height="2" fill="#161616"/>
      <rect x="9" y="0" width="10" height="2" fill="#161616"/>
      <rect x="9" y="4" width="10" height="2" fill="#161616"/>
      <rect x="9" y="8" width="10" height="2" fill="#161616"/>
      <rect x="9" y="12" width="10" height="2" fill="#161616"/>
      <rect x="9" y="0" width="2" height="14" fill="#161616"/>
      <rect x="17" y="0" width="2" height="7" fill="#161616"/>
      <rect x="17" y="8" width="2" height="6" fill="#161616"/>
      <rect x="22" y="0" width="16" height="2" fill="#161616"/>
      <rect x="22" y="4" width="16" height="2" fill="#161616"/>
      <rect x="22" y="8" width="16" height="2" fill="#161616"/>
      <rect x="22" y="12" width="16" height="2" fill="#161616"/>
      <rect x="22" y="0" width="2" height="14" fill="#161616"/>
      <rect x="30" y="0" width="2" height="7" fill="#161616"/>
      <rect x="36" y="0" width="2" height="14" fill="#161616"/>
    </svg>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDemoLive, liveAllClients, effectiveRole, isLoading, isEntitlementLoading } = useDemoData();

  // Only use live clients — never fall back to MOCK_CLIENTS which would show Verizon for all users
  const clients = liveAllClients.slice().sort((a, b) => a.clientName.localeCompare(b.clientName));
  const firstClientId = clients[0]?.clientId ?? "";
  const firstName = user?.name ?? "there";

  // Customer list: a short preview by default; "View all" pages through everyone.
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const [customerPage, setCustomerPage] = useState(1);
  // Quick Access destination awaiting a customer choice (null = picker closed).
  const [pickerLink, setPickerLink] = useState<{ label: string; path: string } | null>(null);

  // Opportunity reporting is for Management, Sales and Delivery (the server
  // enforces the same rule, and limits each user to their own customers).
  // Admins always qualify (their default "View As" role is delivery, which
  // would otherwise hide it) — unless previewing another user, who is then
  // judged by their own role, exactly as the server judges the request.
  const canSeeOpportunities =
    effectiveRole === "management" ||
    effectiveRole === "sales" ||
    effectiveRole === "delivery" ||
    (!!user?.isAdmin && !getImpersonatedEmail());

  // Customer list sort. Opportunity counts come from the saved summary written
  // by Run Reports, already filtered to this user's access by the server.
  const [customerSort, setCustomerSort] = useState<"name" | "opportunities">("name");
  const [opportunityCounts, setOpportunityCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!canSeeOpportunities || customerSort !== "opportunities" || opportunityCounts) return;
    apiFetch("/api/demo/opportunities/customer-counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { counts?: Record<string, number> } | null) => setOpportunityCounts(d?.counts ?? {}))
      .catch(() => setOpportunityCounts({}));
  }, [canSeeOpportunities, customerSort, opportunityCounts]);
  const listClients =
    customerSort === "opportunities" && opportunityCounts
      ? clients
          .slice()
          .sort(
            (a, b) =>
              (opportunityCounts[b.clientId] ?? 0) - (opportunityCounts[a.clientId] ?? 0) ||
              a.clientName.localeCompare(b.clientName),
          )
      : clients;

  const visibleClients = showAllCustomers
    ? listClients.slice((customerPage - 1) * CUSTOMER_PAGE_SIZE, customerPage * CUSTOMER_PAGE_SIZE)
    : listClients.slice(0, CUSTOMER_PREVIEW_COUNT);

  // Customers are locked to their external view everywhere else in the app
  // (account-overview.tsx, client.$clientId.index.tsx) — the landing page had
  // no equivalent guard, so a customer could land here and see the same
  // internal Quick Access tiles as Sales/Delivery/Management.
  useEffect(() => {
    if (user?.role === "customer" && firstClientId) {
      navigate({ to: "/client/$clientId/external" as any, params: { clientId: firstClientId } as any });
    }
  }, [user, navigate, firstClientId]);

  // One explicit rule per role, matching the side nav's own allow-list
  // (SALES_ALLOWED_PATHS) so neither surface can drift from the other.
  // Delivery and Management get the full curated set; Customer gets none —
  // they're redirected away above, but this also covers the render before
  // that effect fires.
  const quickLinks =
    effectiveRole === "sales"
      ? QUICK_LINKS.filter((l) => SALES_ALLOWED_PATHS.has(l.path))
      : effectiveRole === "customer"
        ? []
        : QUICK_LINKS;

  // Detect non-entitled user: data and entitlements are both loaded, but zero clients scoped
  const isEntitled = user?.isAdmin || liveAllClients.length > 0;
  const entitlementsLoaded = !isLoading && !isEntitlementLoading;

  // productCount is the live count the server derives per client (Clarizen/EC
  // products for a real client, productPortfolio for a hand-maintained one —
  // see /api/demo/clients). Falling back to products.length only protects
  // against a client payload from before that field existed.
  const totalProducts = clients.reduce((sum, c) => sum + (c.productCount ?? c.products?.length ?? 0), 0);
  const renewalsDue = clients.filter(c => {
    if (!c.renewalDate) return false;
    const d = new Date(c.renewalDate);
    const now = new Date();
    const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
    return months >= 0 && months <= 6;
  }).length;

  const stats = [
    { label: "Active Clients",    value: String(clients.length) },
    { label: "Products Managed",  value: String(totalProducts)  },
    { label: "Renewals Due (6m)", value: String(renewalsDue)    },
    { label: "Health Checks",     value: "Live"                 },
  ];

  // Non-entitled user — show access denied page
  if (entitlementsLoaded && !isEntitled) {
    return (
      <div style={{ minHeight: "calc(100vh - 3rem)", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>
        <div style={{ maxWidth: 480, textAlign: "center", padding: "2rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 300, color: "#161616", marginBottom: "0.5rem" }}>
            Access Not Configured
          </h2>
          <p style={{ color: "#525252", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Your account (<strong>{user?.email}</strong>) has not been granted access to any clients yet.
            Please contact your IBM Administrator to have your entitlements configured.
          </p>
          <div style={{ borderLeft: "4px solid #f1c21b", background: "#fdf6dd", padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.8125rem", color: "#525252" }}>
            Once your administrator assigns your role and clients, refresh this page or log out and back in.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "calc(100vh - 3rem)", display: "flex", flexDirection: "column", background: "#ffffff", fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>

      {/* ── Hero ── */}
      <div style={{
        background: "#ffffff",
        border: "1px solid #e0e0e0",
        margin: "1.5rem 1.5rem 0",
        padding: "2.5rem 2.5rem 2.5rem",
        position: "relative",
        overflow: "hidden",
      }}>
        <p style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#525252", marginBottom: "0.75rem", margin: "0 0 0.75rem 0" }}>
          IBM Expert Labs Subscription Services
        </p>
        <h1 style={{ fontSize: "2rem", fontWeight: 300, color: "#161616", margin: "0 0 0.6rem 0", lineHeight: 1.25 }}>
          Welcome back,{" "}
          <span style={{ fontWeight: 600, color: "#0f62fe" }}>{firstName}</span>
        </h1>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#525252", maxWidth: 460, lineHeight: 1.6 }}>
          Your unified dashboard for health check, renewals, product adoption, and engagement insights.
        </p>
      </div>

      {/* ── Stat tiles ── */}
      {/* Read-only summary boxes — each in its own Carbon accent, deliberately
          without link styling (no underline, dark value text, default cursor). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", margin: "1.5rem 1.5rem 0" }}>
        {stats.map((s, i) => {
          const Icon = STAT_ICONS[i];
          const tone = STAT_TONES[i];
          return (
            <div key={s.label} style={{
              // Raised "bulge": white-to-tint gradient plus layered soft shadows.
              background: `linear-gradient(180deg, #ffffff 0%, ${tone.bg} 100%)`,
              borderTop: `3px solid ${tone.accent}`,
              borderRadius: "8px",
              boxShadow: STAT_SHADOW,
              padding: "1.25rem 1.5rem",
              display: "flex", alignItems: "center", gap: "1rem",
              cursor: "default",
              transition: "transform 150ms ease, box-shadow 150ms ease",
            }}
              // Gentle lift on hover — a small rise and deeper shadow only, no
              // colour or cursor change, so it never reads as a link.
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = STAT_SHADOW_HOVER;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = STAT_SHADOW;
              }}
            >
              <div style={{
                width: 44, height: 44, flexShrink: 0, borderRadius: "50%",
                background: tone.iconBg,
                boxShadow: `inset 0 0 0 1px ${tone.accent}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: tone.icon,
              }}>
                <Icon size={22} />
              </div>
              <div>
                <div style={{ fontSize: "1.875rem", fontWeight: 400, color: "#262626", lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tone.text, marginTop: "0.4rem" }}>
                  {s.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Opportunity overview (Management / Sales) ── */}
      {canSeeOpportunities && <OpportunityOverview />}

      {/* ── Quick access + Client list ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", margin: "1.5rem 1.5rem 1.5rem", flex: 1 }}>

        {/* Quick Access card */}
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem 0.75rem", borderBottom: "1px solid #e0e0e0" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#161616" }}>Quick Access</span>
          </div>
          <div>
            {quickLinks.map((link, idx) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.label}
                  onClick={() => {
                    // One customer: go straight there. Several: let them choose.
                    if (clients.length === 1) {
                      navigate({ to: link.path as any, params: { clientId: firstClientId } as any });
                    } else if (clients.length > 1) {
                      setPickerLink({ label: link.label, path: link.path });
                    }
                  }}
                  style={{
                    width: "100%", background: "none", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "1rem",
                    padding: "0.875rem 1.25rem",
                    borderBottom: idx < quickLinks.length - 1 ? "1px solid #f4f4f4" : "none",
                    textAlign: "left",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f4f4f4")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <div style={{
                    width: 36, height: 36, flexShrink: 0,
                    background: "#edf5ff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#0f62fe",
                  }}>
                    <Icon size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#161616" }}>{link.label}</div>
                    <div style={{ fontSize: "0.75rem", color: "#6f6f6f", marginTop: "0.1rem" }}>{link.desc}</div>
                  </div>
                  <ArrowRight size={16} style={{ color: "#8d8d8d", flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Customer list card — first few customers; "View all" pages through the rest in place */}
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", alignSelf: "start" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem 0.75rem", borderBottom: "1px solid #e0e0e0" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#161616" }}>
              Customer List
              {showAllCustomers && (
                <span style={{ fontWeight: 400, color: "#6f6f6f", marginLeft: "0.4rem" }}>({clients.length})</span>
              )}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {canSeeOpportunities && (
              <div style={{ width: 190 }}>
                <Dropdown
                  id="customer-sort"
                  type="inline"
                  size="sm"
                  titleText="Sort:"
                  label="A–Z"
                  items={["name", "opportunities"] as const}
                  itemToString={(i: string | null) => (i === "opportunities" ? "Most opportunities" : "A–Z")}
                  selectedItem={customerSort}
                  onChange={({ selectedItem }: { selectedItem: "name" | "opportunities" | null }) => {
                    setCustomerSort(selectedItem ?? "name");
                    setCustomerPage(1);
                  }}
                />
              </div>
            )}
            {clients.length > CUSTOMER_PREVIEW_COUNT && (
              <button
                onClick={() => {
                  setShowAllCustomers((v) => !v);
                  setCustomerPage(1);
                }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#0f62fe", fontWeight: 400, padding: 0 }}
              >
                {showAllCustomers ? "Show less" : "View all"}
              </button>
            )}
            </div>
          </div>
          <div>
            {visibleClients.map((client, idx) => (
              <button
                key={client.clientId}
                onClick={() => navigate({ to: "/client/$clientId" as any, params: { clientId: client.clientId } as any })}
                style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "0.875rem",
                  padding: "0.75rem 1.25rem",
                  borderBottom: idx < visibleClients.length - 1 ? "1px solid #f4f4f4" : "none",
                  textAlign: "left",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f4f4f4")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                <div style={{
                  width: 36, height: 36, flexShrink: 0,
                  background: "#edf5ff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.7rem", fontWeight: 700,
                  color: "#0f62fe",
                  letterSpacing: "0.04em",
                }}>
                  {client.clientName.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#161616", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {client.clientName}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#6f6f6f", marginTop: "0.1rem" }}>
                    {client.geo} · {client.productCount ?? client.products?.length ?? 0} products
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                  {customerSort === "opportunities" && (opportunityCounts?.[client.clientId] ?? 0) > 0 && (
                    <span style={{
                      fontSize: "0.7rem", fontWeight: 600, color: "#0043ce", background: "#edf5ff",
                      borderRadius: "10px", padding: "0.1rem 0.5rem", whiteSpace: "nowrap",
                    }}>
                      {opportunityCounts![client.clientId]} opportunit{opportunityCounts![client.clientId] === 1 ? "y" : "ies"}
                    </span>
                  )}
                  <ArrowRight size={16} style={{ color: "#8d8d8d" }} />
                </div>
              </button>
            ))}
          </div>
          {showAllCustomers && clients.length > CUSTOMER_PAGE_SIZE && (
            <Pagination
              page={customerPage}
              pageSize={CUSTOMER_PAGE_SIZE}
              pageSizes={[CUSTOMER_PAGE_SIZE]}
              pageSizeInputDisabled
              totalItems={clients.length}
              itemsPerPageText="Customers per page:"
              onChange={({ page }) => setCustomerPage(page)}
            />
          )}
        </div>

      </div>

      <CustomerPickerModal
        open={pickerLink !== null}
        sectionLabel={pickerLink?.label ?? ""}
        customers={clients}
        onClose={() => setPickerLink(null)}
        onSelect={(clientId) => {
          const path = pickerLink?.path;
          setPickerLink(null);
          if (path) navigate({ to: path as any, params: { clientId } as any });
        }}
      />

      {/* ── Footer ── */}
      <div style={{ borderTop: "1px solid #e0e0e0", padding: "0.875rem 1.5rem", display: "flex", alignItems: "center", gap: "2rem" }}>
        <IbmLogo />
        <span style={{ fontSize: "0.72rem", color: "#525252" }}>© {new Date().getFullYear()} IBM Corporation</span>
        <span style={{ fontSize: "0.72rem", color: "#0f62fe", cursor: "pointer" }}>Privacy</span>
        <span style={{ fontSize: "0.72rem", color: "#0f62fe", cursor: "pointer" }}>Terms of use</span>
        <span style={{ fontSize: "0.72rem", color: "#0f62fe", cursor: "pointer" }}>Contact</span>
      </div>

    </div>
  );
}
