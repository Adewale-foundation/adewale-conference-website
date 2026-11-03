import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { buildFinaleTicketEmail, sendEmail } from "@/lib/email";
import { GRAND_FINALE, ticketPath, type AttendeeValue } from "@/lib/finale-attend";
import { SITE_URL } from "@/lib/site";
import type { FinaleAttendee, FinaleAttendeeSource, FinaleAttendeeStatus, FinaleSettings } from "@/supabase/types";

/** `confirmed` is the public pool (open + invited); school groups fill their own reserve. */
export type SeatTotals = { confirmed: number; schoolConfirmed: number; waitlisted: number; checkedIn: number };
export type AttendSettings = Pick<
  FinaleSettings,
  "attend_open" | "attend_capacity" | "school_capacity" | "school_respond_by"
>;

/** Service role: finale_attend_taken() is not callable by anon or authenticated. */
export async function loadAttendance(
  db: SupabaseClient,
  year: number,
): Promise<{ settings: AttendSettings | null; totals: SeatTotals; error: string | null }> {
  const [settingsRes, takenRes] = await Promise.all([
    db
      .from("finale_settings")
      .select("attend_open, attend_capacity, school_capacity, school_respond_by")
      .eq("edition_year", year)
      .maybeSingle(),
    db.rpc("finale_attend_taken", { p_year: year }).single(),
  ]);
  const error = settingsRes.error ?? takenRes.error;
  const empty = { confirmed: 0, schoolConfirmed: 0, waitlisted: 0, checkedIn: 0 };
  if (error) return { settings: null, totals: empty, error: error.message };
  const t = takenRes.data as Record<"public_confirmed" | "school_confirmed" | "waitlisted" | "checked_in", number | string> | null;
  return {
    settings: (settingsRes.data as AttendSettings | null) ?? null,
    totals: t
      ? {
          confirmed: Number(t.public_confirmed),
          schoolConfirmed: Number(t.school_confirmed),
          waitlisted: Number(t.waitlisted),
          checkedIn: Number(t.checked_in),
        }
      : empty,
    error: null,
  };
}

export type SchoolResponse = Pick<
  FinaleAttendee,
  "id" | "ref_code" | "status" | "seats" | "student_count" | "educators" | "first_name" | "last_name" | "email"
> & { students: { full_name: string; class: string | null; student_id: string | null }[] };

/** The school's single response for the edition, if any. Service role: the caller has checked membership. */
export async function loadSchoolResponse(
  db: SupabaseClient,
  year: number,
  schoolId: string,
): Promise<{ response: SchoolResponse | null; error: string | null }> {
  const { data, error } = await db
    .from("finale_attendees")
    .select("id, ref_code, status, seats, student_count, educators, first_name, last_name, email, finale_attendee_students(full_name, class, student_id, sort)")
    .eq("edition_year", year)
    .eq("school_id", schoolId)
    .eq("source", "school")
    .maybeSingle();
  if (error) return { response: null, error: error.message };
  if (!data) return { response: null, error: null };
  const { finale_attendee_students: rows, ...rest } = data as unknown as Omit<SchoolResponse, "students"> & {
    finale_attendee_students: { full_name: string; class: string | null; student_id: string | null; sort: number }[];
  };
  return {
    response: {
      ...rest,
      students: [...(rows ?? [])].sort((a, b) => a.sort - b.sort).map(({ sort: _sort, ...s }) => s),
    },
    error: null,
  };
}

export type SchoolResponded = { id: string; refCode: string; status: FinaleAttendeeStatus; seats: number } | null;

export async function respondForSchool(
  db: SupabaseClient,
  year: number,
  args: {
    schoolId: string;
    registrationId: string;
    organisation: string;
    lga: string | null;
    lead: { firstName: string; lastName: string; email: string; phone: string | null };
    educators: { name: string; phone: string | null; email: string | null }[];
    studentCount: number;
    students: { name: string; class: string; studentId: string | null }[];
    attending: boolean;
  },
): Promise<{ responded: SchoolResponded; full: number | null; error: string | null }> {
  const { data, error } = await db.rpc("finale_school_respond", {
    p_year: year,
    p_school_id: args.schoolId,
    p_registration_id: args.registrationId,
    p_organisation: args.organisation,
    p_lga: args.lga,
    p_first: args.lead.firstName,
    p_last: args.lead.lastName,
    p_email: args.lead.email,
    p_phone: args.lead.phone,
    p_educators: args.educators,
    p_student_count: args.studentCount,
    p_students: args.students,
    p_attending: args.attending,
  });
  if (error) {
    const full = /finale_school_full:(\d+)/.exec(error.message);
    return { responded: null, full: full ? Number(full[1]) : null, error: full ? null : error.message };
  }
  const row = ((data ?? []) as { id: string; ref_code: string; status: FinaleAttendeeStatus; seats: number }[])[0];
  return { responded: row ? { id: row.id, refCode: row.ref_code, status: row.status, seats: Number(row.seats) } : null, full: null, error: null };
}

export type Registered = { id: string; refCode: string; status: FinaleAttendeeStatus; seats: number; existing: boolean };

export async function registerAttendee(
  db: SupabaseClient,
  year: number,
  v: AttendeeValue,
  opts: { source: FinaleAttendeeSource; invitedBy: string | null; force: boolean },
): Promise<{ registered: Registered | null; error: string | null }> {
  const { data, error } = await db
    .rpc("finale_attend_register", {
      p_year: year,
      p_first: v.firstName,
      p_last: v.lastName,
      p_email: v.email,
      p_phone: v.phone,
      p_role: v.role,
      p_organisation: v.organisation,
      p_lga: v.lga,
      p_student_count: v.studentCount,
      p_students: v.students,
      p_source: opts.source,
      p_invited_by: opts.invitedBy,
      p_force: opts.force,
    })
    .single();
  if (error || !data) return { registered: null, error: error?.message ?? "No row returned." };
  const r = data as { id: string; ref_code: string; status: FinaleAttendeeStatus; seats: number; existing: boolean };
  return { registered: { id: r.id, refCode: r.ref_code, status: r.status, seats: Number(r.seats), existing: r.existing }, error: null };
}

export function ticketUrl(refCode: string): string {
  return `${SITE_URL}${ticketPath(refCode)}`;
}

/** The QR is the ticket link, so scanning it at the door opens the check-in page. */
export async function ticketQrSvg(refCode: string): Promise<string> {
  return QRCode.toString(ticketUrl(refCode), { type: "svg", margin: 1, color: { dark: "#0A0F1E", light: "#FFFFFF" } });
}

/** Emails the attendee their ticket (or waitlist notice). Never throws; false when it did not send. */
export async function sendTicket(db: SupabaseClient, attendeeId: string): Promise<boolean> {
  try {
    const [attendeeRes, studentsRes] = await Promise.all([
      db.from("finale_attendees").select("*").eq("id", attendeeId).single(),
      db.from("finale_attendee_students").select("full_name, class, sort").eq("attendee_id", attendeeId).order("sort"),
    ]);
    if (attendeeRes.error) throw new Error(attendeeRes.error.message);
    if (studentsRes.error) throw new Error(studentsRes.error.message);
    const a = attendeeRes.data as FinaleAttendee;
    if (a.status === "cancelled") return false;

    const png = await QRCode.toBuffer(ticketUrl(a.ref_code), { type: "png", width: 260, margin: 1 });
    const email = buildFinaleTicketEmail({
      email: a.email,
      firstName: a.first_name,
      lastName: a.last_name,
      refCode: a.ref_code,
      seats: a.seats,
      studentCount: a.student_count,
      educators: a.source === "school" ? (a.educators ?? []).map((e) => e.name) : [],
      namedStudents: ((studentsRes.data ?? []) as { full_name: string; class: string | null }[]).map((s) =>
        s.class ? `${s.full_name} (${s.class})` : s.full_name,
      ),
      status: a.status,
      source: a.source,
      organisation: a.organisation,
      event: GRAND_FINALE,
      ticketUrl: ticketUrl(a.ref_code),
      qrPngBase64: png.toString("base64"),
    });
    return await sendEmail(email);
  } catch (error) {
    const reasons = (error as { response?: { body?: { errors?: unknown } } })?.response?.body?.errors;
    console.error("finale: ticket email failed", reasons ? JSON.stringify(reasons) : error);
    return false;
  }
}

/** What the public ticket page may show: no email, no phone, no student names. */
export type PublicTicket = Pick<
  FinaleAttendee,
  "id" | "ref_code" | "first_name" | "last_name" | "organisation" | "seats" | "student_count" | "status" | "source" | "checked_in_at"
>;

export async function loadTicket(db: SupabaseClient, refCode: string): Promise<{ ticket: PublicTicket | null; error: string | null }> {
  const { data, error } = await db
    .from("finale_attendees")
    .select("id, ref_code, first_name, last_name, organisation, seats, student_count, status, source, checked_in_at")
    .eq("ref_code", refCode)
    .maybeSingle();
  if (error) return { ticket: null, error: error.message };
  return { ticket: (data as PublicTicket | null) ?? null, error: null };
}
