/**
 * Admin-only impersonation helper.
 * Lets an admin preview the app exactly as a given entitlement email would see it.
 * Stored in localStorage so it survives navigation but clears on logout.
 */
const KEY = "cp:impersonate";

export function getImpersonatedEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY) || null;
}

export function setImpersonatedEmail(email: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, email.toLowerCase().trim());
}

export function clearImpersonation(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
