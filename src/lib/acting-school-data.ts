import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/supabase/server";
import { ACTING_SCHOOL_COOKIE, actingEntry, type EntryLike } from "@/lib/acting-school";

export type ActingEntry = EntryLike & { stageResults: { stage: string; outcome: string | null }[] };

/**
 * The school the portal acts for this request, from entries the caller's RLS
 * can read, plus every entry for that school. Shared by layout and page.
 */
export const loadActingEntry = cache(
  async (): Promise<{
    entry: ActingEntry | null;
    choices: ActingEntry[];
    schoolEntries: ActingEntry[];
    error: string | null;
  }> => {
    const supabase = await createClient();
    const [{ data, error }, store] = await Promise.all([
      supabase
        .from("registrations")
        .select("id, school_id, edition_year, status, schools(name), registration_stage_results(stage, outcome)")
        .order("edition_year", { ascending: false }),
      cookies(),
    ]);
    if (error) return { entry: null, choices: [], schoolEntries: [], error: error.message };
    const entries = (
      (data ?? []) as unknown as {
        id: string;
        school_id: string | null;
        edition_year: number;
        status: string | null;
        schools: { name: string | null } | null;
        registration_stage_results: { stage: string; outcome: string | null }[] | null;
      }[]
    ).map((r) => ({
      id: r.id,
      school_id: r.school_id,
      edition_year: r.edition_year,
      status: r.status,
      schoolName: r.schools?.name ?? null,
      stageResults: r.registration_stage_results ?? [],
    }));
    const { entry, choices } = actingEntry(entries, store.get(ACTING_SCHOOL_COOKIE)?.value);
    const schoolEntries = entry ? entries.filter((e) => e.school_id === entry.school_id) : [];
    return { entry, choices, schoolEntries, error: null };
  },
);
