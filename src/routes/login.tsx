import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const OIDC_ENABLED = import.meta.env.VITE_OIDC_ENABLED === "true";

export const Route = createFileRoute("/login")({ component: LoginPage });

const BG = "#ffffff";
const CARD_BG = "#dde1f0";
const CARD_SHADOW = "0 4px 32px 0 rgba(31,43,107,0.13)";

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) { setError("Please enter your IBM email address"); return; }
    setIsLoading(true);
    setError(null);
    try {
      await login(email.trim(), "internal");
      navigate({ to: "/home" as any });
    } catch (err) {
      setError(err instanceof Error && err.message === "ACCESS_DENIED"
        ? "Access denied. Your email is not authorized."
        : "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: BG,
      display: "flex",
      flexDirection: "column",
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
    }}>

      {/* ── Top bar — same background, just the brand name ── */}
      <div style={{
        height: "3rem",
        flexShrink: 0,
        padding: "0 1.75rem",
        display: "flex",
        alignItems: "center",
        gap: "0.55rem",
        background: BG,
        borderBottom: "1px solid #e0e0e0",
      }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="9" stroke="#3d52d5" strokeWidth="1.5" fill="none"/>
          <rect x="5" y="7"  width="10" height="1.5" fill="#3d52d5"/>
          <rect x="5" y="10" width="10" height="1.5" fill="#3d52d5"/>
          <rect x="5" y="13" width="10" height="1.5" fill="#3d52d5"/>
        </svg>
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#1f2b6b" }}>
          IBM FlightDeck
        </span>
      </div>

      {/* ── Two-column body ── */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8rem",
        padding: "3rem 4rem",
      }}>

        {/* Left — product identity */}
        <div style={{ flex: "0 0 auto", maxWidth: 340, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          {/* IBM Bob logo — multiply blend makes white background invisible */}
          <img
            src="/ibm-bob-logo.gif"
            alt="IBM Bob"
            style={{
              width: 280,
              height: "auto",
              marginBottom: "1rem",
              mixBlendMode: "multiply",
            }}
          />
          <h1 style={{
            margin: "0 0 0.75rem 0",
            fontSize: "2.5rem",
            fontWeight: 600,
            color: "#2d3a8c",
            lineHeight: 1.2,
          }}>
            FlightDeck
          </h1>
          <p style={{
            margin: 0,
            fontSize: "1rem",
            color: "#5a6080",
            lineHeight: 1.5,
          }}>
            Enterprise Technology Assurance Platform
          </p>
        </div>

        {/* Right — login card */}
        <div style={{
          flex: "0 0 auto",
          width: 420,
          background: CARD_BG,
          borderRadius: 12,
          padding: "2.5rem 2.25rem 2rem",
          boxShadow: CARD_SHADOW,
        }}>
          {/* Platform label */}
          <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#3d52d5" }}>
            FlightDeck
          </p>

          {/* Heading */}
          <h2 style={{ margin: "0 0 0.4rem 0", fontSize: "1.8rem", fontWeight: 500, color: "#161616", lineHeight: 1.25 }}>
            Welcome back
          </h2>

          {/* Sub-heading */}
          <p style={{ margin: "0 0 2rem 0", fontSize: "0.875rem", color: "#6f6f6f", lineHeight: 1.55 }}>
            Sign in with your IBMid to access the IBM Subscription FlightDeck
          </p>

          {OIDC_ENABLED ? (
            /* ── SSO button only ── */
            <button
              onClick={() => { window.location.href = "/auth/login"; }}
              style={{
                width: "100%",
                padding: "0.9rem 1.25rem",
                background: "#3d52d5",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#2e41b8"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#3d52d5"; }}
            >
              <span>Continue with IBMid</span>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 9h12M10 4l5 5-5 5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            /* ── Static email fallback (local dev) ── */
            <>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "#393939", marginBottom: "0.4rem" }}>
                  IBM ID (email)
                </label>
                <input
                  type="email"
                  placeholder="your.name@ibm.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(null); }}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  style={{
                    width: "100%", padding: "0.7rem 0.875rem", fontSize: "0.9rem",
                    border: error ? "1.5px solid #da1e28" : "1.5px solid #c6c6c6",
                    borderRadius: 6, background: "#ffffff", color: "#161616",
                    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#3d52d5"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = error ? "#da1e28" : "#c6c6c6"; }}
                />
                {error && <p style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", color: "#da1e28" }}>{error}</p>}
              </div>
              <button
                onClick={handleLogin}
                disabled={isLoading}
                style={{
                  width: "100%", padding: "0.875rem 1.25rem",
                  background: isLoading ? "#8898e8" : "#3d52d5",
                  color: "#ffffff", border: "none", borderRadius: 8,
                  fontSize: "1rem", fontWeight: 500,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontFamily: "inherit", transition: "background 0.15s",
                }}
                onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = "#2e41b8"; }}
                onMouseLeave={e => { if (!isLoading) e.currentTarget.style.background = "#3d52d5"; }}
              >
                <span>{isLoading ? "Signing in…" : "Continue with IBMid"}</span>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 9h12M10 4l5 5-5 5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </>
          )}

          {/* Footer note */}
          <p style={{ margin: "1.5rem 0 0", fontSize: "0.73rem", color: "#a8a8a8", textAlign: "center", lineHeight: 1.5 }}>
            Secure single sign-on via IBM w3id · IBM Confidential
          </p>
        </div>

      </div>

      {/* ── Page footer ── */}
      <div style={{
        flexShrink: 0,
        padding: "0.75rem 1.75rem",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
        borderTop: "1px solid #c8cde4",
      }}>
        <span style={{ fontSize: "0.7rem", color: "#7a80a0" }}>© {new Date().getFullYear()} IBM Corporation</span>
        <span style={{ fontSize: "0.7rem", color: "#3d52d5", cursor: "pointer" }}>Privacy</span>
        <span style={{ fontSize: "0.7rem", color: "#3d52d5", cursor: "pointer" }}>Terms of use</span>
      </div>

    </div>
  );
}
