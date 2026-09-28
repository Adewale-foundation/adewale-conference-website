"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/supabase/server";
import { canManageModule, getSessionUser } from "@/supabase/auth";
import { createAdminClient } from "@/supabase/admin";
import {
  provisionStudent,
  deactivateStudent,
  reactivateStudent,
} from "@/lib/provision-student";
import { personNameKey } from "@/lib/person-identity";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";
import type { Rep, StudentReplacementRow } from "@/supabase/types";

// Approve a student replacement: retire the outgoing student, provision the
// incoming one (who may be a rep this edition already retired), and update the
// registration. Service-role work, so admin is verified explicitly
// (createAdminClient bypasses RLS).
//
// `carry_exam_id` is the reviewer answering "the incoming rep is the one who
// sat, on the outgoing rep's number". Never inferred — the same request shape
// covers a rep who sat and then left. ADR-0013.
export async function approveReplacement(
  id: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageModule("registrations"))) {
    return { ok: false, error: "You have read-only access to registrations." };
  }
  const reviewer = await getSessionUser();
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Student access isn't configured on the server." };
  }
  const carryExamId = String(formData.get("carry_exam_id") ?? "").trim() || null;

  const { data: rRow, error: rErr } = await admin
    .from("student_replacements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (rErr) return { ok: false, error: `Could not read the request: ${rErr.message}` };
  const r = rRow as StudentReplacementRow | null;
  if (!r) return { ok: false, error: "That replacement request no longer exists." };
  if (r.status !== "pending") {
    return { ok: false, error: `This request was already ${r.status}.` };
  }

  const { data: reg, error: regErr } = await admin
    .from("registrations")
    .select("id, school_id, edition_year, reps, details")
    .eq("id", r.registration_id)
    .maybeSingle();
  if (regErr) {
    return { ok: false, error: `Could not read the registration: ${regErr.message}` };
  }
  if (!reg?.school_id) {
    return { ok: false, error: "That request's registration has no school." };
  }
  const schoolId = reg.school_id as string;
  const editionYear = (reg.edition_year as number | null) ?? null;

  // 1. Retire the outgoing student (re-resolve in case they were provisioned
  //    after the request was filed).
  let oldStudentId = r.old_student_id;
  if (!oldStudentId) {
    // By person key, not `ilike`: a miss here leaves the outgoing student active
    // and the incoming one is provisioned beside them, which is a fourth rep.
    const { data: found, error: fErr } = await admin
      .from("students")
      .select("id, name")
      .eq("school_id", schoolId)
      .is("deactivated_at", null);
    if (fErr) {
      return { ok: false, error: `Could not read the school's roster: ${fErr.message}` };
    }
    const key = personNameKey(r.old_name);
    oldStudentId =
      ((found ?? []) as { id: string; name: string }[]).find(
        (s) => personNameKey(s.name) === key,
      )?.id ?? null;
    // Pin it to the request before retiring them. The fallback above only sees
    // ACTIVE students, so a retry after a later step fails would no longer find
    // the row we are about to deactivate — and the exam carry-over needs it.
    if (oldStudentId) {
      await admin
        .from("student_replacements")
        .update({ old_student_id: oldStudentId })
        .eq("id", id);
    }
  }
  if (oldStudentId) {
    const res = await deactivateStudent(admin, oldStudentId);
    if (!res.ok) {
      console.error("approveReplacement: deactivate failed:", res.error);
      return { ok: false, error: `Could not retire ${r.old_name}: ${res.error}` };
    }
  }

  // 2. Provision the incoming student. allowReturn because a school may swap a
  //    rep back in — that retired row is the same child, and reviving it keeps
  //    her candidate number and results. Retiring first keeps us under the cap.
  const provision = await provisionStudent(admin, {
    schoolId,
    editionYear: editionYear ?? (Number(process.env.ASC_EDITION_YEAR) || 2026),
    name: r.new_name,
    level: r.new_level,
    allowReturn: true,
  });
  if (provision.error) {
    // The retirement above is already committed. Put it back, or the school is
    // left a rep short with the request still pending and nothing to retry.
    if (oldStudentId) {
      const undo = await reactivateStudent(admin, oldStudentId);
      if (!undo.ok) {
        console.error("approveReplacement: rollback failed:", undo.error);
        return {
          ok: false,
          error: `${provision.error} ${r.old_name} could not be put back either (${undo.error}) — fix this before retrying.`,
        };
      }
    }
    console.error("approveReplacement: provision failed:", provision.error);
    return { ok: false, error: provision.error };
  }

  // 3. Swap the rep in registrations.reps (match by name, fall back to slot).
  const reps = Array.isArray(reg.reps) ? [...(reg.reps as Rep[])] : [];
  const oldKey = personNameKey(r.old_name);
  let idx = reps.findIndex((rep) => personNameKey(rep.name) === oldKey);
  if (idx < 0 && r.rep_slot) idx = r.rep_slot - 1;
  const newRep: Rep = r.new_level
    ? { name: r.new_name, level: r.new_level }
    : { name: r.new_name };
  if (idx >= 0 && idx < reps.length) reps[idx] = newRep;
  else reps.push(newRep);

  // 4. Patch the "Student Rep N …" fields in registrations.details, which is
  //    what the registration page renders, so it agrees with reps.
  const details = { ...((reg.details ?? {}) as Record<string, string>) };
  const slotFields = repSlotFields(r);
  Object.assign(details, slotFields);

  const { error: regUpdErr } = await admin
    .from("registrations")
    .update({ reps, details })
    .eq("id", reg.id);
  if (regUpdErr) {
    console.error("approveReplacement: registration update failed:", regUpdErr.message);
    return {
      ok: false,
      error: `${r.new_name} was provisioned, but the registration still lists ${r.old_name}: ${regUpdErr.message}`,
    };
  }

  // 5. Carry the exam identity over, if the reviewer said the incoming rep is
  //    the one who sat. Every step above is idempotent on a re-approve, so a
  //    failure here leaves the request pending to be retried rather than
  //    approved with the score stranded on the retired row.
  let carriedExamNo: string | null = null;
  if (carryExamId) {
    if (!oldStudentId || !provision.studentId) {
      return {
        ok: false,
        error: `The swap is applied, but there is no ${!oldStudentId ? "outgoing" : "incoming"} student row to move the exam record between.`,
      };
    }
    // The user's own client: transfer_exam_identity is SECURITY DEFINER and
    // guards on has_module_manage, which reads auth.uid() — the service-role
    // client has none.
    const supabase = await createClient();
    const { data: moved, error: moveErr } = await supabase.rpc("transfer_exam_identity", {
      p_exam_id: carryExamId,
      p_from_student: oldStudentId,
      p_to_student: provision.studentId,
    });
    if (moveErr) {
      console.error("approveReplacement: exam transfer failed:", moveErr.message);
      return {
        ok: false,
        error: `${r.new_name} now holds the slot, but the exam number and score stayed with ${r.old_name}: ${moveErr.message}. The request is still pending — approve again to retry.`,
      };
    }
    carriedExamNo = (moved as { exam_no: string | null } | null)?.exam_no ?? null;
  }

  // 6. Mark approved.
  const { error: markErr } = await admin
    .from("student_replacements")
    .update({
      status: "approved",
      reviewed_by: reviewer?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (markErr) {
    console.error("approveReplacement: mark approved failed:", markErr.message);
    return {
      ok: false,
      error: `The swap was applied but the request is still pending: ${markErr.message}`,
    };
  }

  // 7. Notify the coordinator who requested it. A returning rep keeps the code
  //    they already had, so don't promise a new one.
  if (r.requested_by) {
    await admin.from("notifications").insert({
      profile_id: r.requested_by,
      title: "Student replacement approved",
      body: `${r.new_name} now replaces ${r.old_name}. Their access code is on the Students page.${
        carriedExamNo
          ? ` Exam number ${carriedExamNo} and its result now sit with ${r.new_name}.`
          : ""
      }`,
      link: "/portal/school/students",
    });
  }

  revalidatePath("/portal/admin/replacements");
  revalidatePath("/portal/school/students");
  revalidatePath("/portal/school");
  if (carriedExamNo) revalidatePath("/portal/school/results");
  const code = provision.created
    ? `${r.new_name} replaces ${r.old_name}, with a new access code.`
    : `${r.new_name} replaces ${r.old_name}, and keeps the access code they already had.`;
  return {
    ok: true,
    message: carriedExamNo
      ? `${code} Exam number ${carriedExamNo} and its result moved across.`
      : code,
  };
}

export async function declineReplacement(
  id: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageModule("registrations"))) {
    return { ok: false, error: "You have read-only access to registrations." };
  }
  const reviewer = await getSessionUser();
  const supabase = await createClient();

  const note = String(formData.get("note") ?? "").trim() || null;

  // RLS (sr_admin_update) restricts this to admins; no student changes.
  const { data: r, error } = await supabase
    .from("student_replacements")
    .update({
      status: "declined",
      admin_note: note,
      reviewed_by: reviewer?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("requested_by, old_name, new_name")
    .maybeSingle();
  if (error) return { ok: false, error: `Could not decline: ${error.message}` };
  if (!r) return { ok: false, error: "That request is no longer pending." };

  if (r.requested_by) {
    await supabase.from("notifications").insert({
      profile_id: r.requested_by as string,
      title: "Student replacement declined",
      body: `Your request to replace ${r.old_name} with ${r.new_name} was declined.${note ? ` Note: ${note}` : ""}`,
      link: "/portal/school/students",
    });
  }

  revalidatePath("/portal/admin/replacements");
  return { ok: true, message: `Declined. ${r.old_name} stays.` };
}

// Map the incoming rep's details onto the "Student Rep N …" keys for the
// resolved slot. The names are Airtable's, kept because registrations.details
// mirrors the original form payload and the registration page reads it.
function repSlotFields(r: StudentReplacementRow): Record<string, string> {
  const n = r.rep_slot;
  if (!n) return {};
  const d = r.new_details ?? {};
  const fields: Record<string, string> = {
    [`Student Rep ${n} Full Name`]: r.new_name,
  };
  if (r.new_level) fields[`Student Rep ${n} Class`] = r.new_level;
  if (d.dob) fields[`Student Rep ${n} DOB`] = d.dob;
  if (d.gender) fields[`Student Rep ${n} Gender`] = d.gender;
  if (d.guardianName) fields[`Student Rep ${n} Guardian Name`] = d.guardianName;
  if (d.guardianNumber)
    fields[`Student Rep ${n} Guardian Number`] = d.guardianNumber;
  return fields;
}
