import { readSignedValue, signValue } from "@/lib/signed-cookie";

/**
 * The centre lead's session, as a signed cookie value rather than a session row.
 *
 * A lead has no auth user — they identify by an email an admin registered — so
 * none of Supabase's session machinery applies. The signature is what stops the
 * cookie being edited into another lead's id; everything else about the request
 * is re-derived and re-checked server-side on each use.
 */

export const CENTRE_LEAD_COOKIE = "asc_centre_lead";

/** Long enough to cover 6:30am setup through the last script being collected. */
export const CENTRE_LEAD_SESSION_HOURS = 16;

/** The secret behind this is FELLOWS_SHEET_SECRET, which is also a bearer token
 *  sent to the Fellows sheet webhook — signValue derives the key from it. */
const PURPOSE = "centre-lead-session-v1";

export function signSession(leadId: string, expiresAtMs: number, secret: string): string {
  if (!secret) throw new Error("FELLOWS_SHEET_SECRET is not set");
  return signValue(leadId, expiresAtMs, secret, PURPOSE);
}

export function readSession(
  value: string | undefined | null,
  secret: string,
  now: number = Date.now(),
): string | null {
  return readSignedValue(value, secret, PURPOSE, now);
}

export function sessionExpiry(now: number = Date.now()): number {
  return now + CENTRE_LEAD_SESSION_HOURS * 60 * 60 * 1000;
}
