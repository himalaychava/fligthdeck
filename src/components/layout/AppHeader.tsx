import { Logout, Home, Menu, Settings, Help, LogoSlack, Email, Download, Idea } from "@carbon/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { APP_USER_GUIDE_URL } from "@/constants/appUserGuide";

const SLACK_SUPPORT_URL = "https://ibm.enterprise.slack.com/archives/C0C5266F39S";
const SUPPORT_EMAIL = "FlightDeck-dg@ibm.com";
const FEEDBACK_FORM_URL = "https://wkf.ms/4nZ3Mcx";

/**
 * Support icon with a small menu — Slack, email, feedback and the user guide
 * are different actions, so unlike the other header icons (one click, one
 * destination) this one needs its own dropdown rather than fitting the
 * generic icon-list pattern below.
 */
function SupportMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        aria-label="Support"
        aria-expanded={open}
        title="Support — Slack, email, feedback and user guide"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "3rem", height: "3rem", flexShrink: 0,
          background: open ? "#393939" : "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#ffffff",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "#393939"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "none"; }}
      >
        <Help size={20} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "3rem",
            right: 0,
            width: "17rem",
            background: "#262626",
            border: "1px solid #393939",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            zIndex: 8100,
            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
          }}
        >
          <a
            role="menuitem"
            href={SLACK_SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={`Slack Support — ${SLACK_SUPPORT_URL}`}
            onClick={() => setOpen(false)}
            style={{
              display: "flex", alignItems: "flex-start", gap: "0.65rem",
              padding: "0.7rem 0.85rem", color: "#ffffff", textDecoration: "none",
              borderBottom: "1px solid #393939",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#393939")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <LogoSlack size={18} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Slack Support</span>
              <span style={{ fontSize: "0.7rem", color: "#c6c6c6" }}>#flightdeck-support channel</span>
            </span>
          </a>

          <a
            role="menuitem"
            href={`mailto:${SUPPORT_EMAIL}`}
            title={`Email the support distribution list — ${SUPPORT_EMAIL}`}
            onClick={() => setOpen(false)}
            style={{
              display: "flex", alignItems: "flex-start", gap: "0.65rem",
              padding: "0.7rem 0.85rem", color: "#ffffff", textDecoration: "none",
              borderBottom: "1px solid #393939",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#393939")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Email size={18} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Email support</span>
              <span style={{ fontSize: "0.7rem", color: "#c6c6c6" }}>{SUPPORT_EMAIL}</span>
            </span>
          </a>

          <a
            role="menuitem"
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={`Feedback & feature request — ${FEEDBACK_FORM_URL}`}
            onClick={() => setOpen(false)}
            style={{
              display: "flex", alignItems: "flex-start", gap: "0.65rem",
              padding: "0.7rem 0.85rem", color: "#ffffff", textDecoration: "none",
              borderBottom: "1px solid #393939",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#393939")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Idea size={18} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Feedback &amp; feature request</span>
              <span style={{ fontSize: "0.7rem", color: "#c6c6c6" }}>Share feedback or suggest a feature</span>
            </span>
          </a>

          <a
            role="menuitem"
            href={APP_USER_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={`Download the user guide — ${APP_USER_GUIDE_URL}`}
            onClick={() => setOpen(false)}
            style={{
              display: "flex", alignItems: "flex-start", gap: "0.65rem",
              padding: "0.7rem 0.85rem", color: "#ffffff", textDecoration: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#393939")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Download size={18} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Download the user guide</span>
              <span style={{ fontSize: "0.7rem", color: "#c6c6c6" }}>FlightDeck user guide (PDF)</span>
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

export function AppHeader({
  isSideNavExpanded,
  onClickSideNavExpand,
}: {
  isSideNavExpanded: boolean;
  onClickSideNavExpand: () => void;
}) {
  const { logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <header style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      height: "3rem",
      background: "#161616",
      borderBottom: "none",
      display: "flex",
      alignItems: "center",
      zIndex: 8000,
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
    }}>

      {/* ── Hamburger ── */}
      <button
        onClick={onClickSideNavExpand}
        aria-label="Open menu"
        style={{
          width: "3rem", height: "3rem", flexShrink: 0,
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#ffffff",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "#393939")}
        onMouseLeave={e => (e.currentTarget.style.background = "none")}
      >
        <Menu size={20} />
      </button>

      {/* ── Brand: "IBM Expert Labs  Subscription FlightDeck" ── */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", paddingRight: "1rem" }}
        onClick={() => navigate({ to: "/home" as any })}
      >
        <span style={{ fontSize: "0.925rem", fontWeight: 400, color: "#ffffff", whiteSpace: "nowrap" }}>
          IBM Expert Labs
        </span>
        <span style={{ color: "#525252", fontSize: "0.8rem", userSelect: "none" }}>|</span>
        <span style={{ fontSize: "0.925rem", fontWeight: 700, color: "#ffffff", whiteSpace: "nowrap" }}>
          Subscription FlightDeck
        </span>
      </div>

      {/* ── Spacer ── */}
      <div style={{ flex: 1 }} />

      {/* ── Admin link (only for admins) ── */}
      {isAdmin && (
        <button
          onClick={() => navigate({ to: "/admin" as any })}
          title="Admin Panel"
          aria-label="Admin Panel"
          style={{
            display: "flex", alignItems: "center", gap: "0.35rem",
            background: "none", border: "none", cursor: "pointer",
            color: "#ffffff", fontSize: "0.8rem", fontWeight: 600,
            padding: "0 0.75rem", height: "3rem", letterSpacing: "0.04em",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#393939")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <Settings size={16} />
          <span>Admin</span>
        </button>
      )}

      {/* ── Icon actions ── */}
      {[
        { icon: Home, label: "Home", action: () => navigate({ to: "/home" as any }) },
      ].map(({ icon: Icon, label, action }) => (
        <button
          key={label}
          aria-label={label}
          title={label}
          onClick={action}
          style={{
            width: "3rem", height: "3rem", flexShrink: 0,
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#ffffff",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#393939")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <Icon size={20} />
        </button>
      ))}

      {/* ── Support (Slack + email) — sits between Home and sign out ── */}
      <SupportMenu />

      {[
        { icon: Logout, label: "Sign out", action: () => { logout(); navigate({ to: "/login" }); } },
      ].map(({ icon: Icon, label, action }) => (
        <button
          key={label}
          aria-label={label}
          title={label}
          onClick={action}
          style={{
            width: "3rem", height: "3rem", flexShrink: 0,
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#ffffff",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#393939")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <Icon size={20} />
        </button>
      ))}

    </header>
  );
}
