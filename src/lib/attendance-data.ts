import "server-only";
import { createAdminClient } from "@/supabase/admin";
import { chunk } from "@/lib/batch";
import {
  buildRoster,
  pickRegistrationPerSchool,
  schoolCentres,
  type AttendanceMark,
  type RosterCandidate,
  type RosterEntry,
} from "@/lib/attendance";
import type { AttendanceStatus, CentreLead, ExamCentre } from "@/supabase/types";

/**
 * Every read and write behind the centre-lead pages.
 *
 * Those pages have no auth user, so all of this runs on the service-role key and
 * RLS is not the tenant scope here — the callers are.
 */

const PAGE = 1000;

/** PostgREST truncates past the project's Max rows instead of erroring, and a
 *  half-listed edition is indistinguishable from a small one. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function db() {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Attendance needs SUPABASE_SECRET_KEY to be set.");
  return supabase;
}

export type OpenExam = { id: string; title: string; edition_year: number; stage: string };

/** The one exam taking attendance, or null — which is also the off switch for
 *  the whole lead-facing site. */
export async function openAttendanceExam(): Promise<OpenExam | null> {
  const { data, error } = await db()
    .from("paper_exams")
    .select("id, title, edition_year, stage")
    .eq("attendance_open", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OpenExam) ?? null;
}

export async function listCentres(editionYear: number): Promise<ExamCentre[]> {
  const { data, error } = await db()
    .from("exam_centres")
    .select("id, edition_year, name, town, legacy_zone, is_active")
    .eq("edition_year", editionYear)
    .order("town");
  if (error) throw new Error(error.message);
  return (data ?? []) as ExamCentre[];
}

export type LeadWithCentre = CentreLead & { centre: ExamCentre };

const LEAD_COLUMNS =
  "id, edition_year, centre_id, name, email, phone, role, is_active, last_signed_in_at," +
  " centre:exam_centres!inner(id, edition_year, name, town, legacy_zone, is_active)";

/** Matched on the email an admin registered, case-insensitively. Inactive leads
 *  are not returned at all, so deactivating one ends their session at the next
 *  request rather than at expiry. */
export async function findActiveLead(
  centreId: string,
  email: string,
  editionYear: number,
): Promise<LeadWithCentre | null> {
  const { data, error } = await db()
    .from("centre_leads")
    .select(LEAD_COLUMNS)
    .eq("centre_id", centreId)
    .eq("edition_year", editionYear)
    .eq("is_active", true)
    .ilike("email", email.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as LeadWithCentre) ?? null;
}

export async function activeLeadById(id: string): Promise<LeadWithCentre | null> {
  const { data, error } = await db()
    .from("centre_leads")
    .select(LEAD_COLUMNS)
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as LeadWithCentre) ?? null;
}

export async function stampSignIn(leadId: string) {
  const { error } = await db()
    .from("centre_leads")
    .update({ last_signed_in_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
}

type CandidateRow = {
  student_id: string;
  exam_no: string;
  students: {
    name: string;
    level: string | null;
    school_id: string | null;
    deactivated_at: string | null;
    schools: { name: string | null } | null;
  } | null;
};

/**
 * Every candidate in the sitting, tagged with the venue their school was sent
 * to. `centreId` null means no allocation reaches them — they are the walk-ins
 * any lead may mark.
 */
export async function loadSitting(exam: OpenExam): Promise<{
  centres: ExamCentre[];
  entries: (RosterEntry & { centreId: string | null; registrationId: string | null })[];
}> {
  const supabase = db();
  const centres = await listCentres(exam.edition_year);

  const [registrations, candidates, marks] = await Promise.all([
    fetchAll<{
      id: string;
      school_id: string | null;
      qualification_zone: string | null;
      exam_centre_id: string | null;
      created_at: string | null;
    }>((from, to) =>
      supabase
        .from("registrations")
        .select("id, school_id, qualification_zone, exam_centre_id, created_at")
        .eq("edition_year", exam.edition_year)
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<CandidateRow>((from, to) =>
      supabase
        .from("paper_exam_candidates")
        .select(
          "student_id, exam_no, students(name, level, school_id, deactivated_at, schools(name))",
        )
        .eq("exam_id", exam.id)
        .order("exam_no")
        .range(from, to) as unknown as PromiseLike<{
        data: CandidateRow[] | null;
        error: { message: string } | null;
      }>,
    ),
    fetchAll<AttendanceMark>((from, to) =>
      supabase
        .from("paper_exam_attendance")
        .select("student_id, status, centre_id, marked_at")
        .eq("exam_id", exam.id)
        .range(from, to),
    ),
  ]);

  const centreOf = schoolCentres(registrations, centres);
  // The same registration schoolCentres allocates from, so admin links agree with the venue.
  const registrationOf = pickRegistrationPerSchool(registrations);

  // Allocation is append-only so a printed sheet is never renumbered, which
  // leaves a replaced rep holding a candidate row. Same filter as the roster
  // export, for the same reason.
  const live = candidates.filter((r) => r.students && !r.students.deactivated_at);

  const roster: RosterCandidate[] = live.map((r) => ({
    studentId: r.student_id,
    examNo: r.exam_no,
    name: r.students?.name ?? "—",
    schoolId: r.students?.school_id ?? "",
    schoolName: r.students?.schools?.name ?? "Unknown school",
    level: r.students?.level ?? null,
  }));

  const entries = buildRoster(roster, marks).map((e) => ({
    ...e,
    centreId: centreOf.get(e.schoolId) ?? null,
    registrationId: registrationOf.get(e.schoolId)?.id ?? null,
  }));

  return { centres, entries };
}

/**
 * Where one candidate was sent, without loading the sitting.
 *
 * The mark action runs on every tap, so it cannot afford loadSitting's three
 * full-table reads. Returns null when the candidate is not in this sitting at
 * all; `{ centreId: null }` is a real answer meaning "nobody allocated them",
 * which is who a lead is allowed to take as a walk-in.
 */
export async function candidateCentre(
  exam: OpenExam,
  studentId: string,
): Promise<{ centreId: string | null } | null> {
  const supabase = db();

  const { data: candidate, error } = await supabase
    .from("paper_exam_candidates")
    .select("student_id, students!inner(school_id, deactivated_at)")
    .eq("exam_id", exam.id)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const student = (candidate as unknown as CandidateRow | null)?.students;
  if (!student || student.deactivated_at || !student.school_id) return null;

  const [{ data: registrations, error: regError }, centres] = await Promise.all([
    supabase
      .from("registrations")
      .select("school_id, qualification_zone, exam_centre_id, created_at")
      .eq("edition_year", exam.edition_year)
      .eq("school_id", student.school_id)
      .order("created_at"),
    listCentres(exam.edition_year),
  ]);
  if (regError) throw new Error(regError.message);

  const centreOf = schoolCentres(registrations ?? [], centres);
  return { centreId: centreOf.get(student.school_id) ?? null };
}

export type Marker = { leadId: string } | { profileId: string };

/** The caller has already re-derived who is marking and which centre they may
 *  mark at — nothing here is taken from a form. */
export async function markAttendance(input: {
  examId: string;
  studentId: string;
  centreId: string;
  status: AttendanceStatus;
  by: Marker;
}) {
  const supabase = db();
  const marker = {
    marked_by_lead: "leadId" in input.by ? input.by.leadId : null,
    marked_by_profile: "profileId" in input.by ? input.by.profileId : null,
  };
  const row = {
    exam_id: input.examId,
    student_id: input.studentId,
    centre_id: input.centreId,
    status: input.status,
    marked_at: new Date().toISOString(),
    ...marker,
  };

  const { error } = await supabase
    .from("paper_exam_attendance")
    .upsert(row, { onConflict: "exam_id,student_id" });
  if (error) throw new Error(error.message);

  // Append-only history. A failure here must not roll back the mark itself —
  // the register is the thing a hall depends on — so it is reported, not thrown.
  const { error: eventError } = await supabase.from("paper_exam_attendance_events").insert({
    exam_id: input.examId,
    student_id: input.studentId,
    centre_id: input.centreId,
    status: input.status,
    ...marker,
  });
  if (eventError) console.error("attendance event not recorded", eventError.message);
}

/** The end-of-day sweep, as batches rather than one round trip per candidate. */
export async function markMany(input: {
  examId: string;
  studentIds: string[];
  centreId: string;
  status: AttendanceStatus;
  by: Marker;
}): Promise<number> {
  const supabase = db();
  const marker = {
    marked_by_lead: "leadId" in input.by ? input.by.leadId : null,
    marked_by_profile: "profileId" in input.by ? input.by.profileId : null,
  };
  const markedAt = new Date().toISOString();
  // ON CONFLICT cannot touch the same row twice in one statement, so dedupe by
  // the conflict key before chunking.
  const ids = [...new Set(input.studentIds)];

  for (const batch of chunk(ids, 100)) {
    const rows = batch.map((student_id) => ({
      exam_id: input.examId,
      student_id,
      centre_id: input.centreId,
      status: input.status,
      marked_at: markedAt,
      ...marker,
    }));
    const { error } = await supabase
      .from("paper_exam_attendance")
      .upsert(rows, { onConflict: "exam_id,student_id" });
    if (error) throw new Error(error.message);

    const { error: eventError } = await supabase.from("paper_exam_attendance_events").insert(
      batch.map((student_id) => ({
        exam_id: input.examId,
        student_id,
        centre_id: input.centreId,
        status: input.status,
        ...marker,
      })),
    );
    if (eventError) console.error("attendance events not recorded", eventError.message);
  }
  return ids.length;
}
