// No "server-only" marker: this module is also used by the Airtable sync,
// which runs from standalone scripts. The service-role admin client parameter
// is the actual server gate — it can't be constructed in the browser.
import { randomBytes } from "crypto";
import { createAdminClient } from "@/supabase/admin";
import { studentAuthEmail } from "@/lib/student-accounts";
import { matchRoster, type RosterRow } from "@/lib/roster-match";

// Core student-provisioning shared by the coordinator's Students page and the
// public-registration onboarding: a Supabase auth user with a synthetic email +
// the access code as password (students sign in with just the code, no email).
// Reuse rule (registration-onboarding plan): a returning name within the school
// keeps its existing code and is re-tagged to the current edition; a new name
// gets a new student row + code, stamped with the edition.

export type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type ProvisionResult = {
  code?: string;
  error?: string;
  created?: boolean;
  /** The row the name resolved to. The replacement flow hands this student the
   *  outgoing rep's exam identity, which is keyed on the row and not the name. */
  studentId?: string;
};

export function makeAccessCode() {
  return randomBytes(5)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase();
}

export async function provisionStudent(
  admin: AdminClient,
  {
    schoolId,
    editionYear,
    name,
    level,
    allowReturn = false,
  }: {
    schoolId: string;
    editionYear: number;
    name: string;
    level: string | null;
    /** Bring back a rep this edition already retired. The replacement flow
     *  passes it; nowhere else may, or a swapped-out rep silently reappears. */
    allowReturn?: boolean;
  },
): Promise<ProvisionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter the student's name." };

  // The whole roster is read (a few rows) since personNameKey has no SQL
  // counterpart. A failed read here would look like an empty roster and
  // provision a duplicate, so it is not allowed to pass as one.
  const { data: rosterRows, error: rosterErr } = await admin
    .from("students")
    .select("id, name, access_code, auth_user_id, edition_year, deactivated_at")
    .eq("school_id", schoolId);
  if (rosterErr) {
    console.error("provisionStudent: roster read failed:", rosterErr.message);
    return { error: `Could not read the school's roster: ${rosterErr.message}` };
  }
  const roster = (rosterRows ?? []) as RosterRow[];
  const match = matchRoster(roster, trimmed, editionYear);

  let existing: RosterRow | null =
    match.kind === "reuse" || match.kind === "adopt" ? match.row : null;

  if (match.kind === "returning") {
    if (!allowReturn) {
      return {
        error: `${match.row.name} was replaced and retired for ${editionYear}. Ask the school to file a replacement bringing them back.`,
      };
    }
    const back = await reactivateStudent(admin, match.row.id);
    if (back.error) return { error: back.error };
    existing = match.row;
  }

  // A matched row with no working login falls past this to the adopt branch:
  // handing back a code with no auth user mints a login that never works.
  if (existing?.access_code && existing.auth_user_id) {
    // Carry the current spelling onto the row: a re-ordered name is a rename.
    // The edition re-tag trips students_roster_cap on a full roster, and
    // swallowing that returned a code for a student who was never enrolled.
    const { error: tagErr } = await admin
      .from("students")
      .update({ name: trimmed, edition_year: editionYear, level: level || null })
      .eq("id", existing.id);
    if (tagErr) {
      console.error("provisionStudent: re-tag failed:", tagErr.message);
      return { error: `Could not save student: ${tagErr.message}` };
    }
    return { code: existing.access_code as string, created: false, studentId: existing.id };
  }

  const code = makeAccessCode();
  const authEmail = studentAuthEmail(code);
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: authEmail,
    password: code,
    email_confirm: true,
    user_metadata: { full_name: trimmed },
  });
  if (cErr || !created.user) {
    console.error("provisionStudent: createUser failed:", cErr?.message);
    return { error: `Could not create access: ${cErr?.message ?? "unknown error"}` };
  }

  // Adopt the history-only row rather than inserting beside it: the unique
  // (school, lower(name)) index would reject a second row anyway, and the
  // student keeps one identity. It gets a real code, address and login.
  if (existing) {
    const { error: adoptErr } = await admin
      .from("students")
      .update({
        name: trimmed,
        access_code: code,
        auth_email: authEmail,
        auth_user_id: created.user.id,
        edition_year: editionYear,
        level: level || null,
      })
      .eq("id", existing.id);
    if (adoptErr) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      console.error("provisionStudent: adopt failed:", adoptErr.message);
      return { error: `Could not save student: ${adoptErr.message}` };
    }
    return { code, created: true, studentId: existing.id };
  }

  const { data: inserted, error: sErr } = await admin
    .from("students")
    .insert({
      school_id: schoolId,
      name: trimmed,
      level: level || null,
      access_code: code,
      auth_email: authEmail,
      auth_user_id: created.user.id,
      edition_year: editionYear,
    })
    .select("id")
    .maybeSingle();
  if (sErr) {
    // The row never landed, so clean up the auth user on EVERY failure, not
    // just the race below — students_roster_cap (20260913090400) rejects a
    // fourth rep, and an orphaned login with a live code is the worst residue.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});

    // Lost a race to another provisioning path (teacher + principal onboarding
    // provision the same roster). Reuse the winning row's code.
    if (sErr.code === "23505") {
      const { data: winnerRows } = await admin
        .from("students")
        .select("id, name, access_code, auth_user_id, edition_year, deactivated_at")
        .eq("school_id", schoolId);
      const raced = matchRoster((winnerRows ?? []) as RosterRow[], trimmed, editionYear);
      const winner = raced.kind === "reuse" ? raced.row : null;
      if (winner?.access_code) {
        await admin
          .from("students")
          .update({ name: trimmed, edition_year: editionYear, level: level || null })
          .eq("id", winner.id);
        return { code: winner.access_code as string, created: false, studentId: winner.id };
      }
    }
    console.error("provisionStudent: students insert failed:", sErr.message);
    return { error: `Could not save student: ${sErr.message}` };
  }

  return { code, created: true, studentId: inserted?.id as string | undefined };
}

// Retire a student when they're replaced on a registration. Bans the auth user
// (so the access code stops working) and stamps deactivated_at, but keeps the
// row and its assessment/plan history for audit — never a hard delete. The old
// code is retained on the row for reference; it no longer logs in.
export async function deactivateStudent(
  admin: AdminClient,
  studentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: student, error: readErr } = await admin
    .from("students")
    .select("id, auth_user_id, deactivated_at")
    .eq("id", studentId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!student) return { ok: false, error: "Student not found." };

  if (student.auth_user_id) {
    // ~100 years — effectively permanent. Preserves the row (unlike deleteUser),
    // so the student's history and access_code stay intact for audit.
    const { error: banErr } = await admin.auth.admin.updateUserById(
      student.auth_user_id as string,
      { ban_duration: "876000h" },
    );
    if (banErr) {
      console.error("deactivateStudent: ban failed:", banErr.message);
      return { ok: false, error: `Could not revoke access: ${banErr.message}` };
    }
  }

  const { error: updErr } = await admin
    .from("students")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("id", studentId);
  if (updErr) return { ok: false, error: updErr.message };

  return { ok: true };
}

// Undo deactivateStudent: the rep is named again, so their own row — and with
// it their candidate number and past results — comes back rather than a second
// row beside it. Their existing access code starts working again.
export async function reactivateStudent(
  admin: AdminClient,
  studentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: student, error: readErr } = await admin
    .from("students")
    .select("id, auth_user_id")
    .eq("id", studentId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!student) return { ok: false, error: "Student not found." };

  // Clear the retirement first: students_roster_cap watches this update and
  // rejects a fourth rep, and unbanning ahead of it would hand back a live
  // login for a student who stayed retired.
  const { error: updErr } = await admin
    .from("students")
    .update({ deactivated_at: null })
    .eq("id", studentId);
  if (updErr) {
    console.error("reactivateStudent: clear failed:", updErr.message);
    return { ok: false, error: updErr.message };
  }

  if (student.auth_user_id) {
    const { error: banErr } = await admin.auth.admin.updateUserById(
      student.auth_user_id as string,
      { ban_duration: "none" },
    );
    if (banErr) {
      console.error("reactivateStudent: unban failed:", banErr.message);
      return { ok: false, error: `Could not restore access: ${banErr.message}` };
    }
  }

  return { ok: true };
}
