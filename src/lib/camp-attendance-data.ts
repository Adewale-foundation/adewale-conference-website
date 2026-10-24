import type { SupabaseClient } from "@supabase/supabase-js";
import { chunk, fetchAll } from "@/lib/batch";
import {
  campEducatorFor,
  campRegisterPeople,
  parseCampPersonKey,
  type CampMark,
  type CampPerson,
  type CampRegisterSchool,
} from "@/lib/camp-attendance";
import type { Marker } from "@/lib/attendance-data";
import type { AttendanceStatus, CampConfirmation, CampSettings } from "@/supabase/types";

// Takes the client rather than building one: the staff pages have no auth user
// and pass the service role; the admin pages pass the admin's own session.

export type OpenCamp = Pick<CampSettings, "edition_year" | "title" | "arrival_at" | "departure_at">;

/** The camp taking attendance, or null — the off switch for camp staff. */
export async function openCampAttendance(supabase: SupabaseClient): Promise<OpenCamp | null> {
  const { data, error } = await supabase
    .from("camp_settings")
    .select("edition_year, title, arrival_at, departure_at")
    .eq("attendance_open", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OpenCamp | null) ?? null;
}

type ConfirmationRow = Pick<
  CampConfirmation,
  "registration_id" | "school_id" | "educators" | "extra_educator" | "extra_status"
> & { schools: { name: string | null } | null };

const CONFIRMATION_COLUMNS =
  "registration_id, school_id, educators, extra_educator, extra_status, schools(name)";

function toSchool(
  c: ConfirmationRow,
  students: CampRegisterSchool["students"],
): CampRegisterSchool {
  return {
    registrationId: c.registration_id,
    schoolName: c.schools?.name ?? "Unnamed school",
    educators: c.educators,
    extra: c.extra_educator ? { name: c.extra_educator.name, status: c.extra_status } : null,
    students,
  };
}

/** Everyone expected at camp: each attending school's educators and its active contestants. */
export async function loadCampPeople(
  supabase: SupabaseClient,
  year: number,
): Promise<{ settings: CampSettings | null; people: CampPerson[]; error: string | null }> {
  const [settingsRes, confRes] = await Promise.all([
    supabase.from("camp_settings").select("*").eq("edition_year", year).maybeSingle(),
    supabase
      .from("camp_confirmations")
      .select(CONFIRMATION_COLUMNS)
      .eq("edition_year", year)
      .eq("status", "attending"),
  ]);
  const error = settingsRes.error ?? confRes.error;
  if (error) return { settings: null, people: [], error: error.message };
  const confirmations = (confRes.data ?? []) as unknown as ConfirmationRow[];

  const schoolIds = [...new Set(confirmations.map((c) => c.school_id))];
  const studentPages = await Promise.all(
    chunk(schoolIds, 100).map((ids) =>
      supabase
        .from("students")
        .select("id, school_id, name, level")
        .in("school_id", ids)
        .eq("edition_year", year)
        .is("deactivated_at", null),
    ),
  );
  const studentError = studentPages.find((p) => p.error)?.error;
  if (studentError) return { settings: null, people: [], error: studentError.message };
  const students = studentPages.flatMap(
    (p) => (p.data ?? []) as { id: string; school_id: string; name: string; level: string | null }[],
  );

  return {
    settings: (settingsRes.data as CampSettings | null) ?? null,
    people: campRegisterPeople(
      confirmations.map((c) => toSchool(c, students.filter((s) => s.school_id === c.school_id))),
    ),
    error: null,
  };
}

export async function loadCampMarks(
  supabase: SupabaseClient,
  year: number,
  day?: string,
): Promise<(CampMark & { camp_day: string })[]> {
  return fetchAll<CampMark & { camp_day: string }>((from, to) => {
    let q = supabase
      .from("camp_attendance")
      .select("person_key, status, marked_at, camp_day")
      .eq("edition_year", year);
    if (day) q = q.eq("camp_day", day);
    return q.order("id").range(from, to);
  });
}

/**
 * The one person a posted key names, if they are expected at camp this edition.
 * A targeted read, because this runs on every tap.
 */
export async function resolveCampPerson(
  supabase: SupabaseClient,
  year: number,
  key: string,
): Promise<CampPerson | null> {
  const parsed = parseCampPersonKey(key);
  if (!parsed) return null;

  if (parsed.kind === "educator") {
    const { data, error } = await supabase
      .from("camp_confirmations")
      .select(CONFIRMATION_COLUMNS)
      .eq("registration_id", parsed.registrationId)
      .eq("edition_year", year)
      .eq("status", "attending")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const school = toSchool(data as unknown as ConfirmationRow, []);
    const educator = campEducatorFor(school, parsed.slot);
    if (!educator) return null;
    return {
      key,
      role: parsed.slot === "primary" ? "educator" : "second_educator",
      registrationId: school.registrationId,
      studentId: null,
      name: educator.name,
      schoolName: school.schoolName,
      detail: educator.detail,
    };
  }

  const { data: student, error } = await supabase
    .from("students")
    .select("id, school_id, name, level")
    .eq("id", parsed.studentId)
    .eq("edition_year", year)
    .is("deactivated_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!student?.school_id) return null;

  const { data: conf, error: confError } = await supabase
    .from("camp_confirmations")
    .select("registration_id, schools(name)")
    .eq("school_id", student.school_id)
    .eq("edition_year", year)
    .eq("status", "attending")
    .limit(1)
    .maybeSingle();
  if (confError) throw new Error(confError.message);
  if (!conf) return null;
  const row = conf as unknown as { registration_id: string; schools: { name: string | null } | null };
  return {
    key,
    role: "student",
    registrationId: row.registration_id,
    studentId: student.id,
    name: student.name,
    schoolName: row.schools?.name ?? "Unnamed school",
    detail: student.level ?? "",
  };
}

/** Upserts the standing mark and appends to the history, in batches. */
export async function markCamp(
  supabase: SupabaseClient,
  input: {
    year: number;
    day: string;
    people: CampPerson[];
    status: AttendanceStatus;
    by: Marker;
  },
): Promise<number> {
  const markedAt = new Date().toISOString();
  const marker = {
    marked_by_lead: "leadId" in input.by ? input.by.leadId : null,
    marked_by_profile: "profileId" in input.by ? input.by.profileId : null,
  };
  // ON CONFLICT cannot touch the same row twice in one statement.
  const people = [...new Map(input.people.map((p) => [p.key, p])).values()];

  for (const batch of chunk(people, 100)) {
    const rows = batch.map((p) => ({
      edition_year: input.year,
      camp_day: input.day,
      person_key: p.key,
      registration_id: p.registrationId,
      student_id: p.studentId,
      person_name: p.name,
      status: input.status,
      ...marker,
    }));
    const { error } = await supabase
      .from("camp_attendance")
      .upsert(rows.map((r) => ({ ...r, marked_at: markedAt })), {
        onConflict: "edition_year,camp_day,person_key",
      });
    if (error) throw new Error(error.message);

    // The register is what the camp depends on, not its history, so a failed
    // append is reported rather than rolling the mark back.
    const { error: eventError } = await supabase.from("camp_attendance_events").insert(rows);
    if (eventError) console.error("camp attendance events not recorded", eventError.message);
  }
  return people.length;
}
