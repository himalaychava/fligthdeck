/**
 * API fetch with the caller's identity attached.
 *
 * Every request to /api/demo/* and /api/admin/* must go through this rather
 * than calling fetch() directly.
 *
 * ── Why ──
 * The server enforces geo/market and assigned-client access on per-client
 * endpoints. It identifies the caller from the signed SSO session cookie when
 * SSO is on, and from the X-CP-Email header when it is off (static-login mode,
 * where there is no cookie at all).
 *
 * A bare fetch() therefore reaches the server anonymously whenever SSO is
 * disabled, and the access check correctly refuses it — a 403 on a page that
 * should work. Routing every call through one helper means a new endpoint is
 * authenticated by default instead of depending on whoever adds it remembering
 * the header.
 *
 * With SSO enabled the cookie is authoritative and the server ignores these
 * headers, so sending them is harmless in both modes.
 */

const AUTH_KEY = "cp:auth";
const IMPERSONATE_KEY = "cp:impersonate";

interface StoredUser {
  email?: string;
  name?: string;
}

function readStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

function readImpersonated(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(IMPERSONATE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Identity headers for the current user.
 *
 * An admin previewing as somebody else is deliberately sent as that person, so
 * the server scopes the response to the impersonated user's entitlement rather
 * than the admin's. That makes the preview honest — it shows what they would
 * actually see, not a filtered copy of what the admin can see.
 */
export function identityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const impersonated = readImpersonated();
  if (impersonated) {
    headers["x-cp-email"] = impersonated;
    return headers;
  }
  const user = readStoredUser();
  if (user?.email) headers["x-cp-email"] = user.email;
  if (user?.name) headers["x-cp-name"] = user.name;
  return headers;
}

/** fetch(), with identity attached. Same signature otherwise. */
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: { ...identityHeaders(), ...(init.headers ?? {}) },
  });
}
