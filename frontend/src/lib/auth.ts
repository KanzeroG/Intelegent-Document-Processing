// Persisted demo session (localStorage). Lives outside store.tsx so both the
// API client and the store can read it without an import cycle. The token is
// XSS-readable here, which is acceptable for a local demo.

import type { Role } from "../api";

// Each role's landing page: where they do their actual job.
export function roleHome(role: Role): string {
  if (role === "admin") return "/dashboard";
  if (role === "staff") return "/review";
  return "/upload";
}

export interface StoredAuth {
  token: string;
  email: string;
  name: string;
  role: Role;
}

const KEY = "docextract.auth";

export function loadAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    return parsed && parsed.token && parsed.role ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAuth(auth: StoredAuth): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(auth));
  } catch {
    /* storage unavailable (private mode) — session just won't persist */
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// Fired by the API client when the backend rejects the session (401) so the
// store can sign the user out and bounce to /login.
export const UNAUTHORIZED_EVENT = "docextract:unauthorized";

export function emitUnauthorized(): void {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}
