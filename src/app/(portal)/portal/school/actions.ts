"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { getSessionUser } from "@/supabase/auth";
import { createAdminClient } from "@/supabase/admin";
import { provisionStudent, type ProvisionResult } from "@/lib/provision-student";
import { personNameProblem } from "@/lib/person-identity";
import { getSchoolAudience, notifySchool } from "@/lib/school-notify";
import { buildCampConfirmationEmail, sendEmailSafely } from "@/lib/email";
import { educatorKey, formatCampDate, validateCampResponse } from "@/lib/camp";
import { loadEducatorsOnRecord } from "@/lib/camp-data";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";
import type {
  CampSettings,
  InfoChangeResult,
  Rep,
  ReplacementResult,
} from "@/supabase/types";

// Provision a student for the coordinator's school: a Supabase auth user with a
// synthetic email + the access code as password (so they log in with just the
// code). Returns the access code on success (or the existing one), or an error.
async function createStudentRecord(
  name: string,
  level: string,
): Promise<ProvisionResult> {
  if (!name) return { error: "Enter the student's name." };

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated." };

  // The coordinator's school — from any registration they can access (owner OR
  // approved member). Works even when their membership is still pending.
  // The coordinator's school + the edition they most recently registered for, so
  // provisioned students carry that edition — edition-scoped plans/exams match on
  // students.edition_year (untagged students are silently skipped).
  const { data: regs } = await supabase
    .from("registrations")
    .select("school_id, edition_year")
    .order("edition_year", { ascending: false });
  const reg = (
    (regs ?? []) as { school_id: string | null; edition_year: number | null }[]
  ).find((r) => r.school_id);
  const schoolId = reg?.school_id;
  if (!schoolId)
    return { error: "Register or link your school first." };
  const editionYear = reg?.edition_year ?? (Number(process.env.ASC_EDITION_YEAR) || 2026);

  const admin = createAdminClient();
  if (!admin) return { error: "Student access isn't configured on the server." };

  const result = await provisionStudent(admin, {
    schoolId,
    editionYear,
    name,
    level: level || null,
  });
  if (result.code) revalidatePath("/portal/school", "layout");
  return result;
}

// Provision a rep → returns the code (or error) for inline display (useActionState).
export async function provisionRep(
  _prev: ProvisionResult | null,
  formData: FormData,
): Promise<ProvisionResult> {
  return createStudentRecord(
    String(formData.get("name") ?? "").trim(),
    String(formData.get("level") ?? "").trim(),
  );
}

// Representatives are locked in after submission — corrections and swaps both go
// through the replacement flow (requestReplacement) so an admin reviews the
// change and access codes stay in sync. There is deliberately no edit-in-place.

// File a request to replace a rep (student A leaves, B takes the slot). This is
// deliberately separate from updateReps (which is for typo corrections on the
// same person): a replacement swaps one human for another, so it needs admin
// approval to deactivate the outgoing student and provision the incoming one.
// Allowed any time — no registration-open gate. RLS (sr_insert) gates to members.
export async function requestReplacement(
  registrationId: string,
  _prev: ReplacementResult | null,
  formData: FormData,
): Promise<ReplacementResult> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated." };

  const oldName = String(formData.get("old_name") ?? "").trim();
  const oldLevel = String(formData.get("old_level") ?? "").trim();
  const newName = String(formData.get("new_name") ?? "").trim();
  const newLevel = String(formData.get("new_level") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!oldName) return { error: "Missing the student being replaced." };
  if (!newName) return { error: "Enter the replacement student's name." };
  if (!reason) return { error: "Enter the reason for the replacement." };

  // Incoming rep's extra attributes — kept so Airtable stays complete after the
  // swap. Neutral keys here; the admin approval maps them onto "Student Rep N …".
  const newDetails: Record<string, string> = {};
  for (const [field, key] of [
    ["dob", "dob"],
    ["gender", "gender"],
    ["guardian_name", "guardianName"],
    ["guardian_number", "guardianNumber"],
  ] as const) {
    const value = String(formData.get(field) ?? "").trim();
    if (value) newDetails[key] = value;
  }

  const { data: reg } = await supabase
    .from("registrations")
    .select("id, school_id, details, reps")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg?.school_id) return { error: "Registration not found." };

  // Resolve the Airtable "Student Rep N" slot so approval writes the swap back
  // to the right field. Prefer a details name-match; fall back to reps order.
  const details = (reg.details ?? {}) as Record<string, string>;
  let repSlot: number | null = null;
  for (let n = 1; n <= 3; n++) {
    if (
      (details[`Student Rep ${n} Full Name`] ?? "").trim().toLowerCase() ===
      oldName.toLowerCase()
    ) {
      repSlot = n;
      break;
    }
  }
  if (repSlot === null) {
    const reps = Array.isArray(reg.reps) ? (reg.reps as Rep[]) : [];
    const idx = reps.findIndex(
      (r) => r.name.trim().toLowerCase() === oldName.toLowerCase(),
    );
    if (idx >= 0) repSlot = idx + 1;
  }

  // The outgoing student's provisioned row, if any (active only).
  const { data: existing } = await supabase
    .from("students")
    .select("id")
    .eq("school_id", reg.school_id)
    .ilike("name", oldName)
    .is("deactivated_at", null)
    .limit(1);
  const oldStudentId = (existing?.[0]?.id as string | undefined) ?? null;

  // Don't stack duplicate pending requests for the same rep.
  const { data: dupe } = await supabase
    .from("student_replacements")
    .select("id")
    .eq("registration_id", registrationId)
    .eq("old_name", oldName)
    .eq("status", "pending")
    .limit(1);
  if (dupe && dupe.length) {
    return { error: "A replacement for this student is already awaiting review." };
  }

  const { error } = await supabase.from("student_replacements").insert({
    registration_id: registrationId,
    school_id: reg.school_id,
    rep_slot: repSlot,
    old_student_id: oldStudentId,
    old_name: oldName,
    old_level: oldLevel || null,
    new_name: newName,
    new_level: newLevel || null,
    new_details: newDetails,
    reason,
    requested_by: user.id,
    status: "pending",
  });
  if (error) return { error: `Could not submit: ${error.message}` };

  revalidatePath("/portal/school/students");
  revalidatePath("/portal/school");
  return { ok: true };
}

// File a request to correct the school's contact details (educator / principal
// name or phone). Like a rep replacement, an admin reviews it before it applies.
// Reason is required. Email changes are handled admin-side (auth side effects).
export async function requestInfoChange(
  registrationId: string,
  _prev: InfoChangeResult | null,
  formData: FormData,
): Promise<InfoChangeResult> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated." };

  const target = String(formData.get("target") ?? "");
  if (target !== "teacher" && target !== "principal") {
    return { error: "Choose whether this is the educator or the principal." };
  }
  const newName = String(formData.get("new_name") ?? "").trim();
  const newPhone = String(formData.get("new_phone") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!newName && !newPhone) return { error: "Enter a new name or phone number." };
  if (!reason) return { error: "Enter the reason for the change." };

  // This box is applied verbatim and ends up on the printed answer sheets, so a
  // request typed into it ("Change X to Y") is rejected rather than stored.
  const nameProblem = personNameProblem(newName);
  if (nameProblem) return { error: nameProblem };

  const { data: reg } = await supabase
    .from("registrations")
    .select("school_id")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg?.school_id) return { error: "Registration not found." };

  // Same guard as requestReplacement: without it the same correction gets filed
  // and approved several times over.
  const { data: dupe } = await supabase
    .from("info_change_requests")
    .select("id")
    .eq("registration_id", registrationId)
    .eq("target", target)
    .eq("status", "pending")
    .limit(1);
  if (dupe && dupe.length) {
    return { error: "A correction to these details is already awaiting review." };
  }

  // RLS (icr_insert) gates this to members of the school.
  const { error } = await supabase.from("info_change_requests").insert({
    registration_id: registrationId,
    school_id: reg.school_id,
    target,
    new_name: newName || null,
    new_phone: newPhone || null,
    reason,
    requested_by: user.id,
    status: "pending",
  });
  if (error) return { error: `Could not submit: ${error.message}` };

  revalidatePath("/portal/school");
  revalidatePath("/portal/school/registrations");
  return { ok: true };
}

// Resubmit a declined registration for another review — after the school has
// acted on the admin's decline reason (e.g. filed a rep replacement). The RPC
// (security definer) verifies the caller belongs to the school, only touches a
// declined row, flips it back to submitted, clears the reason, and notifies
// admins. Any approved member can resubmit, not just the owner.
export async function resubmitRegistration(registrationId: string) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return;
  await supabase.rpc("resubmit_registration", { p_registration_id: registrationId });
  revalidatePath("/portal/school");
  revalidatePath("/portal/school/registrations");
}

// Register the coordinator's school for an open edition — created owned by them,
// so there's nothing to claim. Returns an error string for the UI, or null on success.
export async function registerForEdition(
  year: number,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const school = String(formData.get("school") ?? "").trim();
  const lga = String(formData.get("lga") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const reps = [1, 2, 3]
    .map((i) => ({
      name: String(formData.get(`rep${i}`) ?? "").trim(),
      level: String(formData.get(`rep${i}_level`) ?? "").trim() || undefined,
    }))
    .filter((r) => r.name);

  if (!school) return "Enter your school name.";

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_school_for_edition", {
    p_year: year,
    p_school: school,
    p_lga: lga || null,
    p_category: category || null,
    p_reps: reps,
  });
  // ASC01/ASC02 mean the school is already registered for this edition. That is
  // actionable in a way "try again" is not, so pass the message and hint through.
  if (error) {
    if (error.code === "ASC01" || error.code === "ASC02") {
      return [error.message, error.hint].filter(Boolean).join(" ");
    }
    return "Could not register — registration may have closed. Try again.";
  }

  // Auto-provision each representative into a student login + access code, so the
  // coordinator sees the codes to hand out immediately — no separate step. Best-effort:
  // if the service key isn't configured this is skipped and reps can be provisioned
  // manually later from the Students page.
  for (const rep of reps) {
    await createStudentRecord(rep.name, rep.level ?? "");
  }

  revalidatePath("/portal/school");
  revalidatePath("/portal");
  return null;
}

// Redeem a claim code → become the registration's owner + coordinator.
// Returns an error string for the UI, or null on success.
export async function claimRegistration(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return "Enter your claim code.";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_registration", {
    p_code: code.trim().toUpperCase(),
  });
  if (error) return `Could not claim: ${error.message}`;
  if (!data) return "That code is invalid.";

  revalidatePath("/portal/school");
  revalidatePath("/portal");
  redirect("/portal/school");
}

// Confirm or decline the school's ASC Camp place. submit_camp_response()
// re-checks eligibility, the deadline and these same fields, so a stale tab
// can't slip past the lock.
export async function submitCampResponse(
  registrationId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  // Who is on record comes from the database; the form only says who is going
  // and their phone, so a tampered form can't invent a "teacher on record".
  const { educators: record, error: recordError } = await loadEducatorsOnRecord(supabase, registrationId);
  if (recordError) return { ok: false, error: `Could not load your educators: ${recordError}` };
  const going = new Set(formData.getAll("going").map(String));
  const extraNames = formData.getAll("extra_name").map(String);
  const extraPhones = formData.getAll("extra_phone").map(String);

  const parsed = validateCampResponse({
    status: String(formData.get("status") ?? ""),
    educators: record.map((e) => {
      const key = educatorKey(e);
      const phone = String(formData.get(`phone:${key}`) ?? e.phone ?? "");
      return { ...e, going: going.has(key), phone: phone || null };
    }),
    extras: extraNames.map((name, i) => ({ name, phone: extraPhones[i] ?? "" })),
    repsConfirmed: formData.get("reps_confirmed") === "on",
    termsAccepted: formData.get("terms") === "on",
    notes: String(formData.get("notes") ?? ""),
    declineReason: String(formData.get("decline_reason") ?? ""),
  });
  if (!parsed.ok) return parsed;
  const v = parsed.value;

  const { error } = await supabase.rpc("submit_camp_response", {
    p_registration_id: registrationId,
    p_status: v.status,
    p_educators: v.educators,
    p_reps_confirmed: v.repsConfirmed,
    p_notes: v.notes,
    p_decline_reason: v.declineReason,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/school");
  revalidatePath("/portal/school/camp");
  revalidatePath("/portal/school/resources");

  // The answer is saved; a failed receipt must not read as a failed confirmation.
  const [{ data: reg, error: regError }, { data: details, error: detailsError }] =
    await Promise.all([
      supabase
        .from("registrations")
        .select("school_id, owner_id, schools(name)")
        .eq("id", registrationId)
        .maybeSingle(),
      supabase.rpc("my_camp_details", { p_registration_id: registrationId }),
    ]);
  if (regError || detailsError || !reg) {
    console.error("camp receipt skipped", regError ?? detailsError);
  } else {
    const settings = (details as { settings?: CampSettings } | null)?.settings ?? null;
    const schoolName =
      (reg.schools as unknown as { name: string | null } | null)?.name ?? "Your school";
    const campTitle = settings?.title ?? "the ASC Camp";
    const attending = v.status === "attending";
    const admin = createAdminClient() ?? supabase;
    const audience = await getSchoolAudience(admin, reg.school_id, reg.owner_id);
    for (const p of audience) {
      if (!p.email) continue;
      await sendEmailSafely(
        buildCampConfirmationEmail({
          email: p.email,
          name: p.name,
          schoolFullName: schoolName,
          campTitle,
          attending,
          venue: settings?.venue,
          arrival: formatCampDate(settings?.arrival_at),
          departure: formatCampDate(settings?.departure_at),
          deadline: formatCampDate(settings?.confirm_deadline),
          educators: v.educators.filter((e) => e.going),
          whatsappUrl: settings?.whatsapp_url,
        }),
      );
    }
    await notifySchool(admin, reg.school_id, reg.owner_id, {
      title: attending ? "Camp place confirmed" : "Camp response recorded",
      body: attending
        ? `${schoolName} is confirmed for ${campTitle}. Join the WhatsApp group from your camp page.`
        : `${schoolName} will not attend ${campTitle}. You can change this until the deadline.`,
      link: "/portal/school/camp",
    });
  }

  return {
    ok: true,
    message:
      v.status === "attending"
        ? "Your place is secured. A receipt is on its way to your school's email."
        : "Thanks for letting us know. Your response has been recorded.",
  };
}
