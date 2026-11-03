"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/supabase/server";
import { getSessionUser } from "@/supabase/auth";
import { educatorKey } from "@/lib/camp";
import { loadEducatorsOnRecord } from "@/lib/camp-data";
import { cleanText } from "@/lib/finale";
import { ATTEND_BASE, SCHOOL_FINALE_PATH, schoolInviteState, validateSchoolResponse } from "@/lib/finale-attend";
import { loadAttendance, respondForSchool, sendTicket } from "@/lib/finale-attend-data";
import { FINALE_YEAR, finaleDb } from "@/lib/finale-data";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";

const OUR_SIDE: ActionResult = { ok: false, error: "Something went wrong on our side. Please try again." };

export async function respondToFinale(registrationId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  const email = user?.email;
  if (!user || !email) return { ok: false, error: "Sign in again to respond." };
  const supabase = await createClient();

  // Read under RLS: a row comes back only if this educator is a member of the school.
  const { data: reg, error: regError } = await supabase
    .from("registrations")
    .select("id, school_id, edition_year, schools(name, lga)")
    .eq("id", registrationId)
    .maybeSingle();
  if (regError) return { ok: false, error: `Could not load your school: ${regError.message}` };
  if (!reg?.school_id || reg.edition_year !== FINALE_YEAR) return { ok: false, error: "This invitation is for schools registered this edition." };
  const school = reg.schools as unknown as { name: string; lga: string | null } | null;

  const db = finaleDb();
  if (!db) return OUR_SIDE;
  const { settings, error: settingsError } = await loadAttendance(db, FINALE_YEAR);
  if (settingsError) {
    console.error("finale: school response settings", settingsError);
    return OUR_SIDE;
  }
  const state = schoolInviteState(settings);
  if (state !== "open") {
    return { ok: false, error: state === "past-deadline" ? "The reply-by date has passed. Reply to your ticket email to change your answer." : "The Grand Finale has ended." };
  }

  const [{ educators, error: educatorsError }, studentsRes, profileRes] = await Promise.all([
    loadEducatorsOnRecord(supabase, registrationId),
    // Service role: students' RLS admits approved members only; reg.school_id came from the RLS read above.
    db
      .from("students")
      .select("id, name, level")
      .eq("school_id", reg.school_id)
      .eq("edition_year", reg.edition_year)
      .is("deactivated_at", null),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const loadError = educatorsError ?? studentsRes.error?.message ?? profileRes.error?.message;
  if (loadError) return { ok: false, error: `Could not load your school's people: ${loadError}` };

  const keyed = educators.map((e) => ({ key: educatorKey(e), name: e.name, phone: e.phone, email: e.email }));
  const phones: Record<string, unknown> = {};
  for (const e of keyed) phones[e.key] = formData.get(`phone:${e.key}`);
  const checked = validateSchoolResponse(
    {
      attending: formData.get("attending"),
      goingKeys: formData.getAll("going"),
      phones,
      otherNames: formData.getAll("other_name"),
      otherPhones: formData.getAll("other_phone"),
      studentIds: formData.getAll("student_id"),
      extraNames: formData.getAll("extra_name"),
      extraClasses: formData.getAll("extra_class"),
      studentCount: formData.get("student_count"),
    },
    { educators: keyed, students: (studentsRes.data ?? []) as { id: string; name: string; level: string | null }[] },
  );
  if (!checked.ok) return checked;
  const v = checked.value;

  // The ticket goes to whoever answered; their name falls back to the first educator going.
  const fullName = cleanText(profileRes.data?.full_name) || (v.attending ? v.educators[0].name : "") || email.split("@")[0];
  const [first, ...rest] = fullName.split(" ");
  const { responded, full, error } = await respondForSchool(db, FINALE_YEAR, {
    schoolId: reg.school_id,
    registrationId,
    organisation: school?.name ?? "Your school",
    lga: school?.lga ?? null,
    lead: {
      firstName: first.slice(0, 60),
      lastName: (rest.join(" ") || "-").slice(0, 60),
      email,
      phone: v.attending ? (v.educators.find((e) => e.email?.toLowerCase() === email.toLowerCase())?.phone ?? v.educators[0].phone) : null,
    },
    educators: v.attending ? v.educators : [],
    studentCount: v.attending ? v.studentCount : 0,
    students: v.attending ? v.students : [],
    attending: v.attending,
  });
  if (full != null) {
    return { ok: false, error: `Only ${full} school seats are left, so your group can't grow that much. Lower the numbers, or keep your current group.` };
  }
  if (error) {
    console.error("finale: school response", error);
    return OUR_SIDE;
  }

  revalidatePath("/portal/school");
  revalidatePath(SCHOOL_FINALE_PATH);
  revalidatePath(ATTEND_BASE);
  if (!v.attending) return { ok: true, message: responded ? "Thanks for letting us know. Your school's seats have been released." : "Thanks for letting us know." };
  if (!responded) return OUR_SIDE;

  const emailed = await sendTicket(db, responded.id);
  return {
    ok: true,
    message:
      (responded.status === "confirmed"
        ? `Seats confirmed: ${responded.seats}. Your ticket is ${responded.refCode}.`
        : `The school seats are taken, so you're on the waitlist (${responded.refCode}). We'll email you if seats open.`) +
      (emailed ? ` We've emailed it to ${email}.` : " The email didn't send; your ticket is below."),
  };
}
