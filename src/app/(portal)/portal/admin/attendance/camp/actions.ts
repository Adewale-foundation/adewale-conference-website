"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/supabase/server";
import { createAdminClient } from "@/supabase/admin";
import { requireManage } from "@/supabase/auth";
import { campDays } from "@/lib/camp-attendance";
import { markCamp, resolveCampPerson } from "@/lib/camp-attendance-data";
import type { ActionResult } from "../actions";

const denied: ActionResult = { ok: false, error: "You have read-only access to participants." };

function refresh() {
  revalidatePath("/portal/admin/attendance/camp");
  revalidatePath("/portal/admin/attendance");
  revalidatePath("/attendance/roster");
}

export async function setCampAttendanceOpen(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireManage("participants"))) return denied;
  const year = Number(formData.get("edition_year"));
  const open = String(formData.get("open") ?? "") === "true";
  if (!Number.isInteger(year)) return { ok: false, error: "No edition chosen." };

  const supabase = await createClient();
  if (open) {
    const { data: settings, error } = await supabase
      .from("camp_settings")
      .select("arrival_at")
      .eq("edition_year", year)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!settings?.arrival_at) {
      return { ok: false, error: "Set the camp's arrival time first — the register has no days without it." };
    }

    // Staff sign in to the camp as a centre; a later edition has none until one is made.
    const { data: centre, error: centreError } = await supabase
      .from("exam_centres")
      .select("id")
      .eq("edition_year", year)
      .eq("kind", "camp")
      .maybeSingle();
    if (centreError) return { ok: false, error: centreError.message };
    if (!centre) {
      const { error: insertError } = await supabase
        .from("exam_centres")
        .insert({ edition_year: year, name: "ASC Camp", town: "Camp", kind: "camp" });
      if (insertError) return { ok: false, error: insertError.message };
    }

    // One camp open at a time — the partial unique index enforces it.
    const { error: closeError } = await supabase
      .from("camp_settings")
      .update({ attendance_open: false })
      .neq("edition_year", year);
    if (closeError) return { ok: false, error: closeError.message };
  }

  const { error } = await supabase
    .from("camp_settings")
    .update({ attendance_open: open })
    .eq("edition_year", year);
  if (error) return { ok: false, error: error.message };

  refresh();
  return {
    ok: true,
    message: open
      ? "Camp attendance is open. Camp staff can sign in now."
      : "Camp attendance is closed. Nobody can sign in to the camp or mark.",
  };
}

export async function correctCampMark(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;

  const year = Number(formData.get("edition_year"));
  const day = String(formData.get("day") ?? "");
  const key = String(formData.get("person_key") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!Number.isInteger(year) || !day || !key) return { ok: false, error: "Incomplete correction." };
  if (status !== "present" && status !== "absent") {
    return { ok: false, error: "A correction has to say present or absent." };
  }

  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("camp_settings")
    .select("arrival_at, departure_at")
    .eq("edition_year", year)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!settings || !campDays(settings.arrival_at, settings.departure_at).includes(day)) {
    return { ok: false, error: "That is not a day of camp." };
  }

  const person = await resolveCampPerson(supabase, year, key);
  if (!person) return { ok: false, error: "That person is not on the camp list." };

  // Writes are service-role only, as for the zonal register; the guard above is the gate.
  const service = createAdminClient();
  if (!service) return { ok: false, error: "Attendance needs SUPABASE_SECRET_KEY to be set." };
  await markCamp(service, { year, day, people: [person], status, by: { profileId: admin.user.id } });

  refresh();
  return { ok: true, message: `${person.name} recorded as ${status}, under your name.` };
}
