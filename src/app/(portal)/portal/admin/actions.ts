"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/supabase/server";
import { requireManage } from "@/supabase/auth";
import {
  buildActivationEmail,
  buildTeamInviteEmail,
  buildWaitlistInviteEmail,
  buildWaitlistOpenEmail,
  sendEmailSafely,
} from "@/lib/email";
import { resolveInviteDays } from "@/lib/waitlist-invite";
import { notifySchool, notifySchoolDecision } from "@/lib/school-notify";
import {
  bulkDecisionSummary,
  partitionSelection,
  registrationDecisionOutcome,
} from "@/lib/registration-decision";
import { ensureRoster } from "@/lib/ensure-roster";
import {
  QUALIFICATION_REASONS,
  type QualificationReason,
  type RegistrationStatus,
  type TournamentMatchStatus,
  type UserRole,
} from "@/supabase/types";
import { permissionsFromForm } from "@/lib/admin-permissions";
import { ZONAL_FINALS_OPTIONS } from "@/lib/forms";
// Type only, so the "use server" boundary is untouched at runtime.
import type { CentreSaveState } from "@/components/portal/centre-save-state";

const STATUSES: RegistrationStatus[] = ["submitted", "verified", "declined"];
const CONTACT_KINDS = ["teacher", "principal"] as const;
type ContactKind = (typeof CONTACT_KINDS)[number];
export type ContactUpdateState = { ok: boolean; message: string } | null;

/** What a bulk review actually did — every selected school is accounted for. */
export type BulkDecisionState = {
  ok: boolean;
  /** Headline, e.g. "Approved 12 schools." */
  message: string;
  /** Schools whose status changed (and were emailed). */
  applied: string[];
  /** Schools left untouched, each with the reason the admin needs to see. */
  skipped: { name: string; reason: string }[];
} | null;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function detailsValue(details: Record<string, string> | null, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value.trim() : "";
}

async function latestEditionYear(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("editions")
    .select("year")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  const year = Number(data?.year);
  return Number.isInteger(year) ? year : null;
}

async function isEditableEdition(supabase: SupabaseClient, year: number | null | undefined) {
  if (!Number.isInteger(year)) return false;
  const latest = await latestEditionYear(supabase);
  return latest != null && year === latest;
}

async function isEditableRegistration(supabase: SupabaseClient, registrationId: string) {
  const { data } = await supabase
    .from("registrations")
    .select("edition_year")
    .eq("id", registrationId)
    .maybeSingle();
  return isEditableEdition(supabase, Number(data?.edition_year));
}

async function isEditableGroup(supabase: SupabaseClient, groupId: string) {
  const { data } = await supabase
    .from("tournament_groups")
    .select("edition_year")
    .eq("id", groupId)
    .maybeSingle();
  return isEditableEdition(supabase, Number(data?.edition_year));
}

async function isEditableGroupEntry(supabase: SupabaseClient, entryId: string) {
  const { data } = await supabase
    .from("tournament_group_entries")
    .select("group_id")
    .eq("id", entryId)
    .maybeSingle();
  const groupId = String(data?.group_id ?? "");
  return groupId ? isEditableGroup(supabase, groupId) : false;
}

async function isEditableMatch(supabase: SupabaseClient, matchId: string) {
  const { data } = await supabase
    .from("tournament_matches")
    .select("edition_year")
    .eq("id", matchId)
    .maybeSingle();
  return isEditableEdition(supabase, Number(data?.edition_year));
}

async function isEditableStudent(supabase: SupabaseClient, studentId: string) {
  const { data } = await supabase
    .from("students")
    .select("edition_year")
    .eq("id", studentId)
    .maybeSingle();
  return isEditableEdition(supabase, Number(data?.edition_year));
}

// Provision each approved school's reps as student rows. Each rep is an
// auth-user create, so a large bulk approve can run long. Runs inline on Vercel
// for now — idempotent (ensureRoster reuses students by school + name), and the
// per-school "Sync roster" button on the Participants hub is the manual backstop
// if a very large batch ever exceeds the function budget.
async function triggerRosterProvision(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select("school_id, edition_year, reps")
    .in("id", unique);
  for (const r of (data ?? []) as {
    school_id: string | null;
    edition_year: number;
    reps: unknown;
  }[]) {
    await ensureRoster({ school_id: r.school_id, edition_year: r.edition_year, reps: r.reps });
  }
}

// ── Team invitations ─────────────────────────────────────────────────────────
// An admin invites a teammate (always as an admin — educators and students have
// their own onboarding flows). If the email already has a profile we promote it
// on the spot; otherwise we store a pending invite with a single-use 256-bit
// token and email a link to /portal/team-invite where the invitee sets their
// password — the account is created pre-verified. The signup trigger remains a
// fallback (signing up normally with the invited email still grants the role).
export async function inviteTeamMember(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role: UserRole = "admin";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

  // Only a teammate who can MANAGE the team may add admins or set their access.
  const admin = await requireManage("team");
  if (!admin) return;
  const user = admin.user;
  const supabase = await createClient();

  // The invite carries an access profile (preset or custom per-module levels);
  // the handle_new_user trigger copies admin_role + permissions onto the account.
  const { adminRole, permissions } = permissionsFromForm(formData);

  // Already signed up? Promote directly (and apply the chosen access) instead of inviting.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, role")
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    if (existing.id !== user.id) {
      // RLS (profiles_admin_update with is_admin()) restricts this to admins.
      await supabase
        .from("profiles")
        .update({ role, admin_role: adminRole, permissions })
        .eq("id", existing.id);
      if (existing.role !== role) {
        await supabase.from("notifications").insert({
          profile_id: existing.id,
          title: "You've been added to the team",
          body: `Your portal access was upgraded to ${role}.`,
          link: "/portal",
        });
      }
    }
    revalidatePath("/portal/admin/settings");
    revalidatePath("/portal/admin/users");
    return;
  }

  // RLS (team_invites_admin_all with is_admin()) restricts this to admins.
  // Refresh any pending invite for the same email (fresh token, new 30-day window).
  const { data: pending } = await supabase
    .from("team_invites")
    .select("id")
    .ilike("email", email)
    .is("accepted_at", null)
    .maybeSingle();
  const verifyToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const invitePayload = {
    role,
    admin_role: adminRole,
    permissions,
    invited_by: user.id,
    expires_at: expires,
    verify_token: verifyToken,
  };
  const { error } = pending
    ? await supabase.from("team_invites").update(invitePayload).eq("id", pending.id)
    : await supabase.from("team_invites").insert({ email, ...invitePayload });
  if (error) return;

  await sendEmailSafely(
    buildTeamInviteEmail({
      email,
      invitedBy: await inviterName(user.id),
      verifyToken,
    }),
  );
  revalidatePath("/portal/admin/settings");
}

// Regenerates the token (fresh 30-day window) and re-sends the invitation email.
export async function resendTeamInvite(inviteId: string) {
  const admin = await requireManage("team");
  if (!admin) return;
  const supabase = await createClient();
  const user = admin.user;

  const { data: invite } = await supabase
    .from("team_invites")
    .select("id, email")
    .eq("id", inviteId)
    .is("accepted_at", null)
    .maybeSingle();
  if (!invite) return;

  const verifyToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  // RLS (team_invites_admin_all) restricts this to admins.
  const { error } = await supabase
    .from("team_invites")
    .update({ verify_token: verifyToken, expires_at: expires, invited_by: user.id })
    .eq("id", invite.id);
  if (error) return;

  await sendEmailSafely(
    buildTeamInviteEmail({
      email: invite.email,
      invitedBy: await inviterName(user.id),
      verifyToken,
    }),
  );
  revalidatePath("/portal/admin/settings");
}

async function inviterName(userId: string) {
  const supabase = await createClient();
  const { data: me } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return me?.full_name ?? me?.email ?? "The ASC team";
}

export async function revokeTeamInvite(inviteId: string) {
  if (!(await requireManage("team"))) return;
  const supabase = await createClient();
  // RLS (team_invites_admin_all) restricts this to admins.
  await supabase.from("team_invites").delete().eq("id", inviteId).is("accepted_at", null);
  revalidatePath("/portal/admin/settings");
}

// Update an existing admin's access profile (preset or custom per-module levels).
// Team-manage only; you can't demote your own access (avoids self-lockout).
export async function updateTeamMemberPermissions(profileId: string, formData: FormData) {
  const admin = await requireManage("team");
  if (!admin) return;
  if (!profileId || profileId === admin.user.id) return;

  const { adminRole, permissions } = permissionsFromForm(formData);
  const supabase = await createClient();
  // RLS (profiles_admin_update with is_admin()) restricts this to admins.
  const { error } = await supabase
    .from("profiles")
    .update({ admin_role: adminRole, permissions })
    .eq("id", profileId)
    .eq("role", "admin");
  if (error) return;

  await supabase.from("notifications").insert({
    profile_id: profileId,
    title: "Your admin access was updated",
    body: "A team manager changed the sections you can see and manage.",
    link: "/portal/admin",
  });
  revalidatePath("/portal/admin/settings");
}

// ── Waitlist ─────────────────────────────────────────────────────────────────
// Emails every un-notified waitlist entry that registration is open, then
// stamps notified_at so re-running never double-sends. Uses the session client,
// so RLS (waitlist is admin-only) is the permission gate.
export async function inviteWaitlist() {
  const admin = await requireManage("registrations");
  if (!admin) return;
  const user = admin.user;
  const supabase = await createClient();

  const { data: openEdition } = await supabase
    .from("editions")
    .select("year")
    .eq("registration_open", true)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  let title = "Waitlist invited";
  let body: string;
  if (!openEdition) {
    title = "Waitlist not invited";
    body = "Open registration for an edition first (Editions page), then invite the waitlist.";
  } else {
    const { data: entries } = await supabase
      .from("waitlist")
      .select("id, school_name, contact_name, contact_email")
      .is("notified_at", null)
      // Skip schools that already came in through an invite; notified_at can't
      // catch them, because invites never set it.
      .is("converted_at", null);
    const rows = entries ?? [];
    for (const entry of rows) {
      await sendEmailSafely(
        buildWaitlistOpenEmail({
          email: entry.contact_email,
          name: entry.contact_name,
          schoolName: entry.school_name,
          editionYear: openEdition.year as number,
        }),
      );
    }
    if (rows.length > 0) {
      await supabase
        .from("waitlist")
        .update({ notified_at: new Date().toISOString() })
        .in("id", rows.map((r) => r.id));
    }
    body = rows.length
      ? `${rows.length} school${rows.length === 1 ? "" : "s"} emailed the ASC ${openEdition.year} registration link.`
      : "Every waitlist entry has already been notified.";
  }

  await supabase.from("notifications").insert({
    profile_id: user.id,
    title,
    body,
    link: "/portal/admin/waitlist",
  });
  revalidatePath("/portal/admin/waitlist");
}

// Issues ONE school a single-use pass to register while registration is closed.
// Re-running rotates the token, which is how an expired link gets replaced.
export async function inviteWaitlistEntry(entryId: string, formData: FormData) {
  const admin = await requireManage("registrations");
  if (!admin) return;
  const supabase = await createClient();
  const inviteDays = resolveInviteDays(formData.get("expiresInDays"));

  const { data: entry } = await supabase
    .from("waitlist")
    .select("id, school_name, contact_name, contact_email, converted_at")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.converted_at) return;

  // Usually closed when this runs, so the newest edition is the real target.
  const { data: openEdition } = await supabase
    .from("editions")
    .select("year")
    .eq("registration_open", true)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  const editionYear = (openEdition?.year as number | undefined) ?? (await latestEditionYear(supabase));

  let title = "Invite sent";
  let body: string;
  if (!editionYear) {
    title = "Invite not sent";
    body = "Create an edition first (Editions page), then invite the school.";
  } else {
    // Same shape as the coordinator onboarding token.
    const inviteToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + inviteDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error } = await supabase
      .from("waitlist")
      .update({
        invite_token: inviteToken,
        invite_token_expires_at: expiresAt,
        invited_edition_year: editionYear,
        invited_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .is("converted_at", null);

    if (error) {
      title = "Invite not sent";
      body = `Could not issue an invite for ${entry.school_name}: ${error.message}`;
    } else {
      await sendEmailSafely(
        buildWaitlistInviteEmail({
          email: entry.contact_email,
          name: entry.contact_name,
          schoolName: entry.school_name,
          editionYear,
          inviteToken,
          expiresAt,
        }),
      );
      body = `${entry.school_name} can now register for ASC ${editionYear}. The link was emailed to ${entry.contact_email} and expires on ${new Date(expiresAt).toLocaleDateString()} (${inviteDays} days).`;
    }
  }

  await supabase.from("notifications").insert({
    profile_id: admin.user.id,
    title,
    body,
    link: "/portal/admin/waitlist",
  });
  revalidatePath("/portal/admin/waitlist");
}

export async function setRegistrationStatus(
  registrationId: string,
  formData: FormData,
) {
  if (!(await requireManage("registrations"))) return;
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status as RegistrationStatus)) return;
  // A decline can carry a reason the school sees (and can act on before
  // resubmitting). Cleared whenever the row moves off "declined".
  const declineReason =
    status === "declined" ? String(formData.get("decline_reason") ?? "").trim() || null : null;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("registrations")
    .select("status, edition_year, contact_email, contact_name, owner_id, school_id, reps, schools(name)")
    .eq("id", registrationId)
    .maybeSingle();
  if (!before || !(await isEditableEdition(supabase, Number(before.edition_year)))) return;

  // RLS (reg_owner_update with is_admin()) restricts this to admins.
  const { error } = await supabase
    .from("registrations")
    .update({ status, decline_reason: declineReason })
    .eq("id", registrationId);

  // First transition into verified materialises the roster (same as bulk
  // approve), off-request so the action returns fast. Idempotent.
  if (!error && status === "verified" && before && before.status !== "verified") {
    await triggerRosterProvision([registrationId]);
  }

  // Same emails as the bulk review, but only on an actual TRANSITION into
  // verified/declined — re-saving the same status never re-sends.
  const notify =
    !error &&
    before &&
    before.status !== status &&
    (status === "verified" || status === "declined");
  if (notify) {
    const schoolName =
      ((before.schools as unknown as { name: string | null } | null)?.name) ?? "Your school";
    // One audience → email + in-portal notification for every educator, not just
    // the owner.
    await notifySchoolDecision(supabase, {
      schoolId: (before.school_id as string | null) ?? null,
      schoolName,
      editionYear: before.edition_year,
      decision: status === "verified" ? "approve" : "decline",
      ownerId: before.owner_id,
      fallbackEmail: before.contact_email,
      fallbackName: before.contact_name,
      declineReason,
    });
  }
  revalidatePath("/portal/admin");
  revalidatePath("/portal/admin/editions");
  revalidatePath("/portal/admin/registrations");
}

// ── Close-of-registration review: bulk approve / decline ─────────────────────
// Competition selection, not an access gate — schools keep portal/prep access
// either way. Approve → verified + the official guidelines email; Decline →
// declined + a polite email. Idempotent: rows already in the target state are
// skipped, so re-running never re-sends — but a declined school can still be
// approved (and vice versa), which is how a mistaken decision is reversed.
export async function bulkRegistrationDecision(
  _prevState: BulkDecisionState,
  formData: FormData,
): Promise<BulkDecisionState> {
  const decision = String(formData.get("decision") ?? "");
  // Deduped because "select all matching" injects hidden ids that can overlap
  // the ticked page rows — the DB fetch would collapse them anyway, but keep
  // the notification loop honest.
  const ids = [...new Set(formData.getAll("ids").map(String).filter(Boolean))];
  if (ids.length === 0) {
    return fail("Nothing selected — tick at least one school, then choose approve or decline.");
  }

  // Stage marking (advance / not-advanced at a chosen stage) shares this
  // selection form but is a different flow from acceptance (approve / decline) —
  // and belongs to the Participants module, so it's gated separately.
  if (decision === "advance" || decision === "eliminate") {
    if (!(await requireManage("participants"))) {
      return fail("You do not have permission to record stage results.");
    }
    return bulkStageOutcome(
      ids,
      decision === "advance" ? "advanced" : "eliminated",
      String(formData.get("stage") ?? "").trim(),
    );
  }

  if (decision !== "approve" && decision !== "decline") {
    return fail("Choose approve or decline.");
  }
  if (!(await requireManage("registrations"))) {
    return fail("You do not have permission to review registrations.");
  }
  // One reason applies to every school declined in this batch (optional).
  const declineReason =
    decision === "decline" ? String(formData.get("decline_reason") ?? "").trim() || null : null;

  const supabase = await createClient();
  // RLS (reg_owner_update with is_admin()) restricts the writes to admins.
  const { data } = await supabase
    .from("registrations")
    .select("id, status, edition_year, contact_email, contact_name, owner_id, school_id, reps, schools(name)")
    .in("id", ids);
  const rows = (data ?? []) as unknown as {
    id: string;
    status: RegistrationStatus;
    edition_year: number;
    contact_email: string | null;
    contact_name: string | null;
    owner_id: string | null;
    school_id: string | null;
    reps: unknown;
    schools: { name: string | null } | null;
  }[];
  // Read the current edition once instead of per row (isEditableEdition queries
  // `editions` on every call), so the reason can name the year that IS open.
  const latestYear = await latestEditionYear(supabase);
  const { open, skipped } = partitionSelection({
    ids,
    rows: rows.map((row) => ({ ...row, name: row.schools?.name ?? "Unassigned school" })),
    latestYear,
  });

  const applied: string[] = [];
  const approvedIds: string[] = [];
  for (const row of open) {
    // A row already in the decided state is skipped with its reason. A declined
    // school is NOT in that set: it stays approvable from this same review.
    const { patch, skipReason } = registrationDecisionOutcome(
      row.status,
      decision,
      declineReason,
    );
    if (!patch) {
      skipped.push({ name: row.name, reason: skipReason });
      continue;
    }

    const { error } = await supabase
      .from("registrations")
      .update(patch)
      .eq("id", row.id);
    if (error) {
      skipped.push({
        name: row.name,
        reason: `the database rejected the change — ${error.message}`,
      });
      continue;
    }
    applied.push(row.name);

    // Roster provisioning (one auth user per rep) is deferred to a background
    // function after the loop — doing it inline here 504'd a bulk approve.
    if (decision === "approve") approvedIds.push(row.id);

    const schoolName = row.schools?.name ?? "Your school";
    // Every educator (teacher + principal + any approved member) gets both the
    // email and the in-portal notification — same audience, both channels.
    await notifySchoolDecision(supabase, {
      schoolId: row.school_id,
      schoolName,
      editionYear: row.edition_year,
      decision,
      ownerId: row.owner_id,
      fallbackEmail: row.contact_email,
      fallbackName: row.contact_name,
      declineReason,
    });
  }

  await triggerRosterProvision(approvedIds);

  revalidatePath("/portal/admin/registrations");
  revalidatePath("/portal/admin/editions");
  revalidatePath("/portal/admin");

  return {
    ...bulkDecisionSummary({
      verb: decision === "approve" ? "Approved" : "Declined",
      appliedCount: applied.length,
      skippedCount: skipped.length,
      selectedCount: ids.length,
    }),
    applied,
    skipped,
  };
}

function fail(message: string): BulkDecisionState {
  return { ok: false, message, applied: [], skipped: [] };
}

// ── Per-stage results: mark selected schools advanced / not-advanced ─────────
// The edition moves everyone through one shared stage; this records how each
// school fared at a given stage so a school can advance at the Zonal Stage yet
// not at the Grand Finale. Upsert keyed on (registration_id, stage), so
// re-marking corrects rather than duplicates. Notifies each owner.
async function bulkStageOutcome(
  ids: string[],
  outcome: "advanced" | "eliminated",
  stage: string,
): Promise<BulkDecisionState> {
  if (!stage) return fail("Choose the stage these results belong to first.");
  if (ids.length === 0) return fail("Nothing selected — tick at least one school first.");

  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select("id, edition_year, owner_id, school_id, schools(name)")
    .in("id", ids);
  const rows = (data ?? []) as unknown as {
    id: string;
    edition_year: number;
    owner_id: string | null;
    school_id: string | null;
    schools: { name: string | null } | null;
  }[];
  const latestYear = await latestEditionYear(supabase);
  const { open: editableRows, skipped } = partitionSelection({
    ids,
    rows: rows.map((row) => ({ ...row, name: row.schools?.name ?? "Unassigned school" })),
    latestYear,
  });
  if (editableRows.length === 0) {
    return {
      ...bulkDecisionSummary({
        verb: "Recorded",
        appliedCount: 0,
        skippedCount: skipped.length,
        selectedCount: ids.length,
      }),
      applied: [],
      skipped,
    };
  }

  const now = new Date().toISOString();
  // RLS (stage_results_admin_write) restricts the upsert to admins.
  const { error } = await supabase.from("registration_stage_results").upsert(
    editableRows.map((r) => ({
      registration_id: r.id,
      stage,
      outcome,
      updated_at: now,
    })),
    { onConflict: "registration_id,stage" },
  );
  if (error) {
    return {
      ok: false,
      message: `No school changed — the database rejected the update (${error.message}).`,
      applied: [],
      skipped,
    };
  }

  for (const r of editableRows) {
    const schoolName = r.schools?.name ?? "Your school";
    // Notify every educator on the school, not just the owner.
    await notifySchool(supabase, r.school_id, r.owner_id, {
      title: outcome === "advanced" ? `Advanced past ${stage}` : `${stage} result`,
      body:
        outcome === "advanced"
          ? `${schoolName} advanced past the ${stage} in the ${r.edition_year} competition.`
          : `${schoolName} did not advance past the ${stage} in the ${r.edition_year} competition. The prep portal stays open.`,
      link: "/portal/school",
    });
  }

  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/admin");
  revalidatePath("/portal/school");
  revalidatePath("/portal");

  const applied = editableRows.map((row) => row.name);
  return {
    ...bulkDecisionSummary({
      verb: outcome === "advanced" ? "Advanced" : "Marked not-advanced",
      appliedCount: applied.length,
      skippedCount: skipped.length,
      selectedCount: ids.length,
      at: stage,
    }),
    applied,
    skipped,
  };
}

// ── Resend / change-email for the activation link ────────────────────────────
// Regenerates the 30-day token (updating the contact email first if the admin
// corrected it) and re-sends the branded activation email. Only for
// not-yet-onboarded registrations.
export async function resendActivation(registrationId: string, formData: FormData) {
  if (!(await requireManage("registrations"))) return;
  const newEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!newEmail || !isEmail(newEmail)) return;

  const supabase = await createClient();
  const { data: reg } = await supabase
    .from("registrations")
    .select("id, owner_id, onboarded_at, contact_name, claim_code, schools(name)")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg || reg.owner_id || reg.onboarded_at) return;

  const verifyToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  // RLS restricts this update to admins.
  const { error } = await supabase
    .from("registrations")
    .update({
      contact_email: newEmail,
      verify_token: verifyToken,
      verify_token_expires_at: expires,
    })
    .eq("id", registrationId);
  if (error) return;

  await sendEmailSafely(
    buildActivationEmail({
      email: newEmail,
      name: (reg.contact_name as string | null) ?? null,
      schoolFullName:
        ((reg.schools as unknown as { name: string | null } | null)?.name) ?? "your school",
      verifyToken,
      claimCode: (reg.claim_code as string | null) ?? null,
    }),
  );
  revalidatePath("/portal/admin/registrations");
}

// Admin correction for the educator emails captured at registration. Unlike the
// activation resend above, this remains available after activation: it updates
// the stored registration details, replaces the school's approved membership,
// and either links an existing profile or sends a fresh activation link.
export async function updateRegistrationContact(
  registrationId: string,
  _prevState: ContactUpdateState,
  formData: FormData,
): Promise<ContactUpdateState> {
  const admin = await requireManage("registrations");
  if (!admin) return { ok: false, message: "You do not have permission to update this registration." };

  const kind = String(formData.get("contact_kind") ?? "") as ContactKind;
  const newEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const newName = String(formData.get("name") ?? "").trim();
  if (!CONTACT_KINDS.includes(kind)) {
    return { ok: false, message: "Choose whether you are updating the educator or principal." };
  }
  if (!newEmail || !isEmail(newEmail)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { data: reg } = await supabase
    .from("registrations")
    .select("id, school_id, contact_email, contact_name, claim_code, owner_id, onboarded_at, details, schools(name)")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg) return { ok: false, message: "Registration not found." };

  const details = ((reg.details as Record<string, string> | null) ?? {}) as Record<
    string,
    string
  >;
  const teacherEmail = detailsValue(details, "Teacher Email Address");
  const principalEmail = detailsValue(details, "Principal Email Address");
  const emailKey =
    kind === "teacher" ? "Teacher Email Address" : "Principal Email Address";
  const nameKey = kind === "teacher" ? "Teacher Full Name" : "Principal Full Name";
  const existingName =
    kind === "teacher"
      ? detailsValue(details, "Teacher Full Name") ||
        ((reg.contact_name as string | null) ?? null)
      : detailsValue(details, "Principal Full Name") || null;
  // The admin can now supply/correct the name (fixes rows synced without one);
  // fall back to the captured value when the field is left blank.
  const name = newName || existingName;
  const oldEmail =
    kind === "teacher"
      ? teacherEmail || ((reg.contact_email as string | null) ?? "")
      : principalEmail;
  const otherEmail = kind === "teacher" ? principalEmail : teacherEmail;
  const schoolId = (reg.school_id as string | null) ?? null;

  if (schoolId) {
    const { data: existingMemberships } = await supabase
      .from("school_members")
      .select("email, school_id, schools(name)")
      .ilike("email", newEmail)
      .neq("school_id", schoolId);
    const conflicts = ((existingMemberships ?? []) as unknown as {
      email: string;
      school_id: string;
      schools: { name: string | null }[] | { name: string | null } | null;
    }[]).filter(
      (membership) =>
        membership.email.toLowerCase() === newEmail && membership.school_id !== schoolId,
    );

    if (conflicts.length > 0) {
      const schoolNames = conflicts
        .map((membership) =>
          Array.isArray(membership.schools)
            ? membership.schools[0]?.name
            : membership.schools?.name,
        )
        .filter(Boolean)
        .join(", ");
      return {
        ok: false,
        message: `${newEmail} already has access to ${schoolNames || "another school"}. Remove that access first, then try again.`,
      };
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .ilike("email", newEmail)
    .maybeSingle();
  const profileId = (profile?.id as string | undefined) ?? null;
  if (profileId && profile?.role === "student") {
    await supabase.from("profiles").update({ role: "coordinator" }).eq("id", profileId);
  }

  const verifyToken = profileId ? null : randomBytes(32).toString("hex");
  const verifyExpires = profileId
    ? null
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const nextDetails: Record<string, string> = { ...details, [emailKey]: newEmail };
  if (name) nextDetails[nameKey] = name;
  const registrationPatch: Record<string, unknown> = { details: nextDetails };
  if (kind === "teacher") {
    registrationPatch.contact_email = newEmail;
    if (name) registrationPatch.contact_name = name;
    registrationPatch.owner_id = profileId;
    registrationPatch.onboarded_at = profileId
      ? ((reg.onboarded_at as string | null) ?? new Date().toISOString())
      : null;
    registrationPatch.verify_token = verifyToken;
    registrationPatch.verify_token_expires_at = verifyExpires;
  }

  const { error: regError } = await supabase
    .from("registrations")
    .update(registrationPatch)
    .eq("id", registrationId);
  if (regError) return { ok: false, message: "Could not update the registration email." };

  if (schoolId) {
    const { error: memberError } = await supabase.from("school_members").upsert(
      {
        school_id: schoolId,
        email: newEmail,
        full_name: name,
        status: "approved",
        profile_id: profileId,
        verify_token: verifyToken,
        verify_token_expires_at: verifyExpires,
        onboarded_at: profileId ? new Date().toISOString() : null,
      },
      { onConflict: "school_id,email" },
    );
    if (memberError) {
      return { ok: false, message: "The registration was updated, but school access could not be moved." };
    }

    const old = oldEmail.toLowerCase();
    const other = otherEmail.toLowerCase();
    if (old && old !== newEmail && old !== other) {
      await supabase
        .from("school_members")
        .delete()
        .eq("school_id", schoolId)
        .ilike("email", old);
    }
  }

  if (!profileId && verifyToken) {
    await sendEmailSafely(
      buildActivationEmail({
        email: newEmail,
        name,
        schoolFullName:
          ((reg.schools as unknown as { name: string | null } | null)?.name) ??
          "your school",
        verifyToken,
        claimCode: kind === "teacher" ? ((reg.claim_code as string | null) ?? null) : null,
      }),
    );
  }

  revalidatePath("/portal/admin/registrations");
  revalidatePath(`/portal/admin/registrations/${registrationId}`);
  revalidatePath("/portal/admin/schools");
  return {
    ok: true,
    message: profileId
      ? `${newEmail} is now linked to this school.`
      : `${newEmail} was saved and sent a fresh activation link.`,
  };
}

// Backfill the roster for an already-approved school — for schools verified
// before roster-at-approval existed, or after reps were edited. ensureRoster
// uses the service-role client (bypasses RLS), so gate explicitly on admin.
export async function syncRoster(registrationId: string) {
  if (!(await requireManage("participants"))) return;
  const supabase = await createClient();
  const { data: reg } = await supabase
    .from("registrations")
    .select("school_id, edition_year, reps, status")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg || reg.status !== "verified") return;
  if (!(await isEditableEdition(supabase, reg.edition_year as number))) return;
  await ensureRoster({
    school_id: (reg.school_id as string | null) ?? null,
    edition_year: reg.edition_year as number,
    reps: reg.reps,
  });
  revalidatePath("/portal/admin/participants");
}

// Issue a certificate from the participant hub. A blank student_id = a
// school-wide certificate (the original behaviour); a student_id = an
// individual rep's certificate. Notifies the coordinator either way.
export async function issueCertificate(
  registrationId: string,
  formData: FormData,
) {
  if (!(await requireManage("participants"))) return;
  const type = String(formData.get("type") ?? "").trim();
  const assetUrl = String(formData.get("asset_url") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "").trim() || null;
  if (!type) return;

  const supabase = await createClient();
  if (!(await isEditableRegistration(supabase, registrationId))) return;
  // RLS (cert_admin_write) restricts inserts to admins.
  await supabase.from("certificates").insert({
    registration_id: registrationId,
    student_id: studentId,
    type,
    asset_url: assetUrl || null,
  });

  // Name the student on a per-student cert so the coordinator's notice is clear.
  let who = "";
  if (studentId) {
    const { data: st } = await supabase
      .from("students")
      .select("name")
      .eq("id", studentId)
      .maybeSingle();
    who = st?.name ? ` for ${st.name}` : "";
  }
  const { data: reg } = await supabase
    .from("registrations")
    .select("owner_id")
    .eq("id", registrationId)
    .maybeSingle();
  const owner = (reg?.owner_id as string | null) ?? null;
  if (owner) {
    await supabase.from("notifications").insert({
      profile_id: owner,
      title: "Certificate issued",
      body: `A "${type}" certificate${who} is now available to download.`,
      link: "/portal",
    });
  }
  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/student");
  revalidatePath("/portal/school");
}

// ── Participant hub: per-student advancement ────────────────────────────────
// Mirror of bulkStageOutcome, one level down. Records a single rep's outcome +
// optional score/note at a stage. RLS (student_stage_results_admin_write) limits
// the upsert to admins. No per-student notification (visible on dashboards) —
// coordinators are notified on the school-level milestones instead.
export async function advanceStudent(studentId: string, formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const stage = String(formData.get("stage") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "");
  if (!stage || !["advanced", "eliminated", "pending"].includes(outcome)) return;
  const scoreRaw = String(formData.get("score") ?? "").trim();
  const scoreNum = scoreRaw === "" ? null : Number(scoreRaw);
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  if (!(await isEditableStudent(supabase, studentId))) return;
  // The conflict target must name all three key columns (student_id, stage,
  // edition_year) — see 20260909090000. Naming only the first two raised 42P10
  // and this `if (error) return;` swallowed it, so per-rep scores silently
  // never landed.
  const { data: student } = await supabase
    .from("students")
    .select("edition_year")
    .eq("id", studentId)
    .maybeSingle();
  const { error } = await supabase.from("student_stage_results").upsert(
    {
      student_id: studentId,
      stage,
      edition_year: (student?.edition_year as number | null) ?? null,
      outcome,
      score: scoreNum != null && !Number.isNaN(scoreNum) ? scoreNum : null,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,stage,edition_year" },
  );
  if (error) return;
  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/student");
  revalidatePath("/portal/school");
}

// ── Participant hub: cascade advancement ────────────────────────────────────
// "Advance school + all reps" (includeSchool=true) marks the school AND every
// active rep at a stage; "Advance all reps" (false) sweeps just the roster. The
// school-level upsert also drives resource-tier unlocks (see resource-access.ts).
// Both notify the school once. Individual overrides afterwards via advanceStudent.
async function cascadeAdvance(
  registrationId: string,
  stage: string,
  outcome: "advanced" | "eliminated",
  includeSchool: boolean,
) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: reg } = await supabase
    .from("registrations")
    .select("id, edition_year, owner_id, school_id, schools(name)")
    .eq("id", registrationId)
    .maybeSingle();
  const schoolId = (reg?.school_id as string | null) ?? null;
  if (!reg || !schoolId) return;
  if (!(await isEditableEdition(supabase, reg.edition_year as number))) return;

  const { data: students } = await supabase
    .from("students")
    .select("id")
    .eq("school_id", schoolId)
    .is("deactivated_at", null);
  const studentIds = ((students ?? []) as { id: string }[]).map((s) => s.id);

  if (includeSchool) {
    await supabase.from("registration_stage_results").upsert(
      { registration_id: reg.id, stage, outcome, updated_at: now },
      { onConflict: "registration_id,stage" },
    );
  }
  if (studentIds.length) {
    // Keyed by the COMPETITION's edition (reg.edition_year), not each rep's own
    // tag — the row records "this rep's outcome at this stage of this edition".
    // Outcome-only: score/score_max/breakdown are deliberately absent so a
    // cascade can never wipe a rep's paper-exam score.
    await supabase.from("student_stage_results").upsert(
      studentIds.map((sid) => ({
        student_id: sid,
        stage,
        edition_year: (reg.edition_year as number | null) ?? null,
        outcome,
        updated_at: now,
      })),
      { onConflict: "student_id,stage,edition_year" },
    );
  }

  const schoolName =
    ((reg.schools as unknown as { name: string | null } | null)?.name) ?? "Your school";
  const past = outcome === "advanced" ? "advanced past" : "did not advance past";
  await notifySchool(supabase, schoolId, (reg.owner_id as string | null) ?? null, {
    title: outcome === "advanced" ? `Advanced past ${stage}` : `${stage} result`,
    body: includeSchool
      ? `${schoolName} and its reps ${past} the ${stage} in the ${reg.edition_year} competition.`
      : `The reps of ${schoolName} ${past} the ${stage} in the ${reg.edition_year} competition.`,
    link: "/portal/school",
  });

  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/school");
  revalidatePath("/portal/student");
  revalidatePath("/portal");
}

// Cascade advancement, driven by a single `op` from a confirming button:
//   advance-all / eliminate-all   → the school AND every rep
//   advance-reps / eliminate-reps → the reps only (school standing unchanged)
export async function cascadeAdvanceAction(registrationId: string, formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const stage = String(formData.get("stage") ?? "").trim();
  const op = String(formData.get("op") ?? "");
  const outcome = op.startsWith("advance")
    ? "advanced"
    : op.startsWith("eliminate")
      ? "eliminated"
      : null;
  if (!stage || !outcome) return;
  await cascadeAdvance(registrationId, stage, outcome, op.endsWith("-all"));
}

// Undo an advancement — "bring a school back". Clears the school's (and its
// reps') stage results at `from_stage` and every stage after it, so the school
// returns to be re-decided at that stage. Fixes a mistaken advance without
// leaving stale downstream results. RLS (admin_write, for all) gates the deletes.
export async function sendSchoolBack(registrationId: string, formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const fromStage = String(formData.get("from_stage") ?? "").trim();
  if (!fromStage) return;

  const supabase = await createClient();
  const { data: reg } = await supabase
    .from("registrations")
    .select("id, edition_year, school_id")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg) return;
  if (!(await isEditableEdition(supabase, reg.edition_year as number))) return;

  const { data: ed } = await supabase
    .from("editions")
    .select("stages")
    .eq("year", reg.edition_year)
    .maybeSingle();
  const stages = (ed?.stages as string[] | null) ?? [];
  const fromIdx = stages.indexOf(fromStage);
  if (fromIdx < 0) return;
  const toClear = stages.slice(fromIdx); // from_stage and everything after it

  // A score is a MEASUREMENT; an outcome is a DECISION. Sending a school back
  // undoes the decision, so a row that carries a score (a paper-exam result, a
  // match result) is reset to `pending` and keeps its score/score_max — only
  // rows with nothing measured are deleted. Deleting everything, as this used
  // to, threw away hundreds of scanned exam scores to correct one advancement.
  await supabase
    .from("registration_stage_results")
    .update({ outcome: "pending", note: null, reason: null, updated_at: new Date().toISOString() })
    .eq("registration_id", registrationId)
    .in("stage", toClear)
    .not("score", "is", null);
  await supabase
    .from("registration_stage_results")
    .delete()
    .eq("registration_id", registrationId)
    .in("stage", toClear)
    .is("score", null);

  // Preserve tournament history while removing the affected artifacts from the
  // live bracket/boards.
  await supabase
    .from("tournament_group_entries")
    .update({ advance_override: false, note: "Superseded by correction", updated_at: new Date().toISOString() })
    .eq("registration_id", registrationId);
  await supabase
    .from("tournament_matches")
    .update({
      status: "cancelled",
      superseded_at: new Date().toISOString(),
      note: "Superseded by correction",
      updated_at: new Date().toISOString(),
    })
    .or(
      `team_a_registration_id.eq.${registrationId},team_b_registration_id.eq.${registrationId},winner_registration_id.eq.${registrationId}`,
    )
    .in("stage", toClear);

  // Bring the reps back too (a no-op for stages they were never marked at).
  const schoolId = (reg.school_id as string | null) ?? null;
  if (schoolId) {
    const { data: sts } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", schoolId)
      .is("deactivated_at", null);
    const ids = ((sts ?? []) as { id: string }[]).map((s) => s.id);
    if (ids.length) {
      // Same measurement/decision split as the school rows above: a rep who
      // sat the paper exam keeps their score and subject breakdown, and only
      // the outcome is rolled back to pending.
      await supabase
        .from("student_stage_results")
        .update({ outcome: "pending", note: null, updated_at: new Date().toISOString() })
        .in("student_id", ids)
        .in("stage", toClear)
        .not("score", "is", null);
      await supabase
        .from("student_stage_results")
        .delete()
        .in("student_id", ids)
        .in("stage", toClear)
        .is("score", null);
    }
  }

  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/school");
  revalidatePath("/portal/student");
  revalidatePath("/portal");
}

function numberOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function qualificationReason(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return QUALIFICATION_REASONS.includes(raw as QualificationReason) ? raw : null;
}

async function markSchoolAndReps(
  registrationId: string,
  stage: string,
  outcome: "advanced" | "eliminated" | "pending",
  extras: { score?: number | null; note?: string | null; reason?: string | null } = {},
) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: reg } = await supabase
    .from("registrations")
    .select("id, school_id, edition_year")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg) return;
  if (!(await isEditableEdition(supabase, reg.edition_year as number))) return;

  await supabase.from("registration_stage_results").upsert(
    {
      registration_id: registrationId,
      stage,
      outcome,
      score: extras.score ?? null,
      note: extras.note ?? null,
      reason: extras.reason ?? null,
      updated_at: now,
    },
    { onConflict: "registration_id,stage" },
  );

  const schoolId = (reg.school_id as string | null) ?? null;
  if (!schoolId) return;
  const { data: students } = await supabase
    .from("students")
    .select("id")
    .eq("school_id", schoolId)
    .is("deactivated_at", null);
  const ids = ((students ?? []) as { id: string }[]).map((s) => s.id);
  if (ids.length) {
    // Outcome-only fan-out. `score` is deliberately NOT in this payload: the
    // school-level decision carries the SCHOOL's score, and writing it (or
    // null) down to each rep would erase per-rep scores — which is exactly
    // what a paper-exam import publishes. A rep's score is written only by
    // advanceStudent or a paper-exam commit.
    await supabase.from("student_stage_results").upsert(
      ids.map((student_id) => ({
        student_id,
        stage,
        edition_year: (reg.edition_year as number | null) ?? null,
        outcome,
        note: extras.reason ?? extras.note ?? null,
        updated_at: now,
      })),
      { onConflict: "student_id,stage,edition_year" },
    );
  }
}

// ── zonal exam centres ──────────────────────────────────────────────────────
// Both controls that write registrations.qualification_zone go through
// writeCentres, so there is exactly one rulebook for this column. That matters:
// when the centre was a field on the qualification score form, saving a score
// copied whatever the row happened to be displaying into the column — including
// the school's LGA when it had not answered the registration question — which is
// how ~780 rows came to hold LGAs and divisions instead of centres.

/**
 * Apply centre allocations. Returns how many rows actually changed.
 *
 * p_allowed is the exact set this request may write: the eight real centres plus
 * anything deliberately typed into the escape hatch. The RPC keeps no list of its
 * own, because duplicating ZONAL_FINALS_OPTIONS across TypeScript and SQL is the
 * drift that let LGAs into this column to begin with. An empty zone clears.
 */
async function writeCentres(rows: { id: string; zone: string }[]) {
  const supabase = await createClient();
  const allowed = [...new Set([...ZONAL_FINALS_OPTIONS, ...rows.map((r) => r.zone)])].filter(Boolean);
  const { data, error } = await supabase.rpc("allocate_qualification_zones", {
    p_rows: rows,
    p_allowed: allowed,
  });
  if (!error) {
    revalidatePath("/portal/admin/participants");
    revalidatePath("/portal/school");
  }
  return { changed: typeof data === "number" ? data : 0, error };
}

/**
 * Read one CentrePicker's pair of fields into a value to store.
 *
 * The dropdown wins; the text box is a fallback that only carries a value when the
 * dropdown was deliberately left unallocated. Returns null for a dropdown value
 * outside the eight, which means a tampered payload rather than a choice.
 */
function readCentre(selected: string, typed: string): string | null {
  if (!selected) return typed.trim().slice(0, 80);
  return (ZONAL_FINALS_OPTIONS as readonly string[]).includes(selected) ? selected : null;
}

/**
 * Allocate exam centres for a whole edition in one go.
 *
 * The form pre-selects each school's own registration choice, so submitting it
 * unchanged confirms every request at once; changing individual dropdowns first is
 * how you rebalance an over-subscribed centre. The row count comes back so the
 * screen can tell work apart from a no-op — without it, an RPC that is missing or
 * refuses every row looks exactly like a successful save.
 */
export async function allocateQualificationZonesBulk(
  _prev: CentreSaveState,
  formData: FormData,
): Promise<CentreSaveState> {
  if (!(await requireManage("participants"))) {
    return { ok: false, message: "You have view-only access to participants." };
  }

  // The dropdown submits zone:<id>, the escape hatch zoneOther:<id>.
  const chosen = new Map<string, string>();
  const typed = new Map<string, string>();
  for (const [key, value] of formData.entries()) {
    const text = String(value ?? "").trim();
    if (key.startsWith("zone:")) chosen.set(key.slice("zone:".length), text);
    else if (key.startsWith("zoneOther:")) typed.set(key.slice("zoneOther:".length), text);
  }

  const rows: { id: string; zone: string }[] = [];
  for (const [id, selected] of chosen) {
    if (!id) continue;
    const zone = readCentre(selected, typed.get(id) ?? "");
    if (zone === null) continue;
    rows.push({ id, zone });
  }
  if (rows.length === 0) return { ok: false, message: "Nothing to save." };

  const { changed, error } = await writeCentres(rows);
  if (error) return { ok: false, message: `Could not save centres: ${error.message}` };
  return {
    ok: true,
    message:
      changed === 0
        ? `No change — all ${rows.length} schools already sit where the form showed them.`
        : `Moved ${changed} of ${rows.length} school${rows.length === 1 ? "" : "s"}.`,
  };
}

/**
 * Allocate (or clear) one school's zonal exam centre.
 *
 * Deliberately its own action rather than a field on the qualification form: the
 * centre is decided before the exam and entering a score afterwards must never
 * move it. HTML forbids nested forms, so it is a sibling form, not a field.
 */
export async function allocateQualificationZone(registrationId: string, formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const zone = readCentre(
    String(formData.get("zone") ?? "").trim(),
    String(formData.get("zoneOther") ?? ""),
  );
  if (zone === null) return;
  await writeCentres([{ id: registrationId, zone }]);
}

export async function saveQualificationDecision(registrationId: string, formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const outcome = String(formData.get("outcome") ?? "");
  if (!["advanced", "eliminated", "pending"].includes(outcome)) return;
  const score = numberOrNull(formData.get("score"));
  const reason = qualificationReason(formData.get("reason"));
  const note = textOrNull(formData.get("note"));

  // Deliberately does NOT touch qualification_zone. The exam centre is the school's
  // choice at registration, or an explicit admin allocation — never a side effect of
  // entering a score. Writing it here is how ~780 rows ended up holding an LGA.
  await markSchoolAndReps(registrationId, "Qualifications", outcome as "advanced" | "eliminated" | "pending", {
    score,
    reason,
    note,
  });
  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/school");
  revalidatePath("/portal/student");
}

export async function createTournamentGroup(formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const editionYear = Number(formData.get("edition_year"));
  const name = String(formData.get("name") ?? "").trim();
  const advanceCount = Number(formData.get("advance_count") ?? 2);
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  if (!Number.isInteger(editionYear) || !name) return;
  const supabase = await createClient();
  if (!(await isEditableEdition(supabase, editionYear))) return;
  await supabase.from("tournament_groups").upsert(
    {
      edition_year: editionYear,
      stage: "Grand Finale Group Stage",
      name,
      advance_count: Number.isFinite(advanceCount) ? advanceCount : 2,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "edition_year,stage,name" },
  );
  revalidatePath("/portal/admin/participants");
}

export async function assignGroupEntry(formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const groupId = String(formData.get("group_id") ?? "").trim();
  const registrationId = String(formData.get("registration_id") ?? "").trim();
  const seed = numberOrNull(formData.get("seed"));
  if (!groupId || !registrationId) return;
  const supabase = await createClient();
  if (!(await isEditableGroup(supabase, groupId))) return;
  if (!(await isEditableRegistration(supabase, registrationId))) return;
  await supabase.from("tournament_group_entries").upsert(
    {
      group_id: groupId,
      registration_id: registrationId,
      seed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "registration_id" },
  );
  await markSchoolAndReps(registrationId, "Qualifications", "advanced", {
    reason: "Manual Selection",
    note: "Assigned to Grand Finale Group Stage",
  });
  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/school");
  revalidatePath("/portal/student");
}

export async function updateGroupEntry(entryId: string, formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const overrideRaw = String(formData.get("advance_override") ?? "");
  const advanceOverride =
    overrideRaw === "advance" ? true : overrideRaw === "hold" ? false : null;
  const supabase = await createClient();
  if (!(await isEditableGroupEntry(supabase, entryId))) return;
  await supabase
    .from("tournament_group_entries")
    .update({
      rank: numberOrNull(formData.get("rank")),
      score: numberOrNull(formData.get("score")),
      note: textOrNull(formData.get("note")),
      advance_override: advanceOverride,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);
  revalidatePath("/portal/admin/participants");
}

export async function advanceGroupEntries(groupId: string) {
  if (!(await requireManage("participants"))) return;
  const supabase = await createClient();
  if (!(await isEditableGroup(supabase, groupId))) return;
  const { data: group } = await supabase
    .from("tournament_groups")
    .select("id, advance_count")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return;
  const { data } = await supabase
    .from("tournament_group_entries")
    .select("registration_id, rank, advance_override")
    .eq("group_id", groupId);
  const rows = (data ?? []) as {
    registration_id: string;
    rank: number | null;
    advance_override: boolean | null;
  }[];
  const advanceCount = Number(group.advance_count ?? 0);
  for (const row of rows) {
    const autoAdvanced =
      row.rank != null && advanceCount > 0 && row.rank <= advanceCount;
    const advanced = row.advance_override ?? autoAdvanced;
    await markSchoolAndReps(
      row.registration_id,
      "Grand Finale Group Stage",
      advanced ? "advanced" : "eliminated",
      { note: advanced ? "Advanced from group stage" : "Did not advance from group stage" },
    );
  }
  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/school");
  revalidatePath("/portal/student");
}

export async function createTournamentMatch(formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const editionYear = Number(formData.get("edition_year"));
  const stage = String(formData.get("stage") ?? "").trim();
  const kind = String(formData.get("kind") ?? "knockout").trim();
  const teamA = textOrNull(formData.get("team_a_registration_id"));
  const teamB = textOrNull(formData.get("team_b_registration_id"));
  if (!Number.isInteger(editionYear) || !stage || !["knockout", "face_off", "bye"].includes(kind)) return;
  const supabase = await createClient();
  if (!(await isEditableEdition(supabase, editionYear))) return;
  if (teamA && !(await isEditableRegistration(supabase, teamA))) return;
  if (teamB && !(await isEditableRegistration(supabase, teamB))) return;
  await supabase.from("tournament_matches").insert({
    edition_year: editionYear,
    stage,
    kind,
    team_a_registration_id: teamA,
    team_b_registration_id: kind === "bye" ? null : teamB,
    status: kind === "bye" ? "completed" : "scheduled",
    winner_registration_id: kind === "bye" ? teamA : null,
    slot: numberOrNull(formData.get("slot")),
    scheduled_at: textOrNull(formData.get("scheduled_at")),
    venue: textOrNull(formData.get("venue")),
    note: textOrNull(formData.get("note")),
  });
  if (kind === "bye" && teamA) {
    await markSchoolAndReps(teamA, stage, "advanced", {
      note: "Advanced directly to the next round",
    });
  }
  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/school");
  revalidatePath("/portal/student");
}

export async function recordMatchResult(matchId: string, formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const status = String(formData.get("status") ?? "completed") as TournamentMatchStatus;
  if (!["scheduled", "in_progress", "completed", "needs_face_off", "cancelled"].includes(status)) return;
  const winner = textOrNull(formData.get("winner_registration_id"));
  const supabase = await createClient();
  if (!(await isEditableMatch(supabase, matchId))) return;
  const { data: match } = await supabase
    .from("tournament_matches")
    .select("id, stage, team_a_registration_id, team_b_registration_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return;
  await supabase
    .from("tournament_matches")
    .update({
      team_a_score: numberOrNull(formData.get("team_a_score")),
      team_b_score: numberOrNull(formData.get("team_b_score")),
      winner_registration_id: winner,
      status,
      note: textOrNull(formData.get("note")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);
  if (status === "completed" && winner) {
    await markSchoolAndReps(winner, match.stage as string, "advanced", {
      note: "Recorded as match winner",
    });
    const loser =
      winner === match.team_a_registration_id
        ? (match.team_b_registration_id as string | null)
        : (match.team_a_registration_id as string | null);
    if (loser) {
      await markSchoolAndReps(loser, match.stage as string, "eliminated", {
        note: "Did not advance from match",
      });
    }
  }
  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/school");
  revalidatePath("/portal/student");
}

export async function issueIndividualAward(formData: FormData) {
  if (!(await requireManage("participants"))) return;
  const editionYear = Number(formData.get("edition_year"));
  const studentId = String(formData.get("student_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!Number.isInteger(editionYear) || !studentId || !title) return;
  const supabase = await createClient();
  if (!(await isEditableEdition(supabase, editionYear))) return;
  if (!(await isEditableStudent(supabase, studentId))) return;
  const { data: student } = await supabase
    .from("students")
    .select("school_id")
    .eq("id", studentId)
    .maybeSingle();
  let registrationId: string | null = null;
  if (student?.school_id) {
    const { data: reg } = await supabase
      .from("registrations")
      .select("id")
      .eq("school_id", student.school_id)
      .eq("edition_year", editionYear)
      .maybeSingle();
    registrationId = (reg?.id as string | null) ?? null;
  }
  await supabase.from("individual_awards").insert({
    edition_year: editionYear,
    student_id: studentId,
    registration_id: registrationId,
    stage: textOrNull(formData.get("stage")),
    title,
    note: textOrNull(formData.get("note")),
  });
  revalidatePath("/portal/admin/participants");
  revalidatePath("/portal/school");
  revalidatePath("/portal/student");
}
