/**
 * IBM Verify SSO handler — Authorization Code + PKCE flow
 * Mirrors the HC tool's IBM_SSO_* env var naming exactly.
 *
 * Endpoints:
 *   GET /auth/login     → redirect to IBM Verify authorize URL
 *   GET /auth/callback  → exchange code, set session cookie, redirect to /home
 *   GET /auth/logout    → clear cookie, redirect to /login
 *   GET /auth/session   → return current user JSON (polled by AuthContext)
 */
import { readEntitlements } from "./userEntitlements";

// ─── Config — all read from env at runtime, no rebuild needed ────────────────
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

function getRoleForEmail(email: string): string {
  if (isAdminEmail(email)) return "management";
  const entitlements = readEntitlements();
  const record = entitlements.find(e => e.email === email.toLowerCase().trim());
  return record?.role ?? "delivery";
}

const CLIENT_ID       = process.env.IBM_SSO_CLIENT_ID       || "";
const CLIENT_SECRET   = process.env.IBM_SSO_CLIENT_SECRET   || "";
const AUTHORIZATION_URL = process.env.IBM_SSO_AUTHORIZATION_URL
  || "https://healthscope.verify.ibm.com/v1.0/endpoint/default/authorize";
const TOKEN_URL       = process.env.IBM_SSO_TOKEN_URL
  || "https://healthscope.verify.ibm.com/v1.0/endpoint/default/token";
const USERINFO_URL    = process.env.IBM_SSO_USERINFO_URL
  || "https://healthscope.verify.ibm.com/v1.0/endpoint/default/userinfo";
const REDIRECT_URI    = process.env.IBM_SSO_REDIRECT_URI    || "http://localhost:8080/auth/callback";
const SESSION_SECRET  = process.env.SESSION_SECRET          || "dev-secret-change-me";
const COOKIE_NAME     = "cp_session";
const COOKIE_MAX_AGE  = 60 * 60 * 8; // 8 hours

// ─── PKCE helpers (Web Crypto — no external deps) ────────────────────────────
function b64url(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64url");
}

async function pkceVerifier(): Promise<string> {
  return b64url(crypto.getRandomValues(new Uint8Array(48)).buffer as ArrayBuffer);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(digest);
}

// ─── HMAC-signed session cookie (no jwt dep) ─────────────────────────────────
async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}

async function encodeSession(payload: object): Promise<string> {
  const data = JSON.stringify(payload);
  const sig = await hmacSign(SESSION_SECRET, data);
  return Buffer.from(data).toString("base64url") + "." + sig;
}

async function decodeSession(token: string): Promise<object | null> {
  try {
    const [datab64, sig] = token.split(".");
    if (!datab64 || !sig) return null;
    const data = Buffer.from(datab64, "base64url").toString("utf-8");
    if (await hmacSign(SESSION_SECRET, data) !== sig) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// ─── In-memory PKCE state store (expires in 10 min) ──────────────────────────
const pkceStore = new Map<string, { verifier: string; expiry: number }>();

function purgeExpired() {
  const now = Date.now();
  for (const [k, v] of pkceStore) if (v.expiry < now) pkceStore.delete(k);
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleOidcRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  // ── GET /auth/login ──────────────────────────────────────────────────────────
  if (pathname === "/auth/login") {
    if (!CLIENT_ID) {
      return new Response(
        "SSO not configured. Set IBM_SSO_CLIENT_ID in .env on the server.",
        { status: 503, headers: { "content-type": "text/plain" } },
      );
    }

    const verifier  = await pkceVerifier();
    const challenge = await pkceChallenge(verifier);
    const state     = b64url(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer);

    purgeExpired();
    pkceStore.set(state, { verifier, expiry: Date.now() + 10 * 60 * 1000 });

    const params = new URLSearchParams({
      response_type:         "code",
      client_id:             CLIENT_ID,
      redirect_uri:          REDIRECT_URI,
      scope:                 "openid profile email",
      state,
      code_challenge:        challenge,
      code_challenge_method: "S256",
    });

    return Response.redirect(`${AUTHORIZATION_URL}?${params}`, 302);
  }

  // ── GET /auth/callback ───────────────────────────────────────────────────────
  if (pathname === "/auth/callback") {
    const code  = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const err   = url.searchParams.get("error");

    if (err) {
      console.error("[sso] callback error:", err, url.searchParams.get("error_description"));
      return Response.redirect("/login?error=sso_error", 302);
    }
    if (!code || !state) {
      return Response.redirect("/login?error=missing_params", 302);
    }

    const stored = pkceStore.get(state);
    if (!stored || stored.expiry < Date.now()) {
      pkceStore.delete(state);
      return Response.redirect("/login?error=state_expired", 302);
    }
    pkceStore.delete(state);

    // Exchange code → tokens
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code_verifier: stored.verifier,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[sso] token exchange failed:", await tokenRes.text());
      return Response.redirect("/login?error=token_failed", 302);
    }

    const { access_token } = await tokenRes.json() as { access_token: string };

    // Fetch user profile
    const userRes  = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userRes.json() as {
      sub: string; name?: string; given_name?: string;
      email?: string; preferred_username?: string;
    };

    const email = userInfo.email || userInfo.preferred_username || userInfo.sub;
    const name  = userInfo.name  || userInfo.given_name         || email.split("@")[0];

    const role = getRoleForEmail(email);
    const cookie = await encodeSession({
      email, name,
      role,
      team: "Expert Labs — Delivery",
      isAdmin: isAdminEmail(email),
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/home",
        "Set-Cookie": `${COOKIE_NAME}=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`,
      },
    });
  }

  // ── GET /auth/logout ─────────────────────────────────────────────────────────
  if (pathname === "/auth/logout") {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/login",
        "Set-Cookie": `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
      },
    });
  }

  // ── GET /auth/session ────────────────────────────────────────────────────────
  if (pathname === "/auth/session") {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    if (!match) {
      return new Response(JSON.stringify({ user: null }), {
        headers: { "content-type": "application/json" },
      });
    }
    const payload = await decodeSession(decodeURIComponent(match[1])) as Record<string, unknown> | null;
    if (!payload) {
      return new Response(JSON.stringify({ user: null }), {
        headers: { "content-type": "application/json" },
      });
    }
    // Always re-derive role & isAdmin from live entitlements — so changes made in
    // the admin panel take effect without the user needing to log out and back in.
    const sessionEmail = (payload.email as string ?? "").toLowerCase().trim();
    const liveRole = getRoleForEmail(sessionEmail);
    const liveIsAdmin = isAdminEmail(sessionEmail);
    const enriched = { ...payload, role: liveRole, isAdmin: liveIsAdmin };
    return new Response(JSON.stringify({ user: enriched }), {
      headers: { "content-type": "application/json" },
    });
  }

  return null;
}
