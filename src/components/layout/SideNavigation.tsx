import {
  SideNav,
  SideNavItems,
  SideNavLink,
  InlineLoading,
  Select,
  SelectItem,
} from "@carbon/react";
import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "@tanstack/react-router";
import { MOCK_CLIENTS, type Client } from "@/data/clients";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/demo-integration/DemoDataContext";
import { getImpersonatedEmail } from "@/lib/impersonation";
import { GLOBAL_CLIENT_ID, GLOBAL_VIEW_SELECTOR, isGlobalClientId } from "@/constants/globalView";
import { CLIENT_REPORT_SECTIONS } from "@/constants/clientReportSections";
import {
  ClientSelectorCombo,
  type ClientSelectorItem,
} from "@/components/layout/ClientSelectorCombo";

const CLIENT_NAV = CLIENT_REPORT_SECTIONS.map((section, index) => ({
  label: section.label,
  to: section.path,
  end: index === 0,
}));

const GLOBAL_NAV = [{ label: "Global View", to: "/client/$clientId/global", end: false }];

/**
 * Tabs a Sales user may see. Everything else is hidden for that role.
 *
 * Matched on the route path rather than the label so a future rename of a
 * section (Account Overview became Product Overview, for instance) cannot
 * silently widen or narrow what Sales can reach.
 */
export const SALES_ALLOWED_PATHS = new Set<string>([
  "/client/$clientId",
  "/client/$clientId/insights",
  "/client/$clientId/contract",
]);

function isGlobalSelector(item: ClientSelectorItem): item is typeof GLOBAL_VIEW_SELECTOR {
  return item.clientId === GLOBAL_CLIENT_ID;
}

export function SideNavigation({ isSideNavExpanded }: { isSideNavExpanded: boolean }) {
  const params = useParams({ strict: false }) as { clientId?: string };
  const navigate = useNavigate();
  const location = useLocation();
  const { user, authReady, isAdmin, setRole } = useAuth();
  const { isDemoLive, liveAllClients, isLoading: isDemoLoading, effectiveRole } = useDemoData();

  // Track impersonation reactively so the View As block hides during preview
  const [impersonating, setImpersonating] = useState<string | null>(getImpersonatedEmail);
  useEffect(() => {
    const sync = () => setImpersonating(getImpersonatedEmail());
    const id = setInterval(sync, 500);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const isManagement = effectiveRole === "management";
  const clientList = (isDemoLive ? liveAllClients : MOCK_CLIENTS)
    .slice()
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
  const selectorItems: ClientSelectorItem[] = isManagement
    ? [GLOBAL_VIEW_SELECTOR, ...clientList]
    : clientList;

  const routeClientId = params.clientId ?? clientList[0]?.clientId ?? GLOBAL_CLIENT_ID;
  const isGlobal = isGlobalClientId(routeClientId);

  const selectedSelectorItem: ClientSelectorItem | undefined = isGlobal
    ? GLOBAL_VIEW_SELECTOR
    : (clientList.find((c) => c.clientId === routeClientId) ?? clientList[0]);

  const isClientListReady = clientList.length > 0;

  const displayClient = isGlobal ? null : (selectedSelectorItem as Client);
  // Sales sees only Client Overview, Insights and Contract.
  const isSales = effectiveRole === "sales";
  const clientNav = isSales ? CLIENT_NAV.filter((n) => SALES_ALLOWED_PATHS.has(n.to)) : CLIENT_NAV;
  const navItems = isGlobal ? GLOBAL_NAV : clientNav;
  const navClientId = isGlobal ? GLOBAL_CLIENT_ID : (displayClient?.clientId ?? routeClientId);

  useEffect(() => {
    // Wait for auth and client list to be ready before redirecting
    if (!authReady) return;
    if (!isClientListReady) return;
    if (isGlobal && !isManagement) {
      const fallback = clientList[0]?.clientId;
      if (fallback) {
        navigate({ to: "/client/$clientId", params: { clientId: fallback } });
      }
    }
  }, [authReady, isGlobal, isManagement, navigate, clientList, isClientListReady]);

  return (
    <SideNav
      aria-label="Primary navigation"
      isFixedNav
      expanded={isSideNavExpanded}
      isChildOfHeader={true}
    >
      <div className="cp-sidenav-section">
        <h6>Client</h6>
        {isDemoLive && isDemoLoading && !isClientListReady ? (
          <InlineLoading description="Loading clients…" status="active" />
        ) : (
          <ClientSelectorCombo
            items={selectorItems}
            selectedItem={selectedSelectorItem}
            onSelect={(selectedItem) => {
              if (isGlobalSelector(selectedItem)) {
                navigate({
                  to: "/client/$clientId/global",
                  params: { clientId: GLOBAL_CLIENT_ID },
                });
              } else {
                navigate({
                  to: "/client/$clientId",
                  params: { clientId: (selectedItem as Client).clientId },
                });
              }
            }}
          />
        )}
      </div>

      {/* View As — admin only, hidden during impersonation */}
      {isAdmin && !impersonating && (
        <div className="cp-sidenav-section">
          <h6>View As</h6>
          <Select
            id="view-as"
            labelText=""
            value={user?.role ?? "management"}
            onChange={(e) => setRole(e.target.value as "management" | "sales" | "delivery")}
          >
            <SelectItem value="management" text="Management" />
            <SelectItem value="delivery" text="Delivery" />
            <SelectItem value="sales" text="Sales" />
          </Select>
        </div>
      )}

      <SideNavItems>
        {navItems.map((n) => {
          const path = n.to.replace("$clientId", navClientId);
          const isActive =
            n.end === true ? location.pathname === path : location.pathname.startsWith(path);
          return (
            <SideNavLink
              key={n.label}
              href="#"
              isActive={isActive}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                navigate({ to: path });
              }}
            >
              {n.label}
            </SideNavLink>
          );
        })}

        {/* Admin link — only visible to admins, not during impersonation */}
        {isAdmin && !impersonating && (
          <SideNavLink
            href="#"
            isActive={location.pathname === "/admin"}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              navigate({ to: "/admin" as any });
            }}
          >
            Admin
          </SideNavLink>
        )}
      </SideNavItems>
    </SideNav>
  );
}
