import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * `id.expiresAtMs.signature` cookie values for people with no Supabase session
 * (centre leads, finale supporters). The signing key is derived from the secret
 * per purpose, so a value minted for one flow never verifies in another and the
 * secret itself is never the key.
 */

function sign(payload: string, secret: string, purpose: string) {
  const key = createHmac("sha256", secret).update(purpose).digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function signValue(id: string, expiresAtMs: number, secret: string, purpose: string): string {
  if (!secret) throw new Error("No signing secret is set");
  if (!id || id.includes(".")) throw new Error("A signed id cannot be empty or contain a dot");
  const payload = `${id}.${expiresAtMs}`;
  return `${payload}.${sign(payload, secret, purpose)}`;
}

/**
 * The id a value carries, or null for anything that is not live and correctly
 * signed for this purpose. Never throws and never says which check failed.
 */
export function readSignedValue(
  value: string | undefined | null,
  secret: string,
  purpose: string,
  now: number = Date.now(),
): string | null {
  if (!value || !secret) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [id, expiresAt, signature] = parts;

  const a = Buffer.from(signature);
  const b = Buffer.from(sign(`${id}.${expiresAt}`, secret, purpose));
  // timingSafeEqual throws on a length mismatch, which is itself an answer.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) return null;
  return id || null;
}
