"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/supabase/server";
import { requireManage } from "@/supabase/auth";
import { parseCsvGrid } from "@/lib/csv";
import { markAttendance } from "@/lib/attendance-data";
import { buildCentreStaffEmail, isUndeliverableAddress, sendEmailSafely } from "@/lib/email";
import { formatCampDate } from "@/lib/camp";
import {
  CENTRE_LEAD_ROLES,
  CENTRE_LEAD_ROLE_LABELS,
  type CentreLeadRole,
} from "@/supabase/types";

const MODULE = "participants" as const;

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const denied: ActionResult = { ok: false, error: "You have read-only access to participants." };

function refresh() {
  revalidatePath("/portal/admin/attendance");
  revalidatePath("/attendance/roster");
}

function readRole(value: unknown): CentreLeadRole {
  const role = String(value ?? "");
  return (CENTRE_LEAD_ROLES as readonly string[]).includes(role)
    ? (role as CentreLeadRole)
    : "invigilator";
}

/** Good enough to catch a typed mistake; the address still has to match at
 *  sign-in, so this is not the gate. */
function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ── the sitting ─────────────────────────────────────────────────────────────

export async function setAttendanceOpen(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireManage(MODULE))) return denied;
  const examId = String(formData.get("exam_id") ?? "").trim();
  const open = String(formData.get("open") ?? "") === "true";
  if (!examId) return { ok: false, error: "No exam chosen." };

  const supabase = await createClient();

  // Only one exam per edition may be open — the partial unique index enforces
  // it, so close the others first rather than handing the admin a 23505.
  if (open) {
    const { data: exam, error: readError } = await supabase
      .from("paper_exams")
      .select("edition_year")
      .eq("id", examId)
      .maybeSingle();
    if (readError) return { ok: false, error: readError.message };
    if (!exam) return { ok: false, error: "That exam no longer exists." };

    const { error: closeError } = await supabase
      .from("paper_exams")
      .update({ attendance_open: false })
      .eq("edition_year", exam.edition_year)
      .neq("id", examId);
    if (closeError) return { ok: false, error: closeError.message };
  }

  const { error } = await supabase
    .from("paper_exams")
    .update({ attendance_open: open })
    .eq("id", examId);
  if (error) return { ok: false, error: error.message };

  refresh();
  return {
    ok: true,
    message: open
      ? "Attendance is open. Centre leads can sign in now."
      : "Attendance is closed. Nobody can sign in or mark.",
  };
}

// ── centre leads ────────────────────────────────────────────────────────────

export async function addLead(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage(MODULE);
  if (!admin) return denied;

  const centreId = String(formData.get("centre_id") ?? "").trim();
  const editionYear = Number(formData.get("edition_year"));
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const role = readRole(formData.get("role"));

  if (!centreId || !name || !email) return { ok: false, error: "Centre, name and email are all needed." };
  if (!looksLikeEmail(email)) return { ok: false, error: `“${email}” is not an email address.` };
  if (!Number.isFinite(editionYear)) return { ok: false, error: "No edition chosen." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("centre_leads")
    .insert({ centre_id: centreId, edition_year: editionYear, name, email, phone, role });
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? `${email} is already registered at that centre.`
          : error.message,
    };
  }

  refresh();
  return { ok: true, message: `${name} can now sign in with ${email}.` };
}

/**
 * A pasted block of `name, email, phone` lines — which is how the staffing list
 * actually arrives, out of the Fellows sheet. Reports per-line failures rather
 * than refusing the whole paste, because one malformed row in forty should not
 * mean retyping the other thirty-nine.
 */
export async function addLeadsBulk(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage(MODULE);
  if (!admin) return denied;

  const centreId = String(formData.get("centre_id") ?? "").trim();
  const editionYear = Number(formData.get("edition_year"));
  const role = readRole(formData.get("role"));
  const text = String(formData.get("rows") ?? "").trim();
  if (!centreId) return { ok: false, error: "Choose the centre these people staff." };
  if (!text) return { ok: false, error: "Paste at least one line." };

  const rows: { name: string; email: string; phone: string | null }[] = [];
  const skipped: string[] = [];
  for (const cells of parseCsvGrid(text)) {
    const [name = "", email = "", phone = ""] = cells.map((c) => c.trim());
    if (!name && !email) continue;
    if (!name || !looksLikeEmail(email)) {
      skipped.push(cells.join(", ").slice(0, 60));
      continue;
    }
    rows.push({ name, email, phone: phone || null });
  }
  if (rows.length === 0) {
    return { ok: false, error: "No line had both a name and an email address." };
  }

  const supabase = await createClient();
  // Case-insensitively unique per centre, so a re-paste updates rather than
  // colliding. Dedupe within the paste first — one statement cannot touch the
  // same row twice.
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const { error } = await supabase.from("centre_leads").insert(
    deduped.map((r) => ({
      centre_id: centreId,
      edition_year: editionYear,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role,
    })),
  );
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "One of those emails is already registered at that centre. Remove it and paste again."
          : error.message,
    };
  }

  refresh();
  const tail = skipped.length ? ` Skipped ${skipped.length} line(s) with no usable email.` : "";
  return { ok: true, message: `Added ${deduped.length} to the centre.${tail}` };
}

export async function setLeadActive(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireManage(MODULE))) return denied;
  const id = String(formData.get("lead_id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return { ok: false, error: "No lead chosen." };

  const supabase = await createClient();
  const { error } = await supabase.from("centre_leads").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  refresh();
  // Sessions are re-checked against is_active on every request, so this takes
  // effect at their next tap rather than at expiry.
  return {
    ok: true,
    message: active ? "They can sign in again." : "Signed out, and cannot sign in again.",
  };
}

// ── corrections ─────────────────────────────────────────────────────────────

/** The venue a school sits at, by id — the only way to reach a 2026 centre that
 *  no legacy zone string names (Arigbajo, Imeko). */
export async function setSchoolCentre(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireManage(MODULE))) return denied;
  const schoolId = String(formData.get("school_id") ?? "").trim();
  const editionYear = Number(formData.get("edition_year"));
  const centreId = String(formData.get("centre_id") ?? "").trim() || null;
  if (!schoolId || !Number.isFinite(editionYear)) {
    return { ok: false, error: "No school chosen." };
  }

  const supabase = await createClient();
  // Every registration this school holds for the edition, not just the earliest:
  // 17 school-editions have more than one, and leaving a second row pointing
  // somewhere else is how the roster would disagree with itself later.
  const { error } = await supabase
    .from("registrations")
    .update({ exam_centre_id: centreId })
    .eq("school_id", schoolId)
    .eq("edition_year", editionYear);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true, message: centreId ? "Moved." : "Allocation cleared." };
}

export async function correctMark(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage(MODULE);
  if (!admin) return denied;

  const examId = String(formData.get("exam_id") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "").trim();
  const centreId = String(formData.get("centre_id") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!examId || !studentId || !centreId) return { ok: false, error: "Incomplete correction." };
  if (status !== "present" && status !== "absent") {
    return { ok: false, error: "A correction has to say present or absent." };
  }

  await markAttendance({
    examId,
    studentId,
    centreId,
    status,
    by: { profileId: admin.user.id },
  });

  refresh();
  return { ok: true, message: `Recorded as ${status}, under your name.` };
}

/**
 * Send one centre lead their register link.
 *
 * Deliberately one person at a time rather than a "mail everyone" button: the
 * roster is assembled over days as Fellows confirm, so the useful question is
 * "who have I not told yet", which the stamp on each row answers.
 */
export async function emailLead(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireManage(MODULE))) return denied;
  const id = String(formData.get("lead_id") ?? "").trim();
  if (!id) return { ok: false, error: "No lead chosen." };

  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from("centre_leads")
    .select("id, name, email, role, is_active, exam_centres(name, town, kind, edition_year)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!lead) return { ok: false, error: "That person is no longer on the list." };

  const row = lead as unknown as {
    name: string;
    email: string;
    role: CentreLeadRole;
    is_active: boolean;
    exam_centres: { name: string; town: string; kind: string; edition_year: number } | null;
  };
  if (!row.is_active) {
    return { ok: false, error: `${row.name} is deactivated — reactivate them first.` };
  }
  // A reserved domain is a guaranteed hard bounce, and bounce rate is the thing
  // that gets a sending domain blocked.
  if (isUndeliverableAddress(row.email)) {
    return { ok: false, error: `${row.email} cannot receive mail.` };
  }
  if (!row.exam_centres) {
    return { ok: false, error: "That person's centre is missing — the email would not say where." };
  }

  let eventDate: string | undefined;
  if (row.exam_centres.kind === "camp") {
    const { data: camp, error: campError } = await supabase
      .from("camp_settings")
      .select("arrival_at, departure_at")
      .eq("edition_year", row.exam_centres.edition_year)
      .maybeSingle();
    if (campError) return { ok: false, error: campError.message };
    if (!camp?.arrival_at) {
      return { ok: false, error: "The camp has no arrival date yet — the email would not say when." };
    }
    eventDate = camp.departure_at
      ? `${formatCampDate(camp.arrival_at, false)} to ${formatCampDate(camp.departure_at, false)}`
      : formatCampDate(camp.arrival_at, false);
  }

  await sendEmailSafely(
    buildCentreStaffEmail({
      name: row.name,
      email: row.email,
      centre: `${row.exam_centres.name}, ${row.exam_centres.town}`,
      role: CENTRE_LEAD_ROLE_LABELS[row.role],
      eventDate,
    }),
  );

  // sendEmailSafely swallows a provider failure by design, so this stamp means
  // "we tried", not "it arrived". Said plainly in the message rather than
  // implied by a tick.
  const { error: stampError } = await supabase
    .from("centre_leads")
    .update({ last_emailed_at: new Date().toISOString() })
    .eq("id", id);
  if (stampError) return { ok: false, error: stampError.message };

  refresh();
  return { ok: true, message: `Sent to ${row.email}.` };
}
