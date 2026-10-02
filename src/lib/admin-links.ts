// Links from any admin list to a school's registration, and the way back.
export const REGISTRATION_BASE = "/portal/admin/registrations";

const ADMIN_PREFIX = "/portal/admin/";

// Longest prefix wins, so /participants/camp is "Camp", not "Participants".
const BACK_LABELS: [prefix: string, label: string][] = [
  ["/portal/admin/participants/camp", "Camp"],
  ["/portal/admin/participants", "Participants"],
  ["/portal/admin/info-changes", "Info changes"],
  ["/portal/admin/replacements", "Replacements"],
  ["/portal/admin/paper-exams", "Paper exams"],
  ["/portal/admin/attendance", "Attendance"],
  ["/portal/admin/schools/duplicates", "Duplicate schools"],
  ["/portal/admin/schools", "Schools"],
  ["/portal/admin/waitlist", "Waitlist"],
  ["/portal/admin/registrations", "Registrations"],
];

export function registrationHref(id: string, from?: string | null): string {
  const href = `${REGISTRATION_BASE}/${encodeURIComponent(id)}`;
  return from ? `${href}?from=${encodeURIComponent(from)}` : href;
}

/**
 * Where a registration page's back link goes. `from` arrives in the URL, so
 * anything that isn't an admin path (an external or protocol-relative URL)
 * falls back to the registrations list rather than becoming an open redirect.
 */
export function safeBack(from: string | null | undefined): { href: string; label: string } {
  const fallback = { href: REGISTRATION_BASE, label: "Registrations" };
  const v = (from ?? "").trim();
  if (!v.startsWith(ADMIN_PREFIX) || v.includes("//") || v.includes("\\")) return fallback;
  const path = v.split(/[?#]/)[0];
  // Another registration's page would chain back links; send those to the list.
  if (path.startsWith(`${REGISTRATION_BASE}/`)) return fallback;
  const label = BACK_LABELS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
  return label ? { href: v, label } : { href: v, label: "Back" };
}

/** A school's registration for `year`, else its newest. Students are retagged per edition, so the year matters. */
export function registrationForEdition<T extends { id: string; edition_year: number | null }>(
  registrations: T[] | null | undefined,
  year?: number | null,
): T | null {
  const regs = registrations ?? [];
  if (year != null) return regs.find((r) => r.edition_year === year) ?? null;
  return regs.reduce<T | null>(
    (best, r) => (!best || (r.edition_year ?? -Infinity) > (best.edition_year ?? -Infinity) ? r : best),
    null,
  );
}
