"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { loadActingEntry } from "@/lib/acting-school-data";

type Db = Awaited<ReturnType<typeof createClient>>;

const EDITION = Number(process.env.ASC_EDITION_YEAR) || 2026;

// The school being acted for; a member with no visible entry falls back to
// their approved membership.
async function mySchoolId(supabase: Db): Promise<string | null> {
  const { entry } = await loadActingEntry();
  if (entry?.school_id) return entry.school_id;
  const { data } = await supabase
    .from("school_members")
    .select("school_id")
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  return (data?.school_id as string) ?? null;
}

export async function createPlan(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const level = String(formData.get("level") ?? "").trim() || null;

  const supabase = await createClient();
  const schoolId = await mySchoolId(supabase);
  if (!schoolId) return;

  const { data } = await supabase
    .from("learning_plans")
    .insert({ title, subject, level, school_id: schoolId, edition_year: EDITION, scope: "school" })
    .select("id")
    .single();
  revalidatePath("/portal/school/plans");
  if (data?.id) redirect(`/portal/school/plans/${data.id}`);
}

export async function togglePlanPublished(id: string, published: boolean) {
  const supabase = await createClient();
  await supabase.from("learning_plans").update({ published }).eq("id", id);
  revalidatePath(`/portal/school/plans/${id}`);
}

export async function deletePlan(id: string) {
  const supabase = await createClient();
  await supabase.from("learning_plans").delete().eq("id", id);
  revalidatePath("/portal/school/plans");
  redirect("/portal/school/plans");
}

export async function addModule(planId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const dueRaw = String(formData.get("due_date") ?? "").trim();
  const supabase = await createClient();
  const { count } = await supabase
    .from("plan_modules")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId);
  await supabase.from("plan_modules").insert({
    plan_id: planId,
    title,
    position: count ?? 0,
    due_date: dueRaw || null,
  });
  revalidatePath(`/portal/school/plans/${planId}`);
}

export async function deleteModule(id: string, planId: string) {
  const supabase = await createClient();
  await supabase.from("plan_modules").delete().eq("id", id);
  revalidatePath(`/portal/school/plans/${planId}`);
}

export async function addItem(moduleId: string, planId: string, formData: FormData) {
  const itemType = String(formData.get("item_type") ?? "note");
  const title = String(formData.get("title") ?? "").trim() || null;
  const assessmentId = String(formData.get("assessment_id") ?? "").trim() || null;
  const resourceId = String(formData.get("resource_id") ?? "").trim() || null;
  const externalUrl = String(formData.get("external_url") ?? "").trim() || null;
  const noteMd = String(formData.get("note_md") ?? "").trim() || null;
  const required = String(formData.get("required") ?? "") === "on";

  const supabase = await createClient();
  const { count } = await supabase
    .from("plan_module_items")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId);
  await supabase.from("plan_module_items").insert({
    module_id: moduleId,
    position: count ?? 0,
    item_type: itemType,
    assessment_id: itemType === "assessment" ? assessmentId : null,
    resource_id: itemType === "material" ? resourceId : null,
    external_url: itemType === "link" ? externalUrl : null,
    note_md: itemType === "note" ? noteMd : null,
    title,
    required,
  });
  revalidatePath(`/portal/school/plans/${planId}`);
}

export async function deleteItem(id: string, planId: string) {
  const supabase = await createClient();
  await supabase.from("plan_module_items").delete().eq("id", id);
  revalidatePath(`/portal/school/plans/${planId}`);
}

export async function assignByLevel(planId: string, formData: FormData) {
  const level = String(formData.get("level") ?? "").trim() || null;
  const supabase = await createClient();
  const schoolId = await mySchoolId(supabase);
  if (!schoolId) return;
  await supabase.from("plan_assignments").insert({
    plan_id: planId,
    edition_year: EDITION,
    assignee_type: "level",
    school_id: schoolId,
    level,
  });
  revalidatePath(`/portal/school/plans/${planId}`);
}

export async function assignStudent(planId: string, studentId: string) {
  const supabase = await createClient();
  const schoolId = await mySchoolId(supabase);
  if (!schoolId) return;
  await supabase.from("plan_assignments").insert({
    plan_id: planId,
    edition_year: EDITION,
    assignee_type: "student",
    school_id: schoolId,
    student_id: studentId,
  });
  revalidatePath(`/portal/school/plans/${planId}`);
}

export async function removeAssignment(id: string, planId: string) {
  const supabase = await createClient();
  await supabase.from("plan_assignments").delete().eq("id", id);
  revalidatePath(`/portal/school/plans/${planId}`);
}
