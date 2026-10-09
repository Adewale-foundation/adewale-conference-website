// ASC Camp: who is invited, whether they can still answer, and the roster
// admins work from. The window and validation rules are also enforced by
// submit_camp_response() in SQL — keep the two in step.
import { tierRank } from "./resource-access";
import { ageFromDob } from "./age";
import { personNameKey } from "./person-identity";
import type { CampConfirmation, CampSettings, CampStatus } from "@/supabase/types";

export const CAMP_STATUS_LABEL: Record<CampStatus | "no_response", string> = {
  pending: "No response",
  no_response: "No response",
  attending: "Attending",
  not_attending: "Not attending",
  released: "Released",
};

/** "Mon 26 Oct 2026, 2:00 pm" in camp-local time, whatever the server's zone. */
export function formatCampDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
  }).format(new Date(iso));
}

// Lagos is UTC+1 with no DST, so a datetime-local value converts exactly.
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** "2026-10-07T23:59" typed by an admin, read as Lagos time → ISO. Invalid → null. */
export function lagosInputToIso(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** timestamptz → "YYYY-MM-DDTHH:MM" in Lagos time, for a datetime-local input. */
export function isoToLagosInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + LAGOS_OFFSET_MS);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

/** Invited to camp: qualified for the Grand Finale, or added by an admin. Mirrors camp_eligible() in SQL. */
export function isCampEligible(
  status: string | null | undefined,
  stageResults?: { stage: string; outcome: string | null }[] | null,
  invitedManually = false,
): boolean {
  return invitedManually || tierRank(status, stageResults) >= 2;
}

/** Why a school is on the camp roster. "not_qualified" = it answered, then lost its qualification. */
export type CampInviteSource = "qualified" | "manual" | "not_qualified";

export const CAMP_INVITE_LABEL: Record<CampInviteSource, string> = {
  qualified: "Qualified",
  manual: "Added by admin",
  not_qualified: "No longer qualified",
};

type WindowSettings = Pick<CampSettings, "is_open" | "confirm_deadline">;
type WindowConfirmation = Pick<CampConfirmation, "status" | "respond_by">;

export type CampWindow = {
  open: boolean;
  deadline: string | null;
  /** Why the school can't answer; null while open. */
  reason: "closed" | "past_deadline" | "released" | null;
};

/** A per-school respond_by (a replacement's extension) overrides the edition deadline. */
export function campWindow(
  settings: WindowSettings,
  confirmation: WindowConfirmation | null | undefined,
  now: Date = new Date(),
): CampWindow {
  const deadline = confirmation?.respond_by ?? settings.confirm_deadline ?? null;
  const reason =
    confirmation?.status === "released"
      ? "released"
      : !settings.is_open
        ? "closed"
        : deadline && now.getTime() > new Date(deadline).getTime()
          ? "past_deadline"
          : null;
  return { open: reason === null, deadline, reason };
}

export type CampEducatorRole = "teacher" | "principal" | "educator" | "extra";

/** One adult on the school's camp response. Record entries are kept even when not going. */
export type CampEducator = {
  name: string;
  phone: string | null;
  email: string | null;
  role: CampEducatorRole;
  going: boolean;
};

export const CAMP_EDUCATOR_ROLE_LABEL: Record<CampEducatorRole, string> = {
  teacher: "Teacher",
  principal: "Principal",
  educator: "Educator",
  extra: "Not on our records",
};

export type CampExtraStatus = "pending" | "approved" | "declined";

export const CAMP_EXTRA_STATUS_LABEL: Record<CampExtraStatus, string> = {
  pending: "Awaiting approval",
  approved: "Approved",
  declined: "Declined",
};

/** Choosing someone not on record as the one educator, in place of an on-record key. */
export const OTHER_EDUCATOR = "other";

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "rev", "chief", "engr", "pastor"]);

/**
 * A person's name compared as a set of words, without titles or punctuation:
 * the entry form and a portal account often write the same teacher as
 * "Nkem Obi Obi" and "MR. NKEM OBI", or with first and last names swapped.
 */
export function nameKey(name: string): string {
  const words = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !TITLES.has(w));
  return [...new Set(words)].sort().join(" ");
}

/**
 * The school's educators on record: the teacher and principal from the entry
 * form (the only source with phones), then any other approved portal member.
 * Deduped by email or by nameKey, so a teacher who is also a member appears once.
 */
export function educatorsOnRecord(
  details: Record<string, unknown> | null | undefined,
  members: { full_name: string | null; email: string | null }[],
): CampEducator[] {
  const out: CampEducator[] = [];
  const seen = new Set<string>();
  const add = (name: string, phone: string, email: string, role: CampEducatorRole) => {
    const byEmail = email ? `email:${email.toLowerCase()}` : "";
    const byName = `name:${nameKey(name)}`;
    if (!name || seen.has(byName) || (byEmail && seen.has(byEmail))) return;
    seen.add(byName);
    if (byEmail) seen.add(byEmail);
    out.push({ name, phone: phone || null, email: email || null, role, going: false });
  };
  add(clean(details?.["Teacher Full Name"]), clean(details?.["Teacher Number"]), clean(details?.["Teacher Email Address"]), "teacher");
  add(clean(details?.["Principal Full Name"]), clean(details?.["Principal Number"]), clean(details?.["Principal Email Address"]), "principal");
  for (const m of members) add(clean(m.full_name) || clean(m.email), "", clean(m.email), "educator");
  return out;
}

/** Stable identity for an educator across renders and the form round trip. */
export function educatorKey(e: Pick<CampEducator, "name" | "email">): string {
  return e.email?.toLowerCase() || `name:${nameKey(e.name)}`;
}

/**
 * Record list with the school's saved choice laid over it. A saved primary who
 * isn't on record comes back as `other`.
 */
export function mergeSavedEducators(record: CampEducator[], saved: CampEducator[] | null | undefined) {
  const savedByKey = new Map((saved ?? []).filter((e) => e.role !== "extra").map((e) => [educatorKey(e), e]));
  return {
    record: record.map((e) => {
      const prev = savedByKey.get(educatorKey(e));
      return prev ? { ...e, going: prev.going, phone: prev.phone ?? e.phone } : e;
    }),
    other: (saved ?? []).find((e) => e.role === "extra" && e.going) ?? null,
  };
}

export type CampResponseInput = {
  status: string;
  /** Educators on record, with any phone the school corrected. */
  educators: CampEducator[];
  /** educatorKey of the one educator going, or OTHER_EDUCATOR. */
  primary: string;
  other: { name: string; phone: string };
  /** A second educator, asked for with a reason; null when not requested. */
  extra: { name: string; phone: string; reason: string } | null;
  repsConfirmed: boolean;
  termsAccepted: boolean;
  notes: string;
  declineReason: string;
};

export type CampResponse = {
  status: "attending" | "not_attending";
  /** Every educator on record, exactly one going (or none going plus an "other" who is). */
  educators: CampEducator[];
  extra: CampEducator | null;
  extraReason: string | null;
  repsConfirmed: boolean;
  notes: string | null;
  declineReason: string | null;
};

const PHONE = /^\+?[\d\s()-]{7,20}$/;
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Same person, by name (see nameKey) or by phone. Mirrored in submit_camp_response(). */
export function samePerson(
  a: { name: string; phone: string | null },
  b: { name: string; phone: string | null },
): boolean {
  return nameKey(a.name) === nameKey(b.name) || (!!digits(a.phone) && digits(a.phone) === digits(b.phone));
}

export function validateCampResponse(
  input: CampResponseInput,
): { ok: true; value: CampResponse } | { ok: false; error: string } {
  const notes = input.notes.trim() || null;
  if (input.status === "not_attending") {
    const declineReason = input.declineReason.trim();
    if (!declineReason) return { ok: false, error: "Tell us why your school cannot attend." };
    return {
      ok: true,
      value: {
        status: "not_attending",
        educators: [],
        extra: null,
        extraReason: null,
        repsConfirmed: false,
        notes,
        declineReason,
      },
    };
  }
  if (input.status !== "attending") return { ok: false, error: "Choose whether your school is attending." };

  const record = input.educators.map((e) => ({
    ...e,
    name: e.name.trim(),
    phone: e.phone?.trim() || null,
    going: false,
  }));
  let primary: CampEducator;
  if (input.primary === OTHER_EDUCATOR) {
    const name = input.other.name.trim();
    const phone = input.other.phone.trim();
    if (!name) return { ok: false, error: "Enter the name of the educator who will accompany your students." };
    if (!PHONE.test(phone)) return { ok: false, error: `Enter a valid phone number for ${name}.` };
    primary = { name, phone, email: null, role: "extra", going: true };
  } else {
    const chosen = record.find((e) => educatorKey(e) === input.primary);
    if (!chosen) return { ok: false, error: "Choose the one educator who will accompany your students." };
    if (!chosen.phone || !PHONE.test(chosen.phone)) {
      return { ok: false, error: `Enter a valid phone number for ${chosen.name}.` };
    }
    chosen.going = true;
    primary = chosen;
  }

  let extra: CampEducator | null = null;
  let extraReason: string | null = null;
  if (input.extra) {
    const name = input.extra.name.trim();
    const phone = input.extra.phone.trim();
    extraReason = input.extra.reason.trim();
    if (!name || !PHONE.test(phone)) {
      return { ok: false, error: "Enter a name and a valid phone number for the second educator." };
    }
    if (!extraReason) return { ok: false, error: "Tell us why you need a second educator." };
    extra = { name, phone, email: null, role: "extra", going: false };
    if (samePerson(extra, primary)) return { ok: false, error: "The second educator must be a different person." };
  }

  if (!input.repsConfirmed) {
    return { ok: false, error: "Confirm that your three registered contestants will attend." };
  }
  if (!input.termsAccepted) return { ok: false, error: "Accept the camp terms to secure your place." };

  return {
    ok: true,
    value: {
      status: "attending",
      educators: primary.role === "extra" ? [...record, primary] : record,
      extra,
      extraReason,
      repsConfirmed: true,
      notes,
      declineReason: null,
    },
  };
}

/** The one educator confirmed to go. */
export function primaryEducator(educators: CampEducator[] | null | undefined): CampEducator | null {
  return (educators ?? []).find((e) => e.going) ?? null;
}

/** "Mrs Ada Nwosu (0803…)" for the educator going. */
export function goingSummary(educators: CampEducator[] | null | undefined): string {
  return (educators ?? [])
    .filter((e) => e.going)
    .map((e) => (e.phone ? `${e.name} (${e.phone})` : e.name))
    .join("; ");
}

export type CampRosterStatus = Exclude<CampStatus, "pending"> | "no_response";

export type CampRosterRow = {
  registrationId: string;
  schoolName: string;
  lga: string | null;
  status: CampRosterStatus;
  source: CampInviteSource;
  educators: CampEducator[];
  extra: {
    name: string;
    phone: string | null;
    reason: string | null;
    status: CampExtraStatus;
    adminNote: string | null;
  } | null;
  repsConfirmed: boolean;
  notes: string | null;
  declineReason: string | null;
  respondBy: string | null;
  respondedAt: string | null;
  adminNote: string | null;
};

type RosterRegistration = {
  id: string;
  status: string | null;
  schoolName: string;
  lga: string | null;
  stageResults: { stage: string; outcome: string | null }[];
};

/**
 * One row per invited school, plus any school that still has an answer on file
 * after losing eligibility (an admin may have reversed its qualification).
 */
export function campRosterRows(
  registrations: RosterRegistration[],
  confirmations: CampConfirmation[],
): CampRosterRow[] {
  const byReg = new Map(confirmations.map((c) => [c.registration_id, c]));
  return registrations
    .filter((r) => isCampEligible(r.status, r.stageResults) || byReg.has(r.id))
    .map((r) => {
      const c = byReg.get(r.id);
      const source: CampInviteSource = isCampEligible(r.status, r.stageResults)
        ? "qualified"
        : c?.invited_manually
          ? "manual"
          : "not_qualified";
      return {
        registrationId: r.id,
        schoolName: r.schoolName,
        lga: r.lga,
        status: !c || c.status === "pending" ? "no_response" : c.status,
        source,
        educators: c?.educators ?? [],
        extra:
          c?.extra_educator && c.extra_status
            ? {
                name: c.extra_educator.name,
                phone: c.extra_educator.phone,
                reason: c.extra_reason,
                status: c.extra_status,
                adminNote: c.extra_admin_note,
              }
            : null,
        repsConfirmed: c?.reps_confirmed ?? false,
        notes: c?.notes ?? null,
        declineReason: c?.decline_reason ?? null,
        respondBy: c?.respond_by ?? null,
        respondedAt: c?.responded_at ?? null,
        adminNote: c?.admin_note ?? null,
      } satisfies CampRosterRow;
    })
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName));
}

export function campCounts(
  rows: CampRosterRow[],
): Record<CampRosterStatus | "eligible" | "manual" | "extraPending", number> {
  const counts = {
    eligible: rows.length,
    manual: 0,
    extraPending: 0,
    attending: 0,
    not_attending: 0,
    no_response: 0,
    released: 0,
  };
  for (const r of rows) {
    counts[r.status] += 1;
    if (r.source === "manual") counts.manual += 1;
    if (r.extra?.status === "pending") counts.extraPending += 1;
  }
  return counts;
}

/** Schools in the edition an admin could still add to camp by hand. */
export function campCandidates<T extends { id: string; schoolName: string }>(
  registrations: T[],
  rows: CampRosterRow[],
): T[] {
  const onRoster = new Set(rows.map((r) => r.registrationId));
  return registrations
    .filter((r) => !onRoster.has(r.id))
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName));
}

export function campCsvMatrix(rows: CampRosterRow[]): string[][] {
  return [
    [
      "School", "LGA", "Invited as", "Status", "Educator", "Second educator", "Second educator status",
      "Second educator reason", "Contestants confirmed",
      "Notes", "Reason not attending", "Respond by", "Responded at", "Admin note",
    ],
    ...rows.map((r) => [
      r.schoolName,
      r.lga ?? "",
      CAMP_INVITE_LABEL[r.source],
      CAMP_STATUS_LABEL[r.status],
      goingSummary(r.educators),
      r.extra ? (r.extra.phone ? `${r.extra.name} (${r.extra.phone})` : r.extra.name) : "",
      r.extra ? CAMP_EXTRA_STATUS_LABEL[r.extra.status] : "",
      r.extra?.reason ?? "",
      r.repsConfirmed ? "Yes" : "No",
      r.notes ?? "",
      r.declineReason ?? "",
      r.respondBy ?? "",
      r.respondedAt ?? "",
      r.adminNote ?? "",
    ]),
  ];
}

export type CampAttendingSchool = {
  schoolName: string;
  lga: string | null;
  educators: CampEducator[];
  details: Record<string, string> | null;
  /** The school's active students in the edition — the team the camp emails name. */
  students: { name: string; level: string | null }[];
};

export type CampAttendee = {
  name: string;
  gender: string;
  level: string;
  dob: string;
  age: number | null;
  schoolName: string;
  lga: string;
  guardianName: string;
  guardianNumber: string;
  educator: string;
};

/**
 * Index into `formNames` for each roster name, or null. Exact names claim first;
 * the rest take the unclaimed form name sharing the most words, at least two —
 * rosters add a middle name or respell one ("Tolulopa" for "Tolulope"), while
 * siblings share only a surname.
 */
export function matchRepSlots(rosterNames: string[], formNames: string[]): (number | null)[] {
  const words = (name: string) => personNameKey(name).split(" ").filter(Boolean);
  const out: (number | null)[] = rosterNames.map((name) => {
    const i = formNames.findIndex((f) => personNameKey(f) === personNameKey(name));
    return i < 0 ? null : i;
  });
  const claimed = new Set(out.filter((i) => i !== null));
  rosterNames.forEach((name, r) => {
    if (out[r] !== null) return;
    const mine = new Set(words(name));
    const scores = formNames.map((f, i) =>
      claimed.has(i) ? 0 : words(f).filter((w) => mine.has(w)).length,
    );
    const best = Math.max(0, ...scores);
    if (best >= 2 && scores.filter((s) => s === best).length === 1) {
      out[r] = scores.indexOf(best);
      claimed.add(out[r]);
    }
  });
  return out;
}

/**
 * One row per contestant at an attending school. Gender, DOB and guardian live
 * only on the entry form, found by name because the slot order drifts; a school
 * with no students provisioned falls back to the form's three reps.
 */
export function campAttendees(schools: CampAttendingSchool[], asOf: Date = new Date()): CampAttendee[] {
  const out: CampAttendee[] = [];
  for (const s of schools) {
    const d = s.details ?? {};
    const slots = [1, 2, 3].filter((n) => clean(d[`Student Rep ${n} Full Name`]));
    const people = s.students.length
      ? s.students
      : slots.map((n) => ({ name: clean(d[`Student Rep ${n} Full Name`]), level: null }));
    const slotOf = matchRepSlots(
      people.map((p) => p.name),
      slots.map((n) => d[`Student Rep ${n} Full Name`]),
    ).map((i) => (i === null ? undefined : slots[i]));
    people.forEach((p, i) => {
      const n = slotOf[i];
      const field = (f: string) => (n ? clean(d[`Student Rep ${n} ${f}`]) : "");
      out.push({
        name: p.name,
        gender: field("Gender"),
        level: p.level || field("Class"),
        dob: field("DOB"),
        age: ageFromDob(field("DOB"), asOf),
        schoolName: s.schoolName,
        lga: s.lga ?? "",
        guardianName: field("Guardian Name"),
        guardianNumber: field("Guardian Number"),
        educator: goingSummary(s.educators),
      });
    });
  }
  return out.sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.name.localeCompare(b.name));
}

const ATTENDEE_HEADERS = [
  "Name", "Gender", "Class", "Date of birth", "Age", "School", "LGA",
  "Guardian name", "Guardian number", "Educator",
];

// Spreadsheets would drop the guardian number's leading zero without the ="…" guard.
export const CAMP_ATTENDEE_PHONE_COLUMNS = new Set([ATTENDEE_HEADERS.indexOf("Guardian number")]);

export function campAttendeesCsvMatrix(attendees: CampAttendee[]): (string | number)[][] {
  return [
    ATTENDEE_HEADERS,
    ...attendees.map((a) => [
      a.name, a.gender, a.level, a.dob, a.age ?? "", a.schoolName, a.lga,
      a.guardianName, a.guardianNumber, a.educator,
    ]),
  ];
}
