import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { roadToTitle, type RoadStep } from "@/lib/road-to-title";

export interface Road {
  /** Schools that registered for the edition and were not declined. */
  registered: number;
  steps: RoadStep[];
}

/** Counts only, on the service role: no school is named, so the losing schools stay unnamed (ADR 0012). */
export async function loadRoad(db: SupabaseClient, year: number): Promise<{ road: Road | null; error: string | null }> {
  const { data: edition, error: editionError } = await db
    .from("editions")
    .select("stages")
    .eq("year", year)
    .maybeSingle();
  if (editionError) return { road: null, error: editionError.message };
  const stages = ((edition as { stages: string[] | null } | null)?.stages ?? []).filter(Boolean);
  if (!stages.length) return { road: null, error: null };

  const results = (stage: string) =>
    db
      .from("registration_stage_results")
      .select("registration_id, registrations!inner(edition_year)", { count: "exact", head: true })
      .eq("stage", stage)
      .eq("registrations.edition_year", year);

  const [registered, ...counts] = await Promise.all([
    db
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("edition_year", year)
      .neq("status", "declined"),
    ...stages.flatMap((stage) => [results(stage), results(stage).eq("outcome", "advanced")]),
  ]);
  const failed = [registered, ...counts].find((res) => res.error);
  if (failed?.error) return { road: null, error: failed.error.message };

  const tallies = stages.map((stage, i) => ({
    stage,
    entered: counts[i * 2].count ?? 0,
    advanced: counts[i * 2 + 1].count ?? 0,
  }));
  return { road: { registered: registered.count ?? 0, steps: roadToTitle(stages, tallies) }, error: null };
}
