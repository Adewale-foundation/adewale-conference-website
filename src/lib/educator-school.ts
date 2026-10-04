// An educator belongs to one school (enforced by the school_members_one_school
// trigger). These helpers give the friendly message before a write hits it.

export type Membership = { email: string; school_id: string; school_name: string | null };

/** The first other school one of `emails` already belongs to, or null. Case-insensitive. */
export function otherSchoolFor(
  memberships: Membership[],
  emails: (string | null | undefined)[],
  schoolId: string | null,
): { email: string; schoolName: string } | null {
  const wanted = new Set(emails.filter(Boolean).map((e) => e!.trim().toLowerCase()));
  const hit = memberships.find((m) => wanted.has(m.email.toLowerCase()) && m.school_id !== schoolId);
  return hit ? { email: hit.email.toLowerCase(), schoolName: hit.school_name ?? "another school" } : null;
}

/** Emails approved at more than one school, with those schools — the conflicts an admin must resolve. */
export function educatorConflicts(memberships: Membership[]): { email: string; schools: { id: string; name: string }[] }[] {
  const byEmail = new Map<string, Map<string, string>>();
  for (const m of memberships) {
    const email = m.email.toLowerCase();
    const schools = byEmail.get(email) ?? new Map<string, string>();
    schools.set(m.school_id, m.school_name ?? "Unnamed school");
    byEmail.set(email, schools);
  }
  return [...byEmail]
    .filter(([, schools]) => schools.size > 1)
    .map(([email, schools]) => ({
      email,
      schools: [...schools].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
