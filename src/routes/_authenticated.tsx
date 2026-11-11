import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { SideNavigation } from "@/components/layout/SideNavigation";
import { InlineLoading } from "@carbon/react";
import { useAuth } from "@/contexts/AuthContext";
import { getImpersonatedEmail, clearImpersonation } from "@/lib/impersonation";
import { InlineNotification } from "@carbon/react";
import { apiFetch } from "@/lib/apiFetch";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

function AuthLayout() {
  const { isAuthenticated, authReady } = useAuth();
  const navigate = useNavigate();
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
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

  useEffect(() => {
    if (authReady && !isAuthenticated) navigate({ to: "/login" });
  }, [authReady, isAuthenticated, navigate]);

  // ── Per-client access guard ────────────────────────────────────────────────
  //
  // Blocks a customer opened directly by URL when the user's geography, market
  // or assigned-clients grant does not cover it. The API already refuses the
  // data with a 403; this stops the page shell rendering around an empty
  // result, which would look like a broken page rather than a refusal.
  //
  // The server is asked rather than the answer being recomputed here — the
  // access rule lives in one place and the UI does not get a second opinion.
  const { clientId } = useParams({ strict: false }) as { clientId?: string };
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!authReady || !isAuthenticated || !clientId) {
      setAccessDenied(false);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/demo/clients/${encodeURIComponent(clientId)}`)
      .then((r) => {
        if (!cancelled) setAccessDenied(r.status === 403);
      })
      .catch(() => {
        // A network failure is not a refusal — leave the page alone.
        if (!cancelled) setAccessDenied(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthenticated, clientId, impersonating]);

  if (!authReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <InlineLoading description="Loading session…" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const stopImpersonation = () => {
    clearImpersonation();
    setImpersonating(null);
    navigate({ to: "/admin" as any });
  };

  return (
    <>
      {/* Impersonation banner — fixed below the main header */}
      {impersonating && (
        <div
          style={{
            position: "fixed",
            top: "3rem",
            left: 0,
            right: 0,
            zIndex: 7999,
            background: "#da1e28",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "0.4rem 1rem",
            fontSize: "0.8125rem",
            fontWeight: 500,
          }}
        >
          <span>
            ⚠ Previewing as <strong>{impersonating}</strong> — client access is scoped to their
            entitlements
          </span>
          <button
            onClick={stopImpersonation}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "1px solid rgba(255,255,255,0.5)",
              color: "#ffffff",
              cursor: "pointer",
              padding: "0.15rem 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              borderRadius: 2,
            }}
          >
            Stop Preview
          </button>
        </div>
      )}
      <AppHeader
        isSideNavExpanded={isSideNavExpanded}
        onClickSideNavExpand={() => setIsSideNavExpanded(!isSideNavExpanded)}
      />
      <SideNavigation isSideNavExpanded={isSideNavExpanded} />

      {/* Page content — shifts right while the nav is open, so the nav stays
          usable alongside the page instead of covering it. No backdrop: the
          content is still readable and interactive with the nav open. */}
      <div
        className={`cp-app-shell${isSideNavExpanded ? " cp-app-shell--nav-open" : ""}`}
        style={{
          paddingTop: impersonating ? "2rem" : undefined,
        }}
      >
        <div className="cp-content">
          {accessDenied ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="You do not have access to this customer"
              subtitle="This customer is outside the geography, market or client assignment granted to your account. Contact an administrator if you believe this is wrong."
            />
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </>
  );
}
