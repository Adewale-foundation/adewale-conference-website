"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { requireManage } from "@/supabase/auth";

export async function approveMembership(memberId: string) {
  if (!(await requireManage("registrations"))) return;
  const supabase = await createClient();
  // RLS (members_admin_all) restricts this to admins. The one-school-per-educator
  // trigger refuses an email already approved at another school; say so rather
  // than notifying them of access they didn't get.
  const { error } = await supabase
    .from("school_members")
    .update({ status: "approved" })
    .eq("id", memberId);
  if (error) redirect(backTo("/portal/admin/schools", { error: error.message }));

  // Notify the coordinator (if they already have an account).
  const { data: m } = await supabase
    .from("school_members")
    .select("profile_id, schools(name)")
    .eq("id", memberId)
    .maybeSingle();
  const pid = (m?.profile_id as string | null) ?? null;
  if (pid) {
    // Approved members are coordinators — same promotion the claim-code flow
    // does (profiles_admin_update RLS lets admins do this).
    await supabase
      .from("profiles")
      .update({ role: "coordinator" })
      .eq("id", pid)
      .eq("role", "student");
    const schoolName =
      (m?.schools as unknown as { name: string | null } | null)?.name ??
      "your school";
    await supabase.from("notifications").insert({
      profile_id: pid,
      title: "School access approved",
      body: `You can now manage ${schoolName} in the portal.`,
      link: "/portal/school",
    });
  }
  revalidatePath("/portal/admin/schools");
}

export async function rejectMembership(memberId: string) {
  if (!(await requireManage("registrations"))) return;
  const supabase = await createClient();
  await supabase.from("school_members").delete().eq("id", memberId);
  revalidatePath("/portal/admin/schools");
}

// ── school records ──────────────────────────────────────────────────────────
// Until now there was no way to correct a school from the portal at all — a
// misspelled name needed a script. These two actions plus the duplicates view are
// what make that unnecessary.

/** Where to send the admin back to, with a message they will actually see. */
function backTo(path: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `${path}${search.toString() ? `?${search}` : ""}`;
}

export async function updateSchool(formData: FormData) {
  if (!(await requireManage("registrations"))) return;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const lga = String(formData.get("lga") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "/portal/admin/schools");
  if (!id || !name) {
    redirect(backTo(returnTo, { error: "A school needs a name." }));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("schools")
    .update({
      name,
      lga: lga || null,
      category: category || null,
      email: email || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    // 23505 = schools_norm_name_key. Two schools cannot share a name once
    // punctuation, case and spacing are normalized away, so this is almost always
    // the admin renaming one school onto another — which is a merge, not a rename.
    const message =
      error.code === "23505"
        ? `Another school is already called "${name}" (ignoring punctuation and case). ` +
          `If they are the same school, merge them instead.`
        : `Could not update the school: ${error.message}`;
    redirect(backTo(returnTo, { error: message }));
  }

  revalidatePath("/portal/admin/schools");
  redirect(backTo(returnTo, { notice: `Updated ${name}.` }));
}

export async function mergeSchools(formData: FormData) {
  if (!(await requireManage("registrations"))) return;

  const survivorId = String(formData.get("survivorId") ?? "");
  const absorbedId = String(formData.get("absorbedId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/portal/admin/schools/duplicates");
  if (!survivorId || !absorbedId || survivorId === absorbedId) {
    redirect(backTo(returnTo, { error: "Pick two different schools to merge." }));
  }

  const supabase = await createClient();
  // One transaction inside public.merge_schools: registrations, members, students,
  // plans and requests all move, or none do. Doing it here in steps could delete a
  // school with children still pointing at it.
  const { data, error } = await supabase.rpc("merge_schools", {
    p_survivor: survivorId,
    p_absorbed: absorbedId,
  });

  if (error) {
    redirect(backTo(returnTo, { error: `Merge failed: ${error.message}` }));
  }

  const result = (data ?? {}) as {
    survivor_name?: string;
    absorbed_name?: string;
    moved_registrations?: number;
    moved_students?: number;
    dropped_members?: number;
    deactivated_students?: number;
  };
  revalidatePath("/portal/admin/schools");
  revalidatePath("/portal/admin/schools/duplicates");
  redirect(
    backTo(returnTo, {
      notice:
        `Merged "${result.absorbed_name ?? "school"}" into "${result.survivor_name ?? "school"}" — ` +
        `${result.moved_registrations ?? 0} registration(s) and ${result.moved_students ?? 0} student(s) moved` +
        (result.dropped_members ? `, ${result.dropped_members} duplicate coordinator(s) removed` : "") +
        (result.deactivated_students ? `, ${result.deactivated_students} duplicate student(s) deactivated` : "") +
        ".",
    }),
  );
}
