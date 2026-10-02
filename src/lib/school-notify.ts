import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAcceptedEmail, buildDeclinedEmail, sendEmailSafely } from "@/lib/email";

// Any client: a school-initiated fan-out passes the service role, since only
// admins may insert notifications under RLS.
type ServerClient = SupabaseClient;

export interface SchoolPerson {
  email: string | null;
  name: string | null;
  profileId: string | null;
}

// The single source of "who to tell" about a school: its approved members
// (teacher, principal, any other educator) plus the registration owner. Deduped
// by email and by profile, so email and in-portal notifications always reach the
// SAME people — a principal who's a member but not the owner can no longer get
// the email yet miss the portal alert (or vice versa).
export async function getSchoolAudience(
  supabase: ServerClient,
  schoolId: string | null,
  ownerId?: string | null,
): Promise<SchoolPerson[]> {
  const people: SchoolPerson[] = [];
  const seenEmail = new Set<string>();
  const seenProfile = new Set<string>();

  if (schoolId) {
    const { data } = await supabase
      .from("school_members")
      .select("email, full_name, profile_id")
      .eq("school_id", schoolId)
      .eq("status", "approved");
    for (const m of (data ?? []) as {
      email: string | null;
      full_name: string | null;
      profile_id: string | null;
    }[]) {
      const emailKey = (m.email ?? "").toLowerCase();
      if (emailKey && seenEmail.has(emailKey)) continue;
      if (emailKey) seenEmail.add(emailKey);
      if (m.profile_id) seenProfile.add(m.profile_id);
      people.push({ email: m.email, name: m.full_name, profileId: m.profile_id });
    }
  }

  // The owner may have no member row (or theirs may predate account linking) —
  // make sure they still receive the in-portal notification.
  if (ownerId && !seenProfile.has(ownerId)) {
    people.push({ email: null, name: null, profileId: ownerId });
  }
  return people;
}

// One in-portal notification per person in the audience who has an account.
async function insertNotifications(
  supabase: ServerClient,
  audience: SchoolPerson[],
  notification: { title: string; body: string; link: string },
) {
  const rows = audience
    .filter((p) => p.profileId)
    .map((p) => ({ profile_id: p.profileId as string, ...notification }));
  if (rows.length) await supabase.from("notifications").insert(rows);
}

// Acceptance / not-selected decision: email everyone with an address AND drop an
// in-portal notification for everyone with an account — one audience, both
// channels. Falls back to the registration contact when the school has no
// member rows yet.
export async function notifySchoolDecision(
  supabase: ServerClient,
  opts: {
    schoolId: string | null;
    schoolName: string;
    editionYear: number;
    decision: "approve" | "decline";
    ownerId?: string | null;
    fallbackEmail?: string | null;
    fallbackName?: string | null;
    declineReason?: string | null;
  },
) {
  let audience = await getSchoolAudience(supabase, opts.schoolId, opts.ownerId);
  if (audience.length === 0 && opts.fallbackEmail) {
    audience = [
      { email: opts.fallbackEmail, name: opts.fallbackName ?? null, profileId: opts.ownerId ?? null },
    ];
  }

  const isApprove = opts.decision === "approve";
  for (const p of audience) {
    if (!p.email) continue;
    await sendEmailSafely(
      isApprove
        ? buildAcceptedEmail({
            email: p.email,
            name: p.name,
            schoolFullName: opts.schoolName,
            editionYear: opts.editionYear,
          })
        : buildDeclinedEmail({
            email: p.email,
            name: p.name,
            schoolFullName: opts.schoolName,
            editionYear: opts.editionYear,
            declineReason: opts.declineReason,
          }),
    );
  }

  const reason = (opts.declineReason ?? "").trim();
  await insertNotifications(supabase, audience, {
    title: isApprove ? "Entry confirmed" : "Entry update",
    body: isApprove
      ? `${opts.schoolName} is confirmed for the ${opts.editionYear} competition — log in to your portal for the guidelines.`
      : reason
        ? `${opts.schoolName} wasn't selected for the ${opts.editionYear} competition. Reason: ${reason}. You can update your entry and resubmit for review.`
        : `${opts.schoolName} wasn't selected for the ${opts.editionYear} competition. Portal access stays open.`,
    link: "/portal/school",
  });
}

// In-portal-only fan-out to a school's whole audience (e.g. stage results).
export async function notifySchool(
  supabase: ServerClient,
  schoolId: string | null,
  ownerId: string | null | undefined,
  notification: { title: string; body: string; link: string },
) {
  const audience = await getSchoolAudience(supabase, schoolId, ownerId);
  await insertNotifications(supabase, audience, notification);
}
