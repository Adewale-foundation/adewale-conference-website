import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/supabase/admin";
import type { FinaleSettings, FinaleSupporter, FinaleTeam } from "@/supabase/types";

export const FINALE_YEAR = Number(process.env.ASC_EDITION_YEAR) || new Date().getFullYear();

/** `schoolName` is the school's full name on record; `name` is what the fan vote calls it. */
export type FinaleTeamView = FinaleTeam & { schoolName: string | null; supporters: number; championPicks: number };

/** The public pages read on the service role: none of these tables is open to
 *  anon. Callers render only public fields — never a phone or an email. */
export function finaleDb(): SupabaseClient | null {
  return createAdminClient();
}

export async function loadFinale(
  db: SupabaseClient,
  year: number,
): Promise<{ settings: FinaleSettings | null; teams: FinaleTeamView[]; error: string | null }> {
  const [settingsRes, teamsRes, tallyRes] = await Promise.all([
    db.from("finale_settings").select("*").eq("edition_year", year).maybeSingle(),
    db
      .from("finale_teams")
      .select("*, registrations(schools(name))")
      .eq("edition_year", year)
      .order("semi")
      .order("sort")
      .order("name"),
    db.rpc("finale_tally", { p_year: year }),
  ]);
  const error = settingsRes.error ?? teamsRes.error ?? tallyRes.error;
  if (error) return { settings: null, teams: [], error: error.message };

  const tally = new Map(
    ((tallyRes.data ?? []) as { team_id: string; supporters: number; champion_picks: number }[]).map(
      (t) => [t.team_id, t],
    ),
  );
  type Row = FinaleTeam & { registrations: { schools: { name: string | null } | null } | null };
  const teams = ((teamsRes.data ?? []) as Row[]).map(({ registrations, ...t }) => {
    const n = tally.get(t.id);
    return {
      ...t,
      schoolName: registrations?.schools?.name ?? null,
      supporters: Number(n?.supporters ?? 0),
      championPicks: Number(n?.champion_picks ?? 0),
    };
  });
  return { settings: (settingsRes.data as FinaleSettings | null) ?? null, teams, error: null };
}

export type PublicCheer = { name: string | null; cheer: string; createdAt: string };

export async function loadCheers(
  db: SupabaseClient,
  teamId: string,
  limit = 10,
): Promise<{ cheers: PublicCheer[]; error: string | null }> {
  const { data, error } = await db
    .from("finale_supporters")
    .select("display_name, cheer, created_at")
    .eq("team_id", teamId)
    .eq("public_status", "visible")
    .not("cheer", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { cheers: [], error: error.message };
  return {
    cheers: ((data ?? []) as { display_name: string | null; cheer: string; created_at: string }[]).map((c) => ({
      name: c.display_name,
      cheer: c.cheer,
      createdAt: c.created_at,
    })),
    error: null,
  };
}

/** Everything but the phone, which no public page has a reason to hold. */
export type MySupporter = Omit<FinaleSupporter, "phone">;
const MY_SUPPORTER_COLUMNS =
  "id, edition_year, team_id, pick_semi1, pick_semi2, pick_champion, display_name, cheer, public_status, created_at";

export async function loadSupporter(
  db: SupabaseClient,
  id: string,
): Promise<{ supporter: MySupporter | null; error: string | null }> {
  const { data, error } = await db.from("finale_supporters").select(MY_SUPPORTER_COLUMNS).eq("id", id).maybeSingle();
  if (error) return { supporter: null, error: error.message };
  return { supporter: (data as MySupporter | null) ?? null, error: null };
}

export type LeaderRow = { supporterId: string; name: string | null; teamId: string; score: number; rank: number; total: number };

export async function loadLeaders(
  db: SupabaseClient,
  year: number,
  limit: number,
  supporterId: string | null,
): Promise<{ leaders: LeaderRow[]; error: string | null }> {
  const { data, error } = await db.rpc("finale_leaders", { p_year: year, p_limit: limit, p_supporter: supporterId });
  if (error) return { leaders: [], error: error.message };
  return {
    leaders: (
      (data ?? []) as { supporter_id: string; display_name: string | null; team_id: string; score: number; rank: number; total: number }[]
    ).map((r) => ({
      supporterId: r.supporter_id,
      name: r.display_name,
      teamId: r.team_id,
      score: Number(r.score),
      rank: Number(r.rank),
      total: Number(r.total),
    })),
    error: null,
  };
}
