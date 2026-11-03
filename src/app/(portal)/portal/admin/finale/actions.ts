"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { requireManage } from "@/supabase/auth";
import { lagosInputToIso } from "@/lib/camp";
import { ATTEND_BASE, GRAND_FINALE, SCHOOL_FINALE_PATH, SOURCE_LABELS, doorQuery, validateAttendee } from "@/lib/finale-attend";
import {
  doorCheckIn,
  findDoorTickets,
  loadAttendance,
  registerAttendee,
  sendTicket,
  type DoorCheckIn,
  type DoorCounts,
  type DoorLookup,
} from "@/lib/finale-attend-data";
import { FINALE_YEAR, finaleDb } from "@/lib/finale-data";
import { SITE_URL } from "@/lib/site";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";
import type { FinaleAttendeeSource, FinaleAttendeeStatus } from "@/supabase/types";

const denied: ActionResult = { ok: false, error: "You have read-only access to participants." };
const ADMIN_FINALE_PATH = "/portal/admin/finale";

function refresh() {
  revalidatePath(ADMIN_FINALE_PATH, "layout");
  revalidatePath(ATTEND_BASE, "layout");
}

const noService: ActionResult = { ok: false, error: "Registration needs SUPABASE_SECRET_KEY to be set." };

export async function saveAttendSettings(year: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const raw = String(formData.get("attend_capacity") ?? "").replace(/[,\s]/g, "");
  const capacity = raw ? Number(raw) : null;
  if (capacity != null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100_000)) {
    return { ok: false, error: "Enter the hall's seat count as a whole number, or leave it blank for no cap." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("finale_settings").upsert({
    edition_year: year,
    attend_open: formData.get("attend_open") === "on",
    attend_capacity: capacity,
    updated_by: admin.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  refresh();
  return { ok: true, message: "Registration settings saved." };
}

/** Waitlisted → confirmed re-sends the ticket, so the attendee learns their seats are real. */
export async function setAttendeeStatus(
  attendeeId: string,
  status: FinaleAttendeeStatus,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finale_attendees")
    .update({ status })
    .eq("id", attendeeId)
    .select("id, ref_code");
  if (error) return { ok: false, error: `Could not update: ${error.message}` };
  if (!data?.length) return { ok: false, error: "That registration no longer exists." };
  let emailed = false;
  if (status === "confirmed") {
    const db = finaleDb();
    emailed = db ? await sendTicket(db, attendeeId) : false;
  }
  refresh();
  return {
    ok: true,
    message: status === "confirmed" ? `Confirmed${emailed ? " and ticket emailed" : ", but the email did not send"}.` : status === "cancelled" ? "Cancelled." : "Moved to the waitlist.",
  };
}

export async function checkInAttendee(attendeeId: string, undo: boolean, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finale_attendees")
    .update(
      undo
        ? { checked_in_at: null, checked_in_by_lead: null, checked_in_by_profile: null }
        : { checked_in_at: new Date().toISOString(), checked_in_by_lead: null, checked_in_by_profile: admin.user.id },
    )
    .eq("id", attendeeId)
    .eq("status", "confirmed")
    .select("seats");
  if (error) return { ok: false, error: `Could not check in: ${error.message}` };
  if (!data?.length) return { ok: false, error: "Only a confirmed registration can be checked in." };
  refresh();
  return { ok: true, message: undo ? "Check-in undone." : `Checked in: ${data[0].seats} seat${data[0].seats === 1 ? "" : "s"}.` };
}

export async function resendTicket(attendeeId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const db = finaleDb();
  if (!db) return noService;
  return (await sendTicket(db, attendeeId)) ? { ok: true, message: "Ticket emailed." } : { ok: false, error: "The email did not send. Check the address and try again." };
}

export async function inviteAttendee(year: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const db = finaleDb();
  if (!db) return noService;
  const checked = validateAttendee(
    {
      firstName: formData.get("first_name"),
      lastName: formData.get("last_name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      role: formData.get("role"),
      organisation: formData.get("organisation"),
      lga: "",
      studentCount: formData.get("student_count"),
      studentNames: [],
      studentClasses: [],
    },
    { requirePhone: false },
  );
  if (!checked.ok) return checked;

  const { registered, error } = await registerAttendee(db, year, checked.value, {
    source: "invited",
    invitedBy: admin.user.id,
    force: formData.get("force") === "on",
  });
  if (error || !registered) return { ok: false, error: `Could not invite: ${error}` };
  if (registered.existing) {
    const { data: row, error: rowError } = await db.from("finale_attendees").select("source, status").eq("id", registered.id).single();
    if (rowError) return { ok: false, error: `Could not check the existing registration: ${rowError.message}` };
    return {
      ok: false,
      error: `${checked.value.email} is already registered (${SOURCE_LABELS[row.source as FinaleAttendeeSource].toLowerCase()}, ${row.status}). Find them in the list below.`,
    };
  }
  const emailed = await sendTicket(db, registered.id);
  refresh();
  return {
    ok: true,
    message: `Invited ${checked.value.firstName}: ${registered.refCode}, ${registered.status}. ${emailed ? "Ticket emailed." : "The email did not send; use Resend."}`,
  };
}

export async function saveSchoolInviteSettings(year: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const raw = String(formData.get("school_capacity") ?? "").replace(/[,\s]/g, "");
  const capacity = raw ? Number(raw) : null;
  if (capacity != null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100_000)) {
    return { ok: false, error: "Enter the seats reserved for schools as a whole number, or leave it blank for no cap." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("finale_settings").upsert({
    edition_year: year,
    school_capacity: capacity,
    school_respond_by: lagosInputToIso(String(formData.get("school_respond_by") ?? "")),
    updated_by: admin.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  refresh();
  revalidatePath("/portal/school", "layout");
  return { ok: true, message: "School invitation settings saved." };
}

/** A draft, not a send: the admin reviews it in Announcements and sends it from there. */
export async function draftSchoolInviteAnnouncement(year: number, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin || !(await requireManage("announcements"))) return { ok: false, error: "You need manage access to both Participants and Announcements." };
  // Email links must be absolute: the email renderer drops relative ones.
  const link = `${SITE_URL}${SCHOOL_FINALE_PATH}`;
  const body = [
    `Your school is invited to the **ASC ${year} Grand Finale**: *${GRAND_FINALE.theme}: ${GRAND_FINALE.subtheme}*.`,
    "",
    `- **When:** ${GRAND_FINALE.dateLabel}, ${GRAND_FINALE.timeLabel}`,
    `- **Where:** ${GRAND_FINALE.venue}, ${GRAND_FINALE.venueArea}`,
    "- **Entry:** free",
    "",
    "Bring your students to watch the semi-finals and the final, see the project exhibition and the awards.",
    "",
    `**[Accept the invitation and choose who is coming](${link})**. Sign in to the school portal, tick the educators and students you're bringing, and we'll email you one ticket with a QR code for the whole group.`,
    "",
    "Seats for schools are limited and confirmed in the order schools reply.",
  ].join("\n");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title: `You're invited to the ASC ${year} Grand Finale`,
      body,
      channels: "both",
      target_role: "all",
      edition_year: year,
      created_by: admin.user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: `Could not create the draft: ${error?.message ?? "no row returned"}` };
  revalidatePath("/portal/admin/announcements");
  redirect(`/portal/admin/announcements/${(data as { id: string }).id}`);
}

/** Door staff can sign in at /attendance only while this is on. */
export async function setFinaleDoorOpen(year: number, open: boolean, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const supabase = await createClient();
  const { error } = await supabase.from("finale_settings").upsert({
    edition_year: year,
    door_open: open,
    updated_by: admin.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  revalidatePath(`${ADMIN_FINALE_PATH}/staff`);
  revalidatePath("/attendance");
  return { ok: true, message: open ? "The door is open: staff can sign in." : "The door is closed: staff are signed out at their next tap." };
}

// ── Admin scanner: the door-staff screen, gated on participants manage ──────

export async function adminLookupDoorTickets(query: string): Promise<DoorLookup> {
  if (!(await requireManage("participants"))) return { ok: false, error: "You have read-only access to participants." };
  const db = finaleDb();
  if (!db) return { ok: false, error: "Check-in needs SUPABASE_SECRET_KEY to be set." };
  const { tickets, error } = await findDoorTickets(db, FINALE_YEAR, doorQuery(query));
  return error ? { ok: false, error: "Could not search tickets. Try again." } : { ok: true, tickets };
}

export async function adminCheckInAtDoor(attendeeId: string, undo = false): Promise<DoorCheckIn> {
  const admin = await requireManage("participants");
  if (!admin) return { ok: false, reason: "error", ticket: null, error: "You have read-only access to participants." };
  const db = finaleDb();
  if (!db) return { ok: false, reason: "error", ticket: null, error: "Check-in needs SUPABASE_SECRET_KEY to be set." };
  const { data, error } = await db.from("finale_attendees").select("id").eq("id", attendeeId).eq("edition_year", FINALE_YEAR).maybeSingle();
  if (error) return { ok: false, reason: "error", ticket: null, error: error.message };
  if (!data) return { ok: false, reason: "missing", ticket: null };
  const result = await doorCheckIn(db, attendeeId, { profileId: admin.user.id }, undo);
  refresh();
  return result;
}

export async function adminDoorCounts(): Promise<DoorCounts | null> {
  if (!(await requireManage("participants"))) return null;
  const db = finaleDb();
  if (!db) return null;
  const { totals, error } = await loadAttendance(db, FINALE_YEAR);
  return error ? null : { checkedIn: totals.checkedIn, confirmed: totals.confirmed + totals.schoolConfirmed };
}
