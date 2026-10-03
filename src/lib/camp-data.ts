import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/supabase/admin";
import {
  campCandidates,
  campRosterRows,
  educatorsOnRecord,
  type CampEducator,
  type CampRosterRow,
} from "@/lib/camp";
import type { CampConfirmation, CampSettings } from "@/supabase/types";

export type MyCamp = { settings: CampSettings; confirmation: CampConfirmation | null };

/** Null when the school isn't invited or the edition has no camp set up. */
export async function loadMyCamp(
  supabase: SupabaseClient,
  registrationId: string,
): Promise<{ camp: MyCamp | null; error: string | null }> {
  const { data, error } = await supabase.rpc("my_camp_details", {
    p_registration_id: registrationId,
  });
  if (error) return { camp: null, error: error.message };
  return { camp: (data as MyCamp | null) ?? null, error: null };
}

/**
 * The school's educators on record for a camp response. Members are read with
 * the service role because RLS only shows a coordinator their own member row;
 * the school id comes from a registration the caller's own session could read.
 */
export async function loadEducatorsOnRecord(
  supabase: SupabaseClient,
  registrationId: string,
): Promise<{ educators: CampEducator[]; error: string | null }> {
  const { data: reg, error } = await supabase
    .from("registrations")
    .select("school_id, details")
    .eq("id", registrationId)
    .maybeSingle();
  if (error) return { educators: [], error: error.message };
  if (!reg?.school_id) return { educators: [], error: "Registration not found." };

  const { data: members, error: membersError } = await (createAdminClient() ?? supabase)
    .from("school_members")
    .select("full_name, email")
    .eq("school_id", reg.school_id)
    .eq("status", "approved")
    .order("created_at");
  if (membersError) return { educators: [], error: membersError.message };

  return {
    educators: educatorsOnRecord(
      reg.details as Record<string, unknown> | null,
      (members ?? []) as { full_name: string | null; email: string | null }[],
    ),
    error: null,
  };
}

/** The school's contestants for that registration's edition — the team both camp emails name. */
export async function loadContestantNames(
  supabase: SupabaseClient,
  registrationId: string,
): Promise<{ names: string[]; error: string | null }> {
  const { data: reg, error } = await supabase
    .from("registrations")
    .select("school_id, edition_year")
    .eq("id", registrationId)
    .maybeSingle();
  if (error) return { names: [], error: error.message };
  if (!reg?.school_id) return { names: [], error: "Registration not found." };
  const { data, error: studentsError } = await supabase
    .from("students")
    .select("name")
    .eq("school_id", reg.school_id)
    .eq("edition_year", reg.edition_year)
    .is("deactivated_at", null)
    .order("name");
  if (studentsError) return { names: [], error: studentsError.message };
  return { names: ((data ?? []) as { name: string }[]).map((s) => s.name), error: null };
}

export type CampCandidate = { id: string; schoolName: string; entryStatus: string | null };

/** One edition's camp roster for admins — the page and the export share it. */
export async function loadCampRoster(
  supabase: SupabaseClient,
  year: number,
): Promise<{
  settings: CampSettings | null;
  rows: CampRosterRow[];
  candidates: CampCandidate[];
  error: string | null;
}> {
  const [settingsRes, regsRes, confRes] = await Promise.all([
    supabase.from("camp_settings").select("*").eq("edition_year", year).maybeSingle(),
    supabase
      .from("registrations")
      .select("id, status, schools(name, lga), registration_stage_results(stage, outcome)")
      // Every entry, not just verified ones: an admin may add any school by hand.
      .eq("edition_year", year),
    supabase.from("camp_confirmations").select("*").eq("edition_year", year),
  ]);
  const error = settingsRes.error ?? regsRes.error ?? confRes.error;
  if (error) return { settings: null, rows: [], candidates: [], error: error.message };

  const regs = (regsRes.data ?? []) as unknown as {
    id: string;
    status: string | null;
    schools: { name: string | null; lga: string | null } | null;
    registration_stage_results: { stage: string; outcome: string | null }[] | null;
  }[];
  const entries = regs.map((r) => ({
    id: r.id,
    status: r.status,
    schoolName: r.schools?.name ?? "Unnamed school",
    lga: r.schools?.lga ?? null,
    stageResults: r.registration_stage_results ?? [],
  }));
  const rows = campRosterRows(entries, (confRes.data ?? []) as CampConfirmation[]);
  const candidates = campCandidates(entries, rows).map((r) => ({
    id: r.id,
    schoolName: r.schoolName,
    entryStatus: r.status,
  }));
  return { settings: (settingsRes.data as CampSettings | null) ?? null, rows, candidates, error: null };
}
