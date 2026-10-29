import "server-only";
import { cookies } from "next/headers";
import { FINALE_COOKIE, FINALE_COOKIE_DAYS, FINALE_COOKIE_PURPOSE } from "@/lib/finale";
import { readSignedValue, signValue } from "@/lib/signed-cookie";

/** Its own secret, so rotating it signs every supporter out of their badge and nothing else. */
export function finaleSecret(): string {
  return process.env.FINALE_COOKIE_SECRET ?? "";
}

/** The supporter this browser joined as, or null. Only the signature makes the id trustworthy. */
export async function currentSupporterId(): Promise<string | null> {
  const store = await cookies();
  return readSignedValue(store.get(FINALE_COOKIE)?.value, finaleSecret(), FINALE_COOKIE_PURPOSE);
}

export async function rememberSupporter(id: string): Promise<void> {
  const expires = Date.now() + FINALE_COOKIE_DAYS * 24 * 60 * 60 * 1000;
  const store = await cookies();
  store.set(FINALE_COOKIE, signValue(id, expires, finaleSecret(), FINALE_COOKIE_PURPOSE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/finale",
    expires: new Date(expires),
  });
}
