"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/supabase/server";
import { requireManage } from "@/supabase/auth";
import { formatCampDate, lagosInputToIso } from "@/lib/camp";
import { notifySchool } from "@/lib/school-notify";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";
import type { CampStatus } from "@/supabase/types";

const denied: ActionResult = { ok: false, error: "You have read-only access to participants." };
const CAMP_STATUSES: CampStatus[] = ["pending", "attending", "not_attending", "released"];

function refresh() {
  revalidatePath("/portal/admin/participants/camp");
  revalidatePath("/portal/school", "layout");
}

async function isLatestEdition(supabase: SupabaseClient, year: number) {
  const { data, error } = await supabase
    .from("editions")
    .select("year")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !error && data?.year === year;
}

export async function saveCampSettings(
  year: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const supabase = await createClient();
  if (!(await isLatestEdition(supabase, year))) {
    return { ok: false, error: "Only the current edition's camp can be edited." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Give the camp a title." };
  const whatsapp = String(formData.get("whatsapp_url") ?? "").trim();
  if (whatsapp && !/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//.test(whatsapp)) {
    return { ok: false, error: "The WhatsApp link should start with https://chat.whatsapp.com/." };
  }
  const arrival = lagosInputToIso(String(formData.get("arrival_at") ?? ""));
  const departure = lagosInputToIso(String(formData.get("departure_at") ?? ""));
  if (arrival && departure && departure <= arrival) {
    return { ok: false, error: "Departure must be after arrival." };
  }

  const { error } = await supabase.from("camp_settings").upsert({
    edition_year: year,
    title,
    venue: String(formData.get("venue") ?? "").trim() || null,
    arrival_at: arrival,
    departure_at: departure,
    confirm_deadline: lagosInputToIso(String(formData.get("confirm_deadline") ?? "")),
    whatsapp_url: whatsapp || null,
    is_open: formData.get("is_open") === "on",
    updated_by: admin.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  refresh();
  return { ok: true, message: "Camp settings saved." };
}

// Admin override: any status (including releasing a spot), a note, and a
// per-school respond_by that lets a replacement answer after the deadline.
export async function saveCampConfirmation(
  registrationId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const supabase = await createClient();

  const status = String(formData.get("status") ?? "") as CampStatus;
  if (!CAMP_STATUSES.includes(status)) return { ok: false, error: "Choose a status." };
  const respondByRaw = String(formData.get("respond_by") ?? "").trim();
  const respondBy = lagosInputToIso(respondByRaw);
  if (respondByRaw && !respondBy) return { ok: false, error: "Enter a valid respond-by date." };
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const [{ data: reg, error: regError }, { data: existing, error: existingError }] = await Promise.all([
    supabase
      .from("registrations")
      .select("school_id, owner_id, edition_year, schools(name)")
      .eq("id", registrationId)
      .maybeSingle(),
    supabase
      .from("camp_confirmations")
      .select("status, respond_by")
      .eq("registration_id", registrationId)
      .maybeSingle(),
  ]);
  if (regError || existingError) {
    return { ok: false, error: `Could not load the school: ${(regError ?? existingError)!.message}` };
  }
  if (!reg?.school_id) return { ok: false, error: "Registration not found." };
  if (!(await isLatestEdition(supabase, reg.edition_year))) {
    return { ok: false, error: "Only the current edition's camp can be edited." };
  }

  const { error } = await supabase.from("camp_confirmations").upsert(
    {
      registration_id: registrationId,
      school_id: reg.school_id,
      edition_year: reg.edition_year,
      status,
      respond_by: respondBy,
      admin_note: adminNote,
      updated_by: admin.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "registration_id" },
  );
  if (error) return { ok: false, error: `Could not save: ${error.message}` };

  const schoolName = (reg.schools as unknown as { name: string | null } | null)?.name ?? "Your school";
  const released = status === "released" && existing?.status !== "released";
  const newDeadline = status === "pending" && respondBy && respondBy !== existing?.respond_by;
  if (released || newDeadline) {
    await notifySchool(supabase, reg.school_id, reg.owner_id, {
      title: released ? "Camp place released" : "Confirm your camp place",
      body: released
        ? `${schoolName}'s ASC Camp place has been offered to another school. Contact the Planning Committee with any questions.`
        : `${schoolName} is invited to the ASC Camp. Confirm your place by ${formatCampDate(respondBy)}.`,
      link: "/portal/school/camp",
    });
  }

  refresh();
  return { ok: true, message: "Saved." };
}

// Invite a school that didn't qualify. invited_manually is what makes
// camp_eligible() let it respond; the roster labels it "Added by admin".
export async function addCampSchool(
  year: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const supabase = await createClient();
  if (!(await isLatestEdition(supabase, year))) {
    return { ok: false, error: "Only the current edition's camp can be edited." };
  }

  const registrationId = String(formData.get("registration_id") ?? "");
  if (!registrationId) return { ok: false, error: "Choose a school to add." };
  const respondByRaw = String(formData.get("respond_by") ?? "").trim();
  const respondBy = lagosInputToIso(respondByRaw);
  if (respondByRaw && !respondBy) return { ok: false, error: "Enter a valid respond-by date." };
  const adminNote = String(formData.get("admin_note") ?? "").trim() || null;

  const { data: reg, error: regError } = await supabase
    .from("registrations")
    .select("school_id, owner_id, edition_year, schools(name)")
    .eq("id", registrationId)
    .maybeSingle();
  if (regError) return { ok: false, error: `Could not load the school: ${regError.message}` };
  if (!reg?.school_id) return { ok: false, error: "Registration not found." };
  if (reg.edition_year !== year) return { ok: false, error: "That school is from another edition." };

  const { error } = await supabase.from("camp_confirmations").upsert(
    {
      registration_id: registrationId,
      school_id: reg.school_id,
      edition_year: reg.edition_year,
      invited_manually: true,
      respond_by: respondBy,
      admin_note: adminNote,
      updated_by: admin.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "registration_id" },
  );
  if (error) return { ok: false, error: `Could not add the school: ${error.message}` };

  const schoolName = (reg.schools as unknown as { name: string | null } | null)?.name ?? "Your school";
  await notifySchool(supabase, reg.school_id, reg.owner_id, {
    title: "You're invited to the ASC Camp",
    body: respondBy
      ? `${schoolName} has been invited to the ASC Camp. Confirm your place by ${formatCampDate(respondBy)}.`
      : `${schoolName} has been invited to the ASC Camp. Confirm your place from your portal.`,
    link: "/portal/school/camp",
  });

  refresh();
  return { ok: true, message: `${schoolName} added to camp.` };
}

// Undo a manual addition. Only before the school answers: once it has, release
// the place instead so the answer stays on record.
export async function removeCampSchool(
  registrationId: string,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const supabase = await createClient();
  const { data: row, error: rowError } = await supabase
    .from("camp_confirmations")
    .select("edition_year")
    .eq("registration_id", registrationId)
    .maybeSingle();
  if (rowError) return { ok: false, error: `Could not load the school: ${rowError.message}` };
  if (!row || !(await isLatestEdition(supabase, row.edition_year))) {
    return { ok: false, error: "Only the current edition's camp can be edited." };
  }

  const { data, error } = await supabase
    .from("camp_confirmations")
    .delete()
    .eq("registration_id", registrationId)
    .eq("invited_manually", true)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: `Could not remove the school: ${error.message}` };
  if (!data?.length) {
    return { ok: false, error: "Only a school added by hand that hasn't answered can be removed. Release its place instead." };
  }

  refresh();
  return { ok: true, message: "Removed from camp." };
}
