import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FINAL_STAGE, championSource, finalPlacing, type FinalMatch } from "@/lib/finale-podium";

export interface PodiumSchool {
  registrationId: string | null;
  schoolId: string | null;
  school: string;
  lga: string | null;
  score: number | null;
}

export interface FinalResult {
  champion: PodiumSchool;
  runnerUp: PodiumSchool | null;
}

type RegistrationRow = {
  id: string;
  school_id: string | null;
  schools: { name: string | null; lga: string | null } | null;
};

/** Service-role read for public pages: the select lists are the access control, as on /results. */
export async function loadFinalResult(
  db: SupabaseClient,
  year: number,
): Promise<{ result: FinalResult | null; error: string | null }> {
  const [matchRes, settingsRes] = await Promise.all([
    db
      .from("tournament_matches")
      .select(
        "kind, status, superseded_at, team_a_registration_id, team_b_registration_id, team_a_score, team_b_score, winner_registration_id",
      )
      .eq("edition_year", year)
      .eq("stage", FINAL_STAGE),
    db
      .from("finale_settings")
      .select("champion:finale_teams!finale_settings_champion_team_id_fkey(name, registration_id)")
      .eq("edition_year", year)
      .maybeSingle(),
  ]);
  if (matchRes.error) return { result: null, error: matchRes.error.message };
  if (settingsRes.error) return { result: null, error: settingsRes.error.message };

  const fanVote = (settingsRes.data as unknown as {
    champion: { name: string; registration_id: string | null } | null;
  } | null)?.champion;
  const source = championSource(
    finalPlacing((matchRes.data ?? []) as FinalMatch[]),
    fanVote ? { registrationId: fanVote.registration_id, name: fanVote.name } : null,
  );
  if (!source) return { result: null, error: null };

  const championId = source.source === "bracket" ? source.championId : source.registrationId;
  const runnerUpId = source.source === "bracket" ? source.runnerUpId : null;
  const ids = [championId, runnerUpId].filter((id): id is string => Boolean(id));

  const registrations = new Map<string, RegistrationRow>();
  if (ids.length) {
    const { data, error } = await db
      .from("registrations")
      .select("id, school_id, schools(name, lga)")
      .in("id", ids);
    if (error) return { result: null, error: error.message };
    for (const row of (data ?? []) as unknown as RegistrationRow[]) registrations.set(row.id, row);
  }

  const school = (id: string | null, score: number | null, fallbackName?: string): PodiumSchool | null => {
    const row = id ? registrations.get(id) : undefined;
    const name = row?.schools?.name?.trim() || fallbackName;
    if (!name) return null;
    return {
      registrationId: id,
      schoolId: row?.school_id ?? null,
      school: name,
      lga: row?.schools?.lga?.trim() || null,
      score,
    };
  };

  const champion =
    source.source === "bracket"
      ? school(source.championId, source.championScore)
      : school(source.registrationId, null, source.name);
  if (!champion) return { result: null, error: null };
  return {
    result: {
      champion,
      runnerUp: source.source === "bracket" ? school(source.runnerUpId, source.runnerUpScore) : null,
    },
    error: null,
  };
}
