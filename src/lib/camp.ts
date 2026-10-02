// ASC Camp: who is invited, whether they can still answer, and the roster
// admins work from. The window and validation rules are also enforced by
// submit_camp_response() in SQL — keep the two in step.
import { tierRank } from "./resource-access";
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
  extra: "Additional teacher",
};

/** Extra accompanying teachers beyond those on record. Mirrored in submit_camp_response(). */
export const MAX_EXTRA_EDUCATORS = 5;

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * The school's educators on record: the teacher and principal from the entry
 * form (the only source with phones), then any other approved portal member.
 * Deduped by email so a teacher who is also a member appears once.
 */
export function educatorsOnRecord(
  details: Record<string, unknown> | null | undefined,
  members: { full_name: string | null; email: string | null }[],
): CampEducator[] {
  const out: CampEducator[] = [];
  const seen = new Set<string>();
  const add = (name: string, phone: string, email: string, role: CampEducatorRole) => {
    const key = email.toLowerCase() || `name:${name.toLowerCase()}`;
    if (!name || seen.has(key) || seen.has(`name:${name.toLowerCase()}`)) return;
    seen.add(key);
    seen.add(`name:${name.toLowerCase()}`);
    out.push({ name, phone: phone || null, email: email || null, role, going: false });
  };
  add(clean(details?.["Teacher Full Name"]), clean(details?.["Teacher Number"]), clean(details?.["Teacher Email Address"]), "teacher");
  add(clean(details?.["Principal Full Name"]), clean(details?.["Principal Number"]), clean(details?.["Principal Email Address"]), "principal");
  for (const m of members) add(clean(m.full_name) || clean(m.email), "", clean(m.email), "educator");
  return out;
}

/** Stable identity for an educator across renders and the form round trip. */
export function educatorKey(e: Pick<CampEducator, "name" | "email">): string {
  return e.email?.toLowerCase() || `name:${e.name.toLowerCase()}`;
}

/** Record list with the school's saved answers laid over it, plus saved extras. */
export function mergeSavedEducators(record: CampEducator[], saved: CampEducator[] | null | undefined) {
  const savedByKey = new Map((saved ?? []).filter((e) => e.role !== "extra").map((e) => [educatorKey(e), e]));
  return {
    record: record.map((e) => {
      const prev = savedByKey.get(educatorKey(e));
      return prev ? { ...e, going: prev.going, phone: prev.phone ?? e.phone } : e;
    }),
    extras: (saved ?? []).filter((e) => e.role === "extra"),
  };
}

export type CampResponseInput = {
  status: string;
  /** Educators on record, each with the school's going choice and phone. */
  educators: CampEducator[];
  extras: { name: string; phone: string }[];
  repsConfirmed: boolean;
  termsAccepted: boolean;
  notes: string;
  declineReason: string;
};

export type CampResponse = {
  status: "attending" | "not_attending";
  educators: CampEducator[];
  repsConfirmed: boolean;
  notes: string | null;
  declineReason: string | null;
};

const PHONE = /^\+?[\d\s()-]{7,20}$/;

export function validateCampResponse(
  input: CampResponseInput,
): { ok: true; value: CampResponse } | { ok: false; error: string } {
  const notes = input.notes.trim() || null;
  if (input.status === "attending") {
    const record = input.educators.map((e) => ({ ...e, name: e.name.trim(), phone: e.phone?.trim() || null }));
    for (const e of record.filter((e) => e.going)) {
      if (!e.phone || !PHONE.test(e.phone)) {
        return { ok: false, error: `Enter a valid phone number for ${e.name}.` };
      }
    }
    const extraRows = input.extras
      .map((x) => ({ name: x.name.trim(), phone: x.phone.trim() }))
      .filter((x) => x.name || x.phone);
    if (extraRows.length > MAX_EXTRA_EDUCATORS) {
      return { ok: false, error: `Add at most ${MAX_EXTRA_EDUCATORS} additional teachers.` };
    }
    for (const x of extraRows) {
      if (!x.name || !PHONE.test(x.phone)) {
        return { ok: false, error: "Enter a name and a valid phone number for each additional teacher." };
      }
    }
    const extras: CampEducator[] = extraRows.map((x) => ({
      name: x.name,
      phone: x.phone,
      email: null,
      role: "extra",
      going: true,
    }));
    if (!record.some((e) => e.going) && extras.length === 0) {
      return { ok: false, error: "Choose at least one educator who will accompany your students." };
    }
    if (!input.repsConfirmed) {
      return { ok: false, error: "Confirm that your three registered contestants will attend." };
    }
    if (!input.termsAccepted) {
      return { ok: false, error: "Accept the camp terms to secure your place." };
    }
    return {
      ok: true,
      value: { status: "attending", educators: [...record, ...extras], repsConfirmed: true, notes, declineReason: null },
    };
  }
  if (input.status === "not_attending") {
    const declineReason = input.declineReason.trim();
    if (!declineReason) return { ok: false, error: "Tell us why your school cannot attend." };
    return {
      ok: true,
      value: { status: "not_attending", educators: [], repsConfirmed: false, notes, declineReason },
    };
  }
  return { ok: false, error: "Choose whether your school is attending." };
}

/** "Mrs Ada Nwosu (0803…); Ms Zainab Quill (0805…)" — the adults actually coming. */
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
): Record<CampRosterStatus | "eligible" | "manual", number> {
  const counts = { eligible: rows.length, manual: 0, attending: 0, not_attending: 0, no_response: 0, released: 0 };
  for (const r of rows) {
    counts[r.status] += 1;
    if (r.source === "manual") counts.manual += 1;
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
      "School", "LGA", "Invited as", "Status", "Educators attending", "Educator count", "Contestants confirmed",
      "Notes", "Reason not attending", "Respond by", "Responded at", "Admin note",
    ],
    ...rows.map((r) => [
      r.schoolName,
      r.lga ?? "",
      CAMP_INVITE_LABEL[r.source],
      CAMP_STATUS_LABEL[r.status],
      goingSummary(r.educators),
      String(r.educators.filter((e) => e.going).length),
      r.repsConfirmed ? "Yes" : "No",
      r.notes ?? "",
      r.declineReason ?? "",
      r.respondBy ?? "",
      r.respondedAt ?? "",
      r.adminNote ?? "",
    ]),
  ];
}
