import Link from "next/link";
import { unstable_cache } from "next/cache";
import Celebration from "@/components/finale/celebration";
import EmptyState from "@/components/ui/empty-state";
import { ResultsSearch } from "@/features/results/results-search";
import { FINAL_STAGE, latestRoster } from "@/lib/finale-podium";
import { loadFinalResult, type PodiumSchool } from "@/lib/finale-podium-data";
import { publicQualificationLabel } from "@/lib/paper-exam";
import { pageMetadata } from "@/lib/seo";
import { createAdminClient } from "@/supabase/admin";
import { isSupabaseConfigured } from "@/supabase/env";

export const metadata = pageMetadata(
  "Hall of Fame",
  "Every school that has advanced through the Adewale Students Conference, edition by edition.",
);

// Reads the portal, not the CMS — see docs/adr/0012. Service-role client for
// the same reason /schools uses one: stage_results_read is scoped to admins and
// the school's own members, so the publishable key returns an empty set with no
// error. The select lists below are therefore the whole of the access control,
// and only `advanced` rows are read: a school that did not get through is never
// named here.

interface Rep {
  name: string;
  score: number | null;
}

interface AdvancingSchool {
  registrationId: string;
  school: string;
  lga: string | null;
  stage: string;
  stateRank: number | null;
  reason: string | null;
  score: number | null;
  scoreMax: number | null;
  reps: Rep[];
}

interface Edition {
  year: number;
  title: string | null;
  /** Stage order as the edition itself defines it, so sections read in sequence. */
  stages: string[];
  schools: AdvancingSchool[];
  /** Champion and runner-up of the Grand Finale, once it is decided. */
  final: { place: 1 | 2; school: AdvancingSchool }[];
}

type StageResultRow = {
  registration_id: string;
  stage: string;
  score: number | null;
  score_max: number | null;
  reason: string | null;
  state_rank: number | null;
  registrations: {
    edition_year: number | null;
    school_id: string | null;
    schools: { name: string | null; lga: string | null } | null;
  } | null;
};

type RepResultRow = {
  stage: string;
  edition_year: number | null;
  score: number | null;
  students: { name: string | null; school_id: string | null } | null;
};

const sortReps = (reps: Rep[]) =>
  [...reps].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));

const loadResults = unstable_cache(
  async (): Promise<Edition[]> => {
    if (!isSupabaseConfigured) return [];
    const supabase = createAdminClient();
    if (!supabase) return [];

    const { data: editionData, error: editionError } = await supabase
      .from("editions")
      .select("year, title, stages")
      .order("year", { ascending: false });
    if (editionError) throw new Error(editionError.message);

    const years = ((editionData ?? []) as { year: number }[]).map((e) => e.year);

    // One query per edition, not one for all of them: PostgREST truncates past
    // Max rows instead of erroring, and an edition missing half its schools
    // reads as a small edition.
    const stageData = (
      await Promise.all(
        years.map(async (year) => {
          const { data, error } = await supabase
            .from("registration_stage_results")
            .select(
              "registration_id, stage, score, score_max, reason, state_rank, registrations!inner(edition_year, school_id, schools(name, lga))",
            )
            .eq("outcome", "advanced")
            .eq("registrations.edition_year", year);
          if (error) throw new Error(error.message);
          return (data ?? []) as unknown as StageResultRow[];
        }),
      )
    ).flat();

    const repData = (
      await Promise.all(
        years.map(async (year) => {
          const { data, error } = await supabase
            .from("student_stage_results")
            .select("stage, edition_year, score, students!inner(name, school_id)")
            .eq("outcome", "advanced")
            .eq("edition_year", year);
          if (error) throw new Error(error.message);
          return (data ?? []) as unknown as RepResultRow[];
        }),
      )
    ).flat();

    // Reps are keyed by school AND stage: a rep who advanced at the zonal stage
    // is not automatically on the roster for a later one.
    const repsBy = new Map<string, Rep[]>();
    for (const row of repData) {
      const schoolId = row.students?.school_id;
      const name = row.students?.name?.trim();
      if (!schoolId || !name) continue;
      const key = `${row.edition_year}:${row.stage}:${schoolId}`;
      const list = repsBy.get(key) ?? [];
      list.push({ name, score: row.score });
      repsBy.set(key, list);
    }

    const byYear = new Map<number, AdvancingSchool[]>();
    for (const row of stageData) {
      const year = row.registrations?.edition_year;
      const school = row.registrations?.schools?.name?.trim();
      if (!year || !school) continue;
      const schoolId = row.registrations?.school_id;
      const list = byYear.get(year) ?? [];
      list.push({
        registrationId: row.registration_id,
        school,
        lga: row.registrations?.schools?.lga?.trim() || null,
        stage: row.stage,
        stateRank: row.state_rank,
        reason: row.reason,
        score: row.score,
        scoreMax: row.score_max,
        reps: sortReps(repsBy.get(`${year}:${row.stage}:${schoolId}`) ?? []),
      });
      byYear.set(year, list);
    }

    // A failed read here costs the podium, not the page.
    const finals = new Map(
      await Promise.all(
        years.map(async (year) => {
          const { result, error } = await loadFinalResult(supabase, year);
          if (error) console.error(`Public results: final placing for ${year} failed:`, error);
          return [year, result] as const;
        }),
      ),
    );

    return ((editionData ?? []) as { year: number; title: string | null; stages: string[] }[])
      .map((edition) => {
        const stages = edition.stages ?? [];
        const finalist = (school: PodiumSchool, place: 1 | 2) => ({
          place,
          school: {
            registrationId: school.registrationId ?? `final-${place}`,
            school: school.school,
            lga: school.lga,
            stage: FINAL_STAGE,
            stateRank: place,
            reason: null,
            score: school.score,
            scoreMax: null,
            reps: sortReps(
              latestRoster(stages, (stage) => repsBy.get(`${edition.year}:${stage}:${school.schoolId}`)),
            ),
          },
        });
        const final = finals.get(edition.year);
        return {
          year: edition.year,
          title: edition.title,
          stages,
          schools: byYear.get(edition.year) ?? [],
          final: final
            ? [finalist(final.champion, 1), ...(final.runnerUp ? [finalist(final.runnerUp, 2)] : [])]
            : [],
        };
      })
      .filter((edition) => edition.schools.length > 0 || edition.final.length > 0);
  },
  ["public-results"],
  { revalidate: 300 },
);

async function getResults(): Promise<Edition[]> {
  try {
    return await loadResults();
  } catch (error) {
    console.error("Public results fetch failed:", error);
    return [];
  }
}

/** Stages that actually have advancing schools, in the edition's own order.
 *  A stage the edition does not list still shows, at the end — a renamed stage
 *  should not silently drop a whole cohort off the page. */
function stagesOf(edition: Edition): string[] {
  const present = [...new Set(edition.schools.map((s) => s.stage))];
  return present.sort((a, b) => {
    const ai = edition.stages.indexOf(a);
    const bi = edition.stages.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/** Alphabetical, because a reader is looking for their own LGA rather than
 *  reading a league table. Schools with no LGA recorded collect at the end. */
const NO_LGA = "Other";

function byLga(schools: AdvancingSchool[]) {
  const map = new Map<string, AdvancingSchool[]>();
  for (const school of schools) {
    const key = school.lga || NO_LGA;
    const list = map.get(key) ?? [];
    list.push(school);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([lga, list]) => ({
      lga,
      schools: list.sort(
        (a, b) => (a.stateRank ?? 9999) - (b.stateRank ?? 9999) || a.school.localeCompare(b.school),
      ),
    }))
    .sort((a, b) => {
      if (a.lga === NO_LGA) return 1;
      if (b.lga === NO_LGA) return -1;
      return a.lga.localeCompare(b.lga);
    });
}

const MEDAL: Record<1 | 2 | 3, { color: string; name: string; ped: string; icon: string }> = {
  1: { color: "#E8A020", name: "Champion", ped: "h-14 sm:h-28", icon: "🏆" },
  2: { color: "#9CA3AF", name: "Runner-up", ped: "h-10 sm:h-20", icon: "🥈" },
  3: { color: "#B45309", name: "Third place", ped: "h-7 sm:h-14", icon: "🥉" },
};

function PodiumColumn({ school, place }: { school: AdvancingSchool; place: 1 | 2 | 3 }) {
  const m = MEDAL[place];
  return (
    <div className="flex-1 min-w-0" data-place={place}>
      <div
        className="podium-card bg-white border-t-4 p-2 sm:p-4 text-center shadow-[0_1px_3px_rgba(10,15,30,0.05)]"
        style={{ borderTopColor: m.color }}
      >
        <div className="podium-icon text-lg sm:text-2xl leading-none">{m.icon}</div>
        <span
          className="hidden sm:block text-[10px] font-bold uppercase tracking-[0.2em] mt-1"
          style={{ color: m.color }}
        >
          {m.name}
        </span>
        <h4
          className={`font-bebas text-sm sm:text-2xl text-foreground mt-1 leading-tight break-words ${
            place === 1 ? "champion-shine" : ""
          }`}
        >
          {school.school}
        </h4>
        {school.reps.length ? (
          <p className="text-[11px] sm:text-sm text-muted-foreground mt-1 leading-snug">
            {school.reps.map((r) => r.name).join(", ")}
          </p>
        ) : null}
        {school.score != null ? (
          <p className="text-[11px] sm:text-sm font-semibold text-foreground mt-1 tabular-nums">
            {school.score}
            {school.scoreMax ? ` / ${school.scoreMax}` : ""}
          </p>
        ) : null}
        {school.lga ? (
          <p className="hidden sm:block text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-2">
            {school.lga}
          </p>
        ) : null}
      </div>
      <div className={`podium-ped flex items-start justify-center ${m.ped}`} style={{ background: m.color }}>
        <span className="font-bebas text-xl sm:text-4xl text-white/85 mt-1 sm:mt-2">{place}</span>
      </div>
    </div>
  );
}

function SchoolCard({ school }: { school: AdvancingSchool }) {
  const route = publicQualificationLabel(school.reason);
  return (
    <div
      data-school-card={`${school.school} ${school.lga ?? ""} ${school.reps
        .map((r) => r.name)
        .join(" ")}`.toLowerCase()}
      className="flex flex-col border border-[rgba(10,15,30,0.12)] bg-white p-4 transition-colors hover:border-[rgba(10,15,30,0.35)]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold leading-snug text-foreground">{school.school}</p>
        {school.score != null ? (
          <p className="shrink-0 text-right">
            <span className="font-bebas text-2xl leading-none text-foreground tabular-nums">
              {school.score}
            </span>
            {school.scoreMax ? (
              <span className="block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                of {school.scoreMax}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {school.reps.length ? (
        <ul className="mt-3 space-y-0.5 text-sm text-muted-foreground">
          {school.reps.map((rep) => (
            <li key={rep.name} className="leading-snug">
              {rep.name}
            </li>
          ))}
        </ul>
      ) : null}

      {route ? (
        <span className="mt-3 inline-block self-start border border-[rgba(10,15,30,0.12)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          {route}
        </span>
      ) : null}
    </div>
  );
}

type Props = { searchParams: Promise<{ year?: string }> };

export default async function ResultsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const all = await getResults();
  const years = all.map((e) => e.year);
  const selected = years.includes(Number(sp.year)) ? Number(sp.year) : null;
  const editions = selected ? all.filter((e) => e.year === selected) : all;

  const schools = new Set(all.flatMap((e) => e.schools.map((s) => s.school)));
  const reps = all.flatMap((e) => e.schools.flatMap((s) => s.reps)).length;
  const lgas = new Set(all.flatMap((e) => e.schools.map((s) => s.lga).filter(Boolean)));
  const stats = [
    { value: all.length, label: all.length === 1 ? "Edition" : "Editions" },
    { value: schools.size, label: "Schools" },
    { value: reps, label: "Students" },
    { value: lgas.size, label: "LGAs" },
  ];

  return (
    <>
      <header className="bg-[#0A0F1E] px-6 md:px-12 py-16 md:py-24 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-10 right-0 font-bebas text-[12rem] md:text-[18rem] leading-none text-[rgba(232,160,32,0.06)] select-none pointer-events-none"
        >
          ★
        </div>
        <div className="max-w-5xl mx-auto relative">
          <span className="inline-block border border-[#E8A020] bg-[rgba(232,160,32,0.08)] px-4 py-2 mb-6 text-[10px] md:text-xs font-bold tracking-[0.25em] uppercase text-primary">
            The Champions
          </span>
          <h1 className="font-bebas text-6xl md:text-8xl leading-[0.9] text-white">Hall of Fame</h1>
          <p className="serif-display text-base md:text-lg italic text-[rgba(250,247,240,0.7)] max-w-2xl mt-5 leading-relaxed">
            Every school the Adewale Students Conference has sent through, edition by
            edition — with the students who took them there.
          </p>
          {all.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] mt-10">
              {stats.map((s) => (
                <div key={s.label} className="bg-[#0A0F1E] p-5">
                  <div className="font-bebas text-4xl md:text-5xl text-primary leading-none">
                    {s.value}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(250,247,240,0.6)] mt-2">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <section className="px-6 md:px-12 py-16 md:py-20">
        <div className="max-w-5xl mx-auto">
          {years.length > 1 ? (
            <div className="mb-6 flex flex-wrap gap-2">
              <YearPill href="/results" active={selected === null}>
                All editions
              </YearPill>
              {years.map((year) => (
                <YearPill key={year} href={`/results?year=${year}`} active={selected === year}>
                  {year}
                </YearPill>
              ))}
            </div>
          ) : null}

          {editions.length > 0 ? (
            <ResultsSearch
              total={editions.reduce((n, e) => n + e.schools.length, 0)}
            />
          ) : null}

          {editions.length === 0 ? (
            <EmptyState title="No results yet">
              Schools appear here once an edition&apos;s results are published in the portal.
            </EmptyState>
          ) : (
            <div className="space-y-24">
              {editions.map((edition) => (
                <div key={edition.year} data-edition-block>
                  <div className="flex items-end gap-4 border-b-2 border-[#0A0F1E] pb-3 mb-10">
                    <span className="font-bebas text-6xl md:text-7xl leading-none text-foreground">
                      {edition.year}
                    </span>
                    {edition.title ? (
                      <span className="serif-display italic text-base md:text-lg text-muted-foreground mb-1">
                        {edition.title}
                      </span>
                    ) : null}
                  </div>

                  {edition.final.length ? (
                    <div className="mb-16">
                      <h2 className="mb-6 flex items-center gap-3">
                        <span className="font-bebas text-3xl text-foreground tracking-wide">
                          Grand Finale
                        </span>
                        <span className="h-px flex-1 bg-[rgba(10,15,30,0.12)]" />
                      </h2>
                      <Celebration className="mx-auto flex max-w-2xl items-end gap-2 sm:gap-4">
                        {[2, 1].map((place) => {
                          const entry = edition.final.find((f) => f.place === place);
                          return entry ? (
                            <PodiumColumn key={place} school={entry.school} place={entry.place} />
                          ) : null;
                        })}
                      </Celebration>
                    </div>
                  ) : null}

                  <div className="space-y-16">
                    {stagesOf(edition).map((stage) => {
                      const inStage = edition.schools.filter((s) => s.stage === stage);
                      const podium = [1, 2, 3]
                        .map((place) => ({
                          place: place as 1 | 2 | 3,
                          school: inStage.find((s) => s.stateRank === place),
                        }))
                        .filter((p): p is { place: 1 | 2 | 3; school: AdvancingSchool } =>
                          Boolean(p.school),
                        );

                      const stageLgas = new Set(inStage.map((s) => s.lga).filter(Boolean));
                      const stageReps = inStage.reduce((n, s) => n + s.reps.length, 0);

                      return (
                        <div key={stage} data-stage-block>
                          <h2 className="mb-1 flex items-center gap-3">
                            <span className="font-bebas text-3xl text-foreground tracking-wide">
                              {stage}
                            </span>
                            <span className="h-px flex-1 bg-[rgba(10,15,30,0.12)]" />
                          </h2>
                          <p className="mb-6 text-sm text-muted-foreground">
                            {inStage.length} school{inStage.length === 1 ? "" : "s"} through
                            {stageLgas.size ? ` · ${stageLgas.size} LGAs` : ""}
                            {stageReps ? ` · ${stageReps} students` : ""}
                          </p>

                          {podium.length ? (
                            <div className="mb-10 flex items-end gap-2 sm:gap-4">
                              {podium.find((p) => p.place === 2) ? (
                                <PodiumColumn
                                  school={podium.find((p) => p.place === 2)!.school}
                                  place={2}
                                />
                              ) : null}
                              {podium.find((p) => p.place === 1) ? (
                                <PodiumColumn
                                  school={podium.find((p) => p.place === 1)!.school}
                                  place={1}
                                />
                              ) : null}
                              {podium.find((p) => p.place === 3) ? (
                                <PodiumColumn
                                  school={podium.find((p) => p.place === 3)!.school}
                                  place={3}
                                />
                              ) : null}
                            </div>
                          ) : null}

                          <div className="space-y-8">
                            {byLga(inStage).map((group) => (
                              <div key={group.lga} data-lga-group>
                                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                  {group.lga}
                                  <span className="ml-2 font-normal normal-case tracking-normal">
                                    {group.schools.length} school
                                    {group.schools.length === 1 ? "" : "s"}
                                  </span>
                                </h3>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  {group.schools.map((school) => (
                                    <SchoolCard key={school.registrationId} school={school} />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function YearPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-9 items-center border px-4 text-sm font-medium ${
        active
          ? "border-[#0A0F1E] bg-[#0A0F1E] text-white"
          : "border-[rgba(10,15,30,0.15)] text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
