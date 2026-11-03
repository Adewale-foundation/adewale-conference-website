import { cleanText, normalizeNgPhone } from "@/lib/finale";
import { LGA_OPTIONS } from "@/lib/forms";
import type {
  FinaleAttendee,
  FinaleAttendeeRole,
  FinaleAttendeeSource,
  FinaleAttendeeStatus,
  FinaleAttendeeStudent,
  FinaleSettings,
} from "@/supabase/types";

export const ATTEND_BASE = "/grand-finale";

/** The one place the event's facts live: the page, the emails and the home notice read these. */
export const GRAND_FINALE = {
  theme: "The Gateway Generation",
  subtheme: "Engineering the Future of Ogun State",
  startsAt: "2026-11-19T10:00:00+01:00",
  endsAt: "2026-11-19T15:00:00+01:00",
  dateLabel: "Thursday 19 November 2026",
  shortDate: "Thu 19 Nov",
  timeLabel: "10am – 3pm",
  venue: "June 12 Cultural Centre",
  venueArea: "Kuto, Abeokuta",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=June+12+Cultural+Centre+Kuto+Abeokuta",
} as const;

export const ATTENDEE_ROLES: { key: FinaleAttendeeRole; label: string }[] = [
  { key: "teacher", label: "Teacher" },
  { key: "proprietor", label: "Proprietor" },
  { key: "student", label: "Student" },
  { key: "undergraduate", label: "Undergraduate" },
  { key: "parent", label: "Parent" },
  { key: "other", label: "Other" },
];

export const SOURCE_LABELS: Record<FinaleAttendeeSource, string> = {
  open: "Open registration",
  invited: "Invited",
  school: "School group",
};

export const STATUS_LABELS: Record<FinaleAttendeeStatus, string> = {
  confirmed: "Confirmed",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
};

export const ATTEND_LGA_OPTIONS = [...LGA_OPTIONS, "Outside Ogun State"] as const;
export const STUDENT_CLASS_OPTIONS = ["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"] as const;
export const MAX_STUDENTS = 200;

/** Only an educator brings a group; everyone else holds a single seat. */
export function bringsStudents(role: FinaleAttendeeRole): boolean {
  return role === "teacher" || role === "proprietor";
}

export function organisationLabel(role: FinaleAttendeeRole): string {
  if (role === "undergraduate") return "University or polytechnic";
  if (role === "parent" || role === "other") return "Organisation";
  return "School";
}

// ── Seats ───────────────────────────────────────────────────────────────────

/** Mirrors finale_attend_register() in SQL: a group that does not fit waits as a whole. */
export function seatDecision(
  capacity: number | null,
  taken: number,
  requested: number,
  force = false,
): Extract<FinaleAttendeeStatus, "confirmed" | "waitlisted"> {
  return force || capacity == null || taken + requested <= capacity ? "confirmed" : "waitlisted";
}

export type AttendState = "closed" | "open" | "waitlist" | "over";

export function attendState(
  settings: Pick<FinaleSettings, "attend_open" | "attend_capacity"> | null,
  taken: number,
  now: Date = new Date(),
): AttendState {
  if (now >= new Date(GRAND_FINALE.endsAt)) return "over";
  if (!settings?.attend_open) return "closed";
  if (settings.attend_capacity != null && taken >= settings.attend_capacity) return "waitlist";
  return "open";
}

export function seatsLeft(capacity: number | null, taken: number): number | null {
  return capacity == null ? null : Math.max(0, capacity - taken);
}

// ── Ref codes ───────────────────────────────────────────────────────────────

/** Same alphabet as the SQL generator: no 0/O or 1/I to misread at the door. */
export const REF_CODE = /^GF-[A-HJ-NP-Z2-9]{6}$/;

/** Accepts what people type at the door: lower case, spaces, a missing prefix. */
export function normalizeRefCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const compact = raw.toUpperCase().replace(/[\s-]/g, "");
  const code = `GF-${compact.startsWith("GF") ? compact.slice(2) : compact}`;
  return REF_CODE.test(code) ? code : null;
}

export function ticketPath(refCode: string): string {
  return `${ATTEND_BASE}/ticket/${refCode}`;
}

// ── Validation ──────────────────────────────────────────────────────────────

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type AttendeeInput = {
  firstName: unknown;
  lastName: unknown;
  email: unknown;
  phone: unknown;
  role: unknown;
  organisation: unknown;
  lga: unknown;
  studentCount: unknown;
  studentNames: unknown[];
  studentClasses: unknown[];
};

export type AttendeeValue = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: FinaleAttendeeRole;
  organisation: string | null;
  lga: string | null;
  studentCount: number;
  students: { name: string; class: string }[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateAttendee(input: AttendeeInput, opts: { requirePhone: boolean }): Result<AttendeeValue> {
  const firstName = cleanText(input.firstName);
  const lastName = cleanText(input.lastName);
  if (!firstName || !lastName) return { ok: false, error: "Enter your first and last name." };
  if (firstName.length > 60 || lastName.length > 60) return { ok: false, error: "Keep each name to 60 characters." };

  const email = cleanText(input.email).toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, error: "Enter an email address we can send the ticket to." };

  const rawPhone = cleanText(input.phone);
  const phone = rawPhone ? normalizeNgPhone(rawPhone) : null;
  if (rawPhone && !phone) return { ok: false, error: "Enter a Nigerian mobile number, like 0803 123 4567." };
  if (!phone && opts.requirePhone) return { ok: false, error: "Enter a phone number we can reach you on." };

  const role = ATTENDEE_ROLES.find((r) => r.key === input.role)?.key;
  if (!role) return { ok: false, error: "Choose whether you are a teacher, proprietor, student, undergraduate, parent or other." };

  const organisation = cleanText(input.organisation);
  if (organisation.length > 120) return { ok: false, error: "Keep the school or organisation name to 120 characters." };
  if (!organisation && role !== "parent" && role !== "other") {
    return { ok: false, error: `Enter your ${organisationLabel(role).toLowerCase()}.` };
  }

  const lga = cleanText(input.lga);
  if (lga && !(ATTEND_LGA_OPTIONS as readonly string[]).includes(lga)) return { ok: false, error: "Choose your LGA from the list." };

  let studentCount = 0;
  let students: { name: string; class: string }[] = [];
  if (bringsStudents(role)) {
    const raw = cleanText(input.studentCount);
    studentCount = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(studentCount) || studentCount < 0 || studentCount > MAX_STUDENTS) {
      return { ok: false, error: `Enter how many students you are bringing, from 0 to ${MAX_STUDENTS}.` };
    }
    students = input.studentNames
      .map((n, i) => ({ name: cleanText(n), class: cleanText(input.studentClasses[i]) }))
      .filter((s) => s.name);
    if (students.some((s) => s.name.length > 80)) return { ok: false, error: "Keep each student's name to 80 characters." };
    if (students.some((s) => s.class && !(STUDENT_CLASS_OPTIONS as readonly string[]).includes(s.class))) {
      return { ok: false, error: "Choose each student's class from the list." };
    }
    if (students.length > studentCount) {
      return { ok: false, error: `You named ${students.length} students but said you are bringing ${studentCount}. Raise the number or remove a name.` };
    }
  }

  return {
    ok: true,
    value: { firstName, lastName, email, phone, role, organisation: organisation || null, lga: lga || null, studentCount, students },
  };
}

// ── School invitations ─────────────────────────────────────────────────────

export const SCHOOL_FINALE_PATH = "/portal/school/finale";
export const MAX_GROUP_EDUCATORS = 20;

export type SchoolInviteState = "open" | "past-deadline" | "over";

/** Every school this edition is invited; the announcement only tells them so. */
export function schoolInviteState(
  settings: Pick<FinaleSettings, "school_respond_by"> | null,
  now: Date = new Date(),
): SchoolInviteState {
  if (now >= new Date(GRAND_FINALE.endsAt)) return "over";
  if (settings?.school_respond_by && now > new Date(settings.school_respond_by)) return "past-deadline";
  return "open";
}

/** Mirrors finale_school_respond(): a confirmed school that outgrows the reserve is refused, not demoted. */
export function schoolSeatDecision(
  capacity: number | null,
  takenByOthers: number,
  requested: number,
  currentStatus: FinaleAttendeeStatus | null,
): "confirmed" | "waitlisted" | "refused" {
  if (capacity == null || takenByOthers + requested <= capacity) return "confirmed";
  return currentStatus === "confirmed" ? "refused" : "waitlisted";
}

export type OnRecordEducator = { key: string; name: string; phone: string | null; email: string | null };
export type RegisteredStudent = { id: string; name: string; level: string | null };

export type SchoolResponseInput = {
  attending: unknown;
  goingKeys: unknown[];
  phones: Record<string, unknown>;
  otherNames: unknown[];
  otherPhones: unknown[];
  studentIds: unknown[];
  extraNames: unknown[];
  extraClasses: unknown[];
  studentCount: unknown;
};

export type SchoolResponseValue =
  | { attending: false }
  | {
      attending: true;
      educators: { name: string; phone: string | null; email: string | null }[];
      students: { name: string; class: string; studentId: string | null }[];
      studentCount: number;
    };

/** Who is on record and which students are registered come from the database, so a tampered form can't invent them. */
export function validateSchoolResponse(
  input: SchoolResponseInput,
  record: { educators: OnRecordEducator[]; students: RegisteredStudent[] },
): Result<SchoolResponseValue> {
  if (input.attending === "no") return { ok: true, value: { attending: false } };
  if (input.attending !== "yes") return { ok: false, error: "Say whether your school is coming." };

  const educators: { name: string; phone: string | null; email: string | null }[] = [];
  const going = new Set(input.goingKeys.map((k) => String(k)));
  for (const e of record.educators) {
    if (!going.has(e.key)) continue;
    const raw = cleanText(input.phones[e.key]);
    const phone = raw ? normalizeNgPhone(raw) : e.phone ? normalizeNgPhone(e.phone) : null;
    if (raw && !phone) return { ok: false, error: `Check ${e.name}'s phone number: use a Nigerian mobile number.` };
    educators.push({ name: e.name, phone, email: e.email });
  }
  for (const [i, n] of input.otherNames.entries()) {
    const name = cleanText(n);
    if (!name) continue;
    if (name.length > 80) return { ok: false, error: "Keep each educator's name to 80 characters." };
    const raw = cleanText(input.otherPhones[i]);
    const phone = raw ? normalizeNgPhone(raw) : null;
    if (raw && !phone) return { ok: false, error: `Check ${name}'s phone number: use a Nigerian mobile number.` };
    educators.push({ name, phone, email: null });
  }
  if (!educators.length) return { ok: false, error: "Choose at least one educator who will come with the students." };
  if (educators.length > MAX_GROUP_EDUCATORS) return { ok: false, error: `Bring at most ${MAX_GROUP_EDUCATORS} educators.` };

  const byId = new Map(record.students.map((s) => [s.id, s]));
  const ticked = [...new Set(input.studentIds.map((id) => String(id)))].map((id) => byId.get(id));
  if (ticked.some((s) => !s)) return { ok: false, error: "One of the ticked students is no longer registered. Refresh the page." };
  const students: { name: string; class: string; studentId: string | null }[] = (ticked as RegisteredStudent[]).map((s) => ({
    name: s.name,
    class: s.level ?? "",
    studentId: s.id,
  }));
  for (const [i, n] of input.extraNames.entries()) {
    const name = cleanText(n);
    if (!name) continue;
    if (name.length > 80) return { ok: false, error: "Keep each student's name to 80 characters." };
    const cls = cleanText(input.extraClasses[i]);
    if (cls && !(STUDENT_CLASS_OPTIONS as readonly string[]).includes(cls)) return { ok: false, error: "Choose each student's class from the list." };
    students.push({ name, class: cls, studentId: null });
  }

  const raw = cleanText(input.studentCount);
  const studentCount = raw === "" ? students.length : Number(raw);
  if (!Number.isInteger(studentCount) || studentCount < 0 || studentCount > MAX_STUDENTS) {
    return { ok: false, error: `Enter how many students are coming, from 0 to ${MAX_STUDENTS}.` };
  }
  if (studentCount < students.length) {
    return { ok: false, error: `You named ${students.length} students but said ${studentCount} are coming. Raise the number or untick a student.` };
  }
  return { ok: true, value: { attending: true, educators, students, studentCount } };
}

// ── Export ──────────────────────────────────────────────────────────────────

const ATTENDEE_HEADERS = [
  "Ref code", "Status", "Source", "First name", "Last name", "Email", "Phone", "Role",
  "School or organisation", "LGA", "Students", "Seats", "Named students", "Checked in", "Registered", "Educators",
];
export const ATTENDEE_PHONE_COLUMNS = new Set([ATTENDEE_HEADERS.indexOf("Phone")]);

export function attendeesCsvMatrix(rows: FinaleAttendee[], students: FinaleAttendeeStudent[]): (string | number)[][] {
  const named = new Map<string, string[]>();
  for (const s of [...students].sort((a, b) => a.sort - b.sort)) {
    const list = named.get(s.attendee_id) ?? [];
    list.push(s.class ? `${s.full_name} (${s.class})` : s.full_name);
    named.set(s.attendee_id, list);
  }
  return [
    ATTENDEE_HEADERS,
    ...rows.map((r) => [
      r.ref_code,
      STATUS_LABELS[r.status],
      SOURCE_LABELS[r.source],
      r.first_name,
      r.last_name,
      r.email,
      r.phone ?? "",
      ATTENDEE_ROLES.find((x) => x.key === r.role)?.label ?? r.role,
      r.organisation ?? "",
      r.lga ?? "",
      r.student_count,
      r.seats,
      (named.get(r.id) ?? []).join("; "),
      r.checked_in_at ?? "",
      r.created_at,
      (r.educators ?? []).map((e) => (e.phone ? `${e.name} (${e.phone})` : e.name)).join("; "),
    ]),
  ];
}
