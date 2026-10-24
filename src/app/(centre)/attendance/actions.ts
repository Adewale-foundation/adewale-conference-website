"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import {
  CENTRE_LEAD_COOKIE,
  readSession,
  sessionExpiry,
  signSession,
} from "@/lib/centre-lead-session";
import {
  activeLeadById,
  candidateCentre,
  findActiveLead,
  loadSitting,
  markAttendance,
  markMany,
  openAttendanceExam,
  openCamp,
  stampSignIn,
  type LeadWithCentre,
  type OpenExam,
} from "@/lib/attendance-data";
import { campDayFor, campDays } from "@/lib/camp-attendance";
import {
  loadCampMarks,
  loadCampPeople,
  markCamp as recordCampMarks,
  resolveCampPerson,
  type OpenCamp,
} from "@/lib/camp-attendance-data";
import { createAdminClient } from "@/supabase/admin";
import type { AttendanceStatus } from "@/supabase/types";

export type SignInResult = { ok: true } | { ok: false; error: string };
export type MarkResult = { ok: true } | { ok: false; error: string };

// Reuses the Fellows sheet secret rather than adding a variable to set on a
// deadline. Consequence worth knowing: rotating it signs every centre lead out.
function secret() {
  return process.env.FELLOWS_SHEET_SECRET ?? "";
}

export type LeadSession =
  | { kind: "exam"; lead: LeadWithCentre; exam: OpenExam }
  | { kind: "camp"; lead: LeadWithCentre; camp: OpenCamp; days: string[]; day: string };

/** Which register a lead's centre opens onto, or null while that register is closed. */
async function sessionFor(lead: LeadWithCentre): Promise<LeadSession | null> {
  if (lead.centre.kind === "camp") {
    const camp = await openCamp();
    if (!camp || camp.edition_year !== lead.edition_year) return null;
    const days = campDays(camp.arrival_at, camp.departure_at);
    const day = campDayFor(days);
    return day ? { kind: "camp", lead, camp, days, day } : null;
  }
  const exam = await openAttendanceExam();
  if (!exam || lead.edition_year !== exam.edition_year) return null;
  return { kind: "exam", lead, exam };
}

/**
 * The signed-in lead, re-derived from the cookie on every single use.
 *
 * Deliberately re-reads the row rather than trusting the cookie's contents: the
 * cookie proves which lead id was issued, not that the lead is still active or
 * that attendance is still open. Deactivating a lead ends their session here.
 */
export async function currentLead(): Promise<LeadSession | null> {
  const store = await cookies();
  const leadId = readSession(store.get(CENTRE_LEAD_COOKIE)?.value, secret());
  if (!leadId) return null;

  const lead = await activeLeadById(leadId);
  return lead ? sessionFor(lead) : null;
}

function serviceDb() {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Attendance needs SUPABASE_SECRET_KEY to be set.");
  return supabase;
}

export async function signIn(_prev: SignInResult | null, formData: FormData): Promise<SignInResult> {
  const ip = requestIp(await headers());
  if (!rateLimit(`centre-lead:${ip}`, { limit: 10, windowMs: 60_000 })) {
    return { ok: false, error: "Too many attempts from this device. Wait a minute and try again." };
  }

  if (!secret()) {
    return { ok: false, error: "Attendance is not configured on this server. Tell the exam desk." };
  }

  const centreId = String(formData.get("centre_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!centreId || !email) {
    return { ok: false, error: "Choose your centre and enter your email." };
  }

  const lead = await findActiveLead(centreId, email);
  // One message for "wrong email", "wrong centre" and "not on the list". Naming
  // which was wrong would confirm who is staffing where to anyone guessing.
  if (!lead) {
    return {
      ok: false,
      error: "We could not find you at that centre. Check the email the exam desk registered for you.",
    };
  }
  if (!(await sessionFor(lead))) return { ok: false, error: "Attendance is not open yet." };

  await stampSignIn(lead.id);
  const store = await cookies();
  const expiry = sessionExpiry();
  store.set(CENTRE_LEAD_COOKIE, signSession(lead.id, expiry, secret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiry),
  });
  redirect("/attendance/roster");
}

export async function signOut() {
  const store = await cookies();
  store.delete(CENTRE_LEAD_COOKIE);
  redirect("/attendance");
}

export async function mark(_prev: MarkResult | null, formData: FormData): Promise<MarkResult> {
  const session = await currentLead();
  if (!session) return { ok: false, error: "Your session ended. Sign in again." };
  if (session.kind !== "exam") return { ok: false, error: "Reload the page and try again." };

  const studentId = String(formData.get("student_id") ?? "").trim();
  const status = String(formData.get("status") ?? "") as AttendanceStatus;
  if (!studentId || (status !== "present" && status !== "absent")) {
    return { ok: false, error: "That mark did not make sense. Try again." };
  }

  // The posted student id is not a scope. Re-derive which centre they belong to
  // and refuse anyone allocated to a hall that is not this one — a lead may mark
  // their own candidates, and walk-ins nobody allocated, and nothing else.
  const allocation = await candidateCentre(session.exam, studentId);
  if (!allocation) return { ok: false, error: "That candidate is not in this sitting." };
  if (allocation.centreId && allocation.centreId !== session.lead.centre_id) {
    return { ok: false, error: "That candidate is allocated to another centre." };
  }

  await markAttendance({
    examId: session.exam.id,
    studentId,
    centreId: session.lead.centre_id,
    status,
    by: { leadId: session.lead.id },
  });

  revalidatePath("/attendance/roster");
  return { ok: true };
}

/** End of day: everyone still unaccounted for at this centre is absent. */
export async function markRemainingAbsent(
  _prev: MarkResult | null,
  _formData: FormData,
): Promise<MarkResult> {
  const session = await currentLead();
  if (!session) return { ok: false, error: "Your session ended. Sign in again." };
  if (session.kind !== "exam") return { ok: false, error: "Reload the page and try again." };

  const { entries } = await loadSitting(session.exam);
  const remaining = entries.filter(
    (e) => e.centreId === session.lead.centre_id && e.state === "unmarked",
  );
  if (remaining.length === 0) {
    return { ok: false, error: "Every candidate at this centre is already marked." };
  }

  await markMany({
    examId: session.exam.id,
    studentIds: remaining.map((e) => e.studentId),
    centreId: session.lead.centre_id,
    status: "absent",
    by: { leadId: session.lead.id },
  });

  revalidatePath("/attendance/roster");
  return { ok: true };
}

// ── camp ────────────────────────────────────────────────────────────────────
// The register page binds the day it showed, so a tap after midnight on a page
// loaded the day before is refused rather than filed under the wrong day.

type CampLeadSession = Extract<LeadSession, { kind: "camp" }>;

async function campSession(
  day: string,
): Promise<{ session: CampLeadSession; error?: never } | { error: string }> {
  const session = await currentLead();
  if (!session) return { error: "Your session ended. Sign in again." };
  if (session.kind !== "camp") return { error: "Reload the page and try again." };
  if (session.day !== day) return { error: "The day has changed. Reload the page to mark today." };
  return { session };
}

export async function markCampPerson(
  day: string,
  _prev: MarkResult | null,
  formData: FormData,
): Promise<MarkResult> {
  const result = await campSession(day);
  if (!("session" in result)) return { ok: false, error: result.error };
  const { session } = result;

  const key = String(formData.get("student_id") ?? "").trim();
  const status = String(formData.get("status") ?? "") as AttendanceStatus;
  if (!key || (status !== "present" && status !== "absent")) {
    return { ok: false, error: "That mark did not make sense. Try again." };
  }

  // The posted key is not a scope: it is re-resolved against this edition's camp list.
  const supabase = serviceDb();
  const person = await resolveCampPerson(supabase, session.camp.edition_year, key);
  if (!person) return { ok: false, error: "That person is not on the camp list." };

  await recordCampMarks(supabase, {
    year: session.camp.edition_year,
    day,
    people: [person],
    status,
    by: { leadId: session.lead.id },
  });
  revalidatePath("/attendance/roster");
  return { ok: true };
}

/** End of the day's roll call: everyone still unaccounted for is absent. */
export async function markCampRemainingAbsent(
  day: string,
  _prev: MarkResult | null,
  _formData: FormData,
): Promise<MarkResult> {
  const result = await campSession(day);
  if (!("session" in result)) return { ok: false, error: result.error };
  const { session } = result;
  const year = session.camp.edition_year;

  const supabase = serviceDb();
  const [{ people, error }, marks] = await Promise.all([
    loadCampPeople(supabase, year),
    loadCampMarks(supabase, year, day),
  ]);
  if (error) return { ok: false, error };
  const marked = new Set(marks.map((m) => m.person_key));
  const remaining = people.filter((p) => !marked.has(p.key));
  if (remaining.length === 0) return { ok: false, error: "Everyone is already marked for today." };

  await recordCampMarks(supabase, {
    year,
    day,
    people: remaining,
    status: "absent",
    by: { leadId: session.lead.id },
  });
  revalidatePath("/attendance/roster");
  return { ok: true };
}
