/**
 * The password-reset email link. Supabase sends people back to /reset-password
 * with the result in the address after `#`: either a short-lived session
 * (`type=recovery`) or an error such as an expired link. The auth library
 * reads and then wipes that part of the address while the app starts, so it is
 * read here first: `src/integrations/supabase/client.ts` imports this module
 * before it creates the client.
 */

export interface ResetLink {
  /** The link carried a sign-in made for setting a new password. */
  recovery: boolean;
  /** Why the link did not work, when the auth server says so. */
  error: string | null;
}

export function parseResetLink(hash: string): ResetLink {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const code = params.get('error_code') || params.get('error');
  if (code) {
    return { recovery: false, error: code === 'otp_expired' ? 'expired' : params.get('error_description') || code };
  }
  return { recovery: params.get('type') === 'recovery' && !!params.get('access_token'), error: null };
}

const KEY = 'ez-password-reset';
const atLoad: ResetLink = typeof window === 'undefined' ? { recovery: false, error: null } : parseResetLink(window.location.hash);
let pending = atLoad.recovery;

// Kept for the tab, so reloading the "set a new password" screen does not lose it.
try {
  if (atLoad.recovery) sessionStorage.setItem(KEY, '1');
  else if (sessionStorage.getItem(KEY) === '1') pending = true;
} catch { /* storage blocked: the in-memory flag still covers this page load */ }

/** What the address said when the app started. */
export const resetLinkAtLoad: ResetLink = atLoad;

/** The person arrived from a reset link and has not set the new password yet. */
export function resetPending(): boolean {
  return pending;
}

export function clearResetPending(): void {
  pending = false;
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
