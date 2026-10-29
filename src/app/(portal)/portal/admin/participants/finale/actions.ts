"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/supabase/server";
import { requireManage } from "@/supabase/auth";
import { lagosInputToIso } from "@/lib/camp";
import { FINALE_BASE, TEAM_COLORS, cleanText, teamSlug, validPledgeUrl, validateResults } from "@/lib/finale";
import { loadCampRoster } from "@/lib/camp-data";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";
import type { FinalePublicStatus, FinaleTeamColor } from "@/supabase/types";

const denied: ActionResult = { ok: false, error: "You have read-only access to participants." };
const ADMIN_PATH = "/portal/admin/participants/finale";

function refresh() {
  revalidatePath(ADMIN_PATH);
  revalidatePath(FINALE_BASE, "layout");
}

const idOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return /^[0-9a-f-]{36}$/.test(s) ? s : null;
};

// Writes here run on the admin's own session, so RLS (participants manage)
// backs up requireManage rather than the service role bypassing it.

export async function saveFinaleSettings(year: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const rewardCount = Number(formData.get("reward_count"));
  if (!Number.isInteger(rewardCount) || rewardCount < 1 || rewardCount > 500) {
    return { ok: false, error: "The number of prize winners must be between 1 and 500." };
  }
  const rewardText = cleanText(formData.get("reward_text"));
  if (rewardText.length > 500) return { ok: false, error: "Keep the prize description to 500 characters." };
  const pledgeUrl = String(formData.get("pledge_url") ?? "").trim();
  if (pledgeUrl && !validPledgeUrl(pledgeUrl)) {
    return { ok: false, error: "The pledge link must be a Paystack Payment Page, like https://paystack.shop/pay/your-page." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("finale_settings").upsert({
    edition_year: year,
    is_open: formData.get("is_open") === "on",
    closes_at: lagosInputToIso(String(formData.get("closes_at") ?? "")),
    reward_count: rewardCount,
    reward_text: rewardText || null,
    pledge_url: pledgeUrl || null,
    updated_by: admin.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  refresh();
  return { ok: true, message: "Fan vote settings saved." };
}

export async function saveFinaleResults(year: number, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const supabase = await createClient();
  const { data: teams, error: teamsError } = await supabase.from("finale_teams").select("id, semi").eq("edition_year", year);
  if (teamsError) return { ok: false, error: `Could not load teams: ${teamsError.message}` };

  const results = {
    semi1_winner_id: idOrNull(formData.get("semi1_winner_id")),
    semi2_winner_id: idOrNull(formData.get("semi2_winner_id")),
    champion_team_id: idOrNull(formData.get("champion_team_id")),
  };
  const checked = validateResults(results, (teams ?? []) as { id: string; semi: 1 | 2 }[]);
  if (!checked.ok) return checked;

  const { data, error } = await supabase
    .from("finale_settings")
    .update({ ...results, updated_by: admin.user.id, updated_at: new Date().toISOString() })
    .eq("edition_year", year)
    .select("edition_year");
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  if (!data?.length) return { ok: false, error: "Save the fan vote settings first." };
  refresh();
  return { ok: true, message: results.champion_team_id ? "Champion recorded. Joining is closed and the pledge link is hidden." : "Results saved." };
}

export async function saveFinaleTeam(
  year: number,
  teamId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  const registrationId = String(formData.get("registration_id") ?? "");
  const semi = Number(formData.get("semi"));
  const sort = Number(formData.get("sort") ?? 0);
  const color = String(formData.get("color") ?? "");
  if (semi !== 1 && semi !== 2) return { ok: false, error: "Choose the team's semi-final." };
  if (!Object.hasOwn(TEAM_COLORS, color)) return { ok: false, error: "Choose a colour." };
  const label = cleanText(formData.get("label"));
  if (label.length > 60) return { ok: false, error: "Keep the label to 60 characters." };
  const pledgedRaw = String(formData.get("pledged") ?? "").replace(/[,\s₦]/g, "");
  if (pledgedRaw && !/^\d{1,9}$/.test(pledgedRaw)) return { ok: false, error: "Enter the amount pledged in whole naira." };

  const supabase = await createClient();
  // The school must be one of this edition's camp schools; its id comes from the form.
  const { rows, error: rosterError } = await loadCampRoster(supabase, year);
  if (rosterError) return { ok: false, error: `Could not load the camp schools: ${rosterError}` };
  const school = rows.find((r) => r.registrationId === registrationId);
  if (!school) return { ok: false, error: "Choose the school from the list." };
  const name = cleanText(formData.get("name")) || school.schoolName;
  if (name.length > 60) return { ok: false, error: "That school's name is long: add a shorter display name (up to 60 characters)." };

  const row = {
    registration_id: registrationId,
    name,
    semi,
    sort: Number.isInteger(sort) ? sort : 0,
    color: color as FinaleTeamColor,
    label: label || null,
    pledged: pledgedRaw ? Number(pledgedRaw) : null,
    updated_at: new Date().toISOString(),
  };
  const conflict = (error: { code?: string; message: string }, verb: string) =>
    error.code === "23505"
      ? "Another team already uses that school or a name with the same link. Change the display name."
      : `Could not ${verb}: ${error.message}`;

  if (teamId) {
    const [{ data: current, error: currentError }, { count, error: countError }] = await Promise.all([
      supabase.from("finale_teams").select("semi, slug").eq("id", teamId).eq("edition_year", year).maybeSingle(),
      supabase.from("finale_supporters").select("id", { count: "exact", head: true }).eq("edition_year", year),
    ]);
    if (currentError || countError) return { ok: false, error: `Could not check the team: ${(currentError ?? countError)?.message}` };
    if (!current) return { ok: false, error: "That team no longer exists." };
    const joined = (count ?? 0) > 0;
    // Once anyone has joined, brackets and shared links depend on the semi-final and the link name.
    if (joined && current.semi !== semi) {
      return { ok: false, error: "Supporters have already picked brackets, so this team can't change semi-final." };
    }
    const { error } = await supabase
      .from("finale_teams")
      .update({ ...row, slug: joined ? current.slug : teamSlug(name) })
      .eq("id", teamId)
      .eq("edition_year", year);
    if (error) return { ok: false, error: conflict(error, "save") };
  } else {
    const { error } = await supabase.from("finale_teams").insert({ ...row, slug: teamSlug(name), edition_year: year });
    if (error) return { ok: false, error: conflict(error, "add") };
  }
  refresh();
  return { ok: true, message: teamId ? "Team saved." : "Team added." };
}

export async function setSupporterVisibility(
  supporterId: string,
  status: FinalePublicStatus,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const admin = await requireManage("participants");
  if (!admin) return denied;
  if (status !== "visible" && status !== "hidden") return { ok: false, error: "Unknown action." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finale_supporters")
    .update({ public_status: status })
    .eq("id", supporterId)
    .select("id");
  if (error) return { ok: false, error: `Could not update: ${error.message}` };
  if (!data?.length) return { ok: false, error: "That supporter no longer exists." };
  refresh();
  return { ok: true, message: status === "visible" ? "Shown." : "Hidden." };
}
