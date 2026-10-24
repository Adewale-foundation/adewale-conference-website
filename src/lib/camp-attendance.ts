// The daily camp register: who is expected at camp, and who was marked there.
// Marked by the admin team in the portal; the camp is one venue, so unlike the
// zonal register there are no allocations and no walk-ins.
import { CAMP_EXTRA_STATUS_LABEL, primaryEducator, type CampEducator, type CampExtraStatus } from "./camp";
import type { RosterEntry, RosterState } from "./attendance";
import type { AttendanceStatus } from "@/supabase/types";

export type CampEducatorSlot = "primary" | "second";

export type CampPersonKey =
  | { kind: "student"; studentId: string }
  | { kind: "educator"; registrationId: string; slot: CampEducatorSlot };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STUDENT_KEY = new RegExp(`^student:(${UUID})$`);
const EDUCATOR_KEY = new RegExp(`^educator:(${UUID}):(primary|second)$`);

// Educators live only in camp_confirmations JSON, so a person is a key, not an
// FK. Mirrors the person_key check on camp_attendance.
export const campStudentKey = (studentId: string) => `student:${studentId}`;
export const campEducatorKey = (registrationId: string, slot: CampEducatorSlot) =>
  `educator:${registrationId}:${slot}`;

export function parseCampPersonKey(key: string): CampPersonKey | null {
  const s = STUDENT_KEY.exec(key);
  if (s) return { kind: "student", studentId: s[1] };
  const e = EDUCATOR_KEY.exec(key);
  if (e) return { kind: "educator", registrationId: e[1], slot: e[2] as CampEducatorSlot };
  return null;
}

/** "YYYY-MM-DD" in camp-local time, whatever the server's zone. */
export function lagosDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(at);
}

// A typo'd departure year must not render a register with a thousand days.
const MAX_CAMP_DAYS = 14;

/** Every calendar day of camp, arrival to departure inclusive. */
export function campDays(arrivalAt: string | null | undefined, departureAt: string | null | undefined): string[] {
  if (!arrivalAt) return [];
  const first = lagosDay(new Date(arrivalAt));
  const last = departureAt ? lagosDay(new Date(departureAt)) : first;
  const days: string[] = [];
  for (let d = new Date(`${first}T00:00:00Z`); days.length < MAX_CAMP_DAYS; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    if (day > last) break;
    days.push(day);
  }
  return days;
}

/** Today if camp is running, else the nearest camp day, so the register can be opened the evening before. */
export function campDayFor(days: string[], now: Date = new Date()): string | null {
  if (days.length === 0) return null;
  const today = lagosDay(now);
  if (today < days[0]) return days[0];
  if (today > days[days.length - 1]) return days[days.length - 1];
  return today;
}

/** "Day 2 · Tue 27 Oct". */
export function formatCampDay(day: string, days: string[]): string {
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${day}T00:00:00Z`));
  const n = days.indexOf(day);
  return n < 0 ? label : `Day ${n + 1} · ${label}`;
}

export type CampPersonRole = "student" | "educator" | "second_educator";

export type CampPerson = {
  key: string;
  role: CampPersonRole;
  registrationId: string;
  studentId: string | null;
  name: string;
  schoolName: string;
  /** Class for a student; what kind of adult for an educator. */
  detail: string;
};

export type CampRegisterSchool = {
  registrationId: string;
  schoolName: string;
  educators: CampEducator[] | null;
  extra: { name: string; status: CampExtraStatus | null } | null;
  students: { id: string; name: string; level: string | null }[];
};

/** The one educator going, or the second educator unless an admin declined them. */
export function campEducatorFor(
  school: Pick<CampRegisterSchool, "educators" | "extra">,
  slot: CampEducatorSlot,
): { name: string; detail: string } | null {
  if (slot === "primary") {
    const primary = primaryEducator(school.educators);
    return primary ? { name: primary.name, detail: "Educator" } : null;
  }
  const extra = school.extra;
  if (!extra?.name || extra.status === "declined") return null;
  return {
    name: extra.name,
    detail: extra.status === "approved" || !extra.status
      ? "Second educator"
      : `Second educator · ${CAMP_EXTRA_STATUS_LABEL[extra.status].toLowerCase()}`,
  };
}

/** Everyone expected at camp, by school, the educators ahead of their students. */
export function campRegisterPeople(schools: CampRegisterSchool[]): CampPerson[] {
  const out: CampPerson[] = [];
  const sorted = [...schools].sort((a, b) => a.schoolName.localeCompare(b.schoolName));
  for (const s of sorted) {
    for (const slot of ["primary", "second"] as const) {
      const educator = campEducatorFor(s, slot);
      if (!educator) continue;
      out.push({
        key: campEducatorKey(s.registrationId, slot),
        role: slot === "primary" ? "educator" : "second_educator",
        registrationId: s.registrationId,
        studentId: null,
        name: educator.name,
        schoolName: s.schoolName,
        detail: educator.detail,
      });
    }
    for (const st of [...s.students].sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({
        key: campStudentKey(st.id),
        role: "student",
        registrationId: s.registrationId,
        studentId: st.id,
        name: st.name,
        schoolName: s.schoolName,
        detail: st.level ?? "",
      });
    }
  }
  return out;
}

export type CampMark = { person_key: string; status: AttendanceStatus; marked_at: string };

export type CampRegisterEntry = CampPerson & { state: RosterState; markedAt: string | null };

export function campRegister(people: CampPerson[], marks: CampMark[]): CampRegisterEntry[] {
  const byKey = new Map(marks.map((m) => [m.person_key, m]));
  return people.map((p) => {
    const mark = byKey.get(p.key);
    return { ...p, state: mark?.status ?? "unmarked", markedAt: mark?.marked_at ?? null };
  });
}

/**
 * As the shared register component takes them. It is keyed on studentId, which
 * here carries the person key, since educators have no student row; and there is
 * no candidate number, so the row shows none.
 */
export function campRegisterEntries(
  register: CampRegisterEntry[],
): (RosterEntry & { centreId: string | null })[] {
  return register.map((p) => ({
    studentId: p.key,
    examNo: "",
    name: p.name,
    schoolId: p.registrationId,
    schoolName: p.schoolName,
    level: p.detail || null,
    state: p.state,
    markedAt: p.markedAt,
    markedAtCentreId: null,
    centreId: null,
  }));
}

/** One row per person, one column per camp day — the sheet an admin hands on. */
export function campAttendanceMatrix(
  people: CampPerson[],
  days: string[],
  marks: (CampMark & { camp_day: string })[],
): string[][] {
  const status = new Map(marks.map((m) => [`${m.camp_day}|${m.person_key}`, m.status]));
  const label = (s: AttendanceStatus | undefined) =>
    s === "present" ? "Present" : s === "absent" ? "Absent" : "Not marked";
  return [
    ["School", "Name", "Type", "Class / role", ...days.map((d) => formatCampDay(d, days))],
    ...people.map((p) => [
      p.schoolName,
      p.name,
      p.role === "student" ? "Student" : "Educator",
      p.detail,
      ...days.map((d) => label(status.get(`${d}|${p.key}`))),
    ]),
  ];
}

export type SchoolGroup<T> = { registrationId: string; schoolName: string; rows: T[] };

/** Consecutive rows of one school under one heading, in the order given. */
export function groupBySchool<T extends { registrationId: string; schoolName: string }>(
  rows: T[],
): SchoolGroup<T>[] {
  const groups = new Map<string, SchoolGroup<T>>();
  for (const row of rows) {
    const group = groups.get(row.registrationId);
    if (group) group.rows.push(row);
    else groups.set(row.registrationId, { registrationId: row.registrationId, schoolName: row.schoolName, rows: [row] });
  }
  return [...groups.values()];
}
