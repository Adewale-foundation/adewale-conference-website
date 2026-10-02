import type { RosterStudent } from "@/components/portal/participant-school-card";
import { ParticipantsPreview } from "@/components/portal/participants-preview";
import type {
  PreviewAward,
  PreviewGroup,
  PreviewMatch,
  PreviewParticipant,
  PreviewRepResult,
  PreviewStudent,
  PreviewView,
  QualificationFilter,
} from "@/components/portal/participants-preview-types";
import { parsePage } from "@/components/portal/list-controls";
import { chunk } from "@/lib/batch";
import { pageMetadata } from "@/lib/seo";
import { paperKey, paperLinksForStudents } from "@/lib/paper-results";
import { examCentre, isKnownCentre, requestedCentre } from "@/lib/exam-centre";
import { createClient } from "@/supabase/server";
import { canManageModule, canViewModule, requireModuleView } from "@/supabase/auth";
import {
  type Edition,
  type IndividualAward,
  type Rep,
  type StageResult,
  type StudentStageResult,
  type TournamentGroup,
  type TournamentGroupEntry,
  type TournamentMatch,
} from "@/supabase/types";

export const metadata = pageMetadata("Participants", "Run the competition after approval.");
export const dynamic = "force-dynamic";

interface ParticipantReg {
  id: string;
  edition_year: number;
  reps: unknown;
  details: Record<string, string> | null;
  qualification_zone: string | null;
  contact_email: string | null;
  school_id: string | null;
  schools: { name: string | null; lga: string | null; category: string | null } | null;
}
interface RosterStudentRow {
  id: string;
  school_id: string;
  name: string;
  level: string | null;
  edition_year: number | null;
}
interface CertRow {
  id: string;
  registration_id: string;
  student_id: string | null;
  type: string | null;
}

const BOOKENDS = new Set(["Registration", "Completed"]);

function stageTabs(stages: string[]) {
  return stages.filter((s) => !BOOKENDS.has(s));
}

function standing(results: StageResult[], stages: string[]) {
  for (let i = 0; i < stages.length; i++) {
    const outcome = results.find((r) => r.stage === stages[i])?.outcome;
    if (outcome === "eliminated") return { index: i, stage: stages[i], label: `Out at ${stages[i]}` };
    if (outcome !== "advanced") return { index: i, stage: stages[i], label: `At ${stages[i]}` };
  }
  return { index: stages.length, stage: "Completed", label: "Champion / completed" };
}

function sortedGroups(groups: TournamentGroup[]) {
  return [...groups].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function sortedEntries(entries: TournamentGroupEntry[]) {
  return [...entries].sort((a, b) => {
    const ar = a.rank ?? 999;
    const br = b.rank ?? 999;
    return ar - br || (a.seed ?? 999) - (b.seed ?? 999);
  });
}

export default async function AdminParticipants({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    edition?: string;
    page?: string;
    view?: string;
    status?: string;
    focus?: string;
  }>;
}) {
  await requireModuleView("participants");
  const [canManage, canOpenRegistrations] = await Promise.all([
    canManageModule("participants"),
    canViewModule("registrations"),
  ]);
  const { q, edition, page: pageParam, view: viewParam, status: statusParam, focus } = await searchParams;
  const supabase = await createClient();

  // Two round trips on purpose. Registrations are read for ONE edition, which means
  // the year has to be resolved first — and the year list comes from `editions`
  // rather than from the registrations themselves.
  //
  // Reading every year to render one shipped the entire archive, `details` payload
  // included, on every page load. Worse, the query had no limit: once the verified
  // count passes the project's Max rows setting, PostgREST truncates the tail with no
  // error, and since the old ordering was `edition_year desc` the rows lost were
  // always the oldest edition's. A partially-listed 2022 is indistinguishable from a
  // 2022 that only had that many teams.
  const { data: editionData } = await supabase
    .from("editions")
    .select("year, title, registration_open, stages, current_stage")
    .order("year", { ascending: false });

  const editions = (editionData ?? []) as Edition[];
  const currentYear = editions[0]?.year ?? null;
  const activeYear = (edition ? Number(edition) || null : null) ?? currentYear;
  // Editions drive the chips, so a new edition appears before its first team does.
  // The active year is unioned in so a deep link to a year with no editions row is
  // still navigable rather than silently dropping out of the list.
  const years = [...new Set([...editions.map((e) => e.year), ...(activeYear ? [activeYear] : [])])]
    .sort((a, b) => b - a);

  const { data: regRows } = activeYear
    ? await supabase
        .from("registrations")
        .select("id, edition_year, reps, details, qualification_zone, contact_email, school_id, schools(name, lga, category)")
        .eq("status", "verified")
        .eq("edition_year", activeYear)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Labels only: the distribution names a hall beside each stored town, so this
  // screen and the attendance register describe the same place the same way.
  // Allocation still writes and reads qualification_zone.
  const { data: venueRows, error: venuesError } = activeYear
    ? await supabase
        .from("exam_centres")
        .select("id, name, town, legacy_zone")
        .eq("edition_year", activeYear)
        .eq("is_active", true)
    : { data: [], error: null };
  if (venuesError) console.error("exam centres not loaded:", venuesError.message);
  const venues = (venueRows ?? []) as { id: string; name: string; town: string; legacy_zone: string | null }[];

  const inEdition = (regRows ?? []) as unknown as ParticipantReg[];
  const canEditCompetition = canManage && activeYear != null && activeYear === currentYear;
  const activeEdition = activeYear ? editions.find((e) => e.year === activeYear) ?? null : null;
  const stages = stageTabs(activeEdition?.stages ?? []);
  const requestedPage = parsePage(pageParam);

  // The workspace needs the complete Edition for truthful dashboards, whole-edition
  // centre saves, groups and brackets — a bulk save must not silently skip the rows
  // a search happened to hide.
  const dataRegs = inEdition;
  const regIds = dataRegs.map((r) => r.id);
  const schoolIds = dataRegs.map((r) => r.school_id).filter(Boolean) as string[];

  const [
    { data: stageRows },
    { data: studentRows },
    { data: certRows },
    { data: groupRows },
    { data: entryRows },
    { data: matchRows },
    { data: awardRows },
  ] = await Promise.all([
    regIds.length
      ? supabase
          .from("registration_stage_results")
          .select("id, registration_id, stage, outcome, score, note, reason")
          .in("registration_id", regIds)
      : Promise.resolve({ data: [] as StageResult[] }),
    schoolIds.length && activeYear
      ? supabase
          .from("students")
          .select("id, school_id, name, level, edition_year")
          .in("school_id", schoolIds)
          .eq("edition_year", activeYear)
          .is("deactivated_at", null)
          .order("name")
      : Promise.resolve({ data: [] as RosterStudentRow[] }),
    regIds.length
      ? supabase.from("certificates").select("id, registration_id, student_id, type").in("registration_id", regIds)
      : Promise.resolve({ data: [] as CertRow[] }),
    activeYear
      ? supabase.from("tournament_groups").select("id, edition_year, stage, name, sort_order, advance_count").eq("edition_year", activeYear)
      : Promise.resolve({ data: [] as TournamentGroup[] }),
    activeYear
      ? supabase
          // Scoped through the parent: entries carry no edition_year of their own, so
          // an unfiltered read returns every edition's and inflates the Groups count.
          .from("tournament_group_entries")
          .select(
            "id, group_id, registration_id, seed, rank, score, note, advance_override, tournament_groups!inner(edition_year)",
          )
          .eq("tournament_groups.edition_year", activeYear)
      : Promise.resolve({ data: [] as TournamentGroupEntry[] }),
    activeYear
      ? supabase
          .from("tournament_matches")
          .select("id, edition_year, stage, kind, team_a_registration_id, team_b_registration_id, team_a_score, team_b_score, winner_registration_id, status, scheduled_at, venue, note, parent_match_id, slot, superseded_at")
          .eq("edition_year", activeYear)
          .order("stage")
          .order("slot")
      : Promise.resolve({ data: [] as TournamentMatch[] }),
    activeYear
      ? supabase.from("individual_awards").select("id, edition_year, student_id, registration_id, stage, title, note").eq("edition_year", activeYear)
      : Promise.resolve({ data: [] as IndividualAward[] }),
  ]);

  const regsById = new Map(dataRegs.map((r) => [r.id, r]));
  const resultsByReg = new Map<string, StageResult[]>();
  for (const row of (stageRows ?? []) as StageResult[]) {
    const list = resultsByReg.get(row.registration_id) ?? [];
    list.push(row);
    resultsByReg.set(row.registration_id, list);
  }
  const standingByReg = new Map(dataRegs.map((r) => [r.id, standing(resultsByReg.get(r.id) ?? [], stages)]));

  // Keyed by school + edition: one school now holds every year's students.
  const rosterKey = (schoolId: string, year: number | null) => `${schoolId}|${year ?? ""}`;
  const studentsBySchool = new Map<string, RosterStudent[]>();
  for (const s of (studentRows ?? []) as RosterStudentRow[]) {
    const key = rosterKey(s.school_id, s.edition_year);
    const list = studentsBySchool.get(key) ?? [];
    list.push({ id: s.id, name: s.name, level: s.level });
    studentsBySchool.set(key, list);
  }
  const students = (studentRows ?? []) as RosterStudentRow[];

  // Each rep's own score at each stage — what the paper exam import writes.
  const studentIds = students.map((s) => s.id);
  const repResultsById: Record<string, PreviewRepResult[]> = {};
  if (studentIds.length) {
    const [pages, paperLinks] = await Promise.all([
      // Chunked so neither the URL nor the row cap truncates an edition's roster.
      Promise.all(
        chunk(studentIds, 100).map((batch) =>
          supabase
            .from("student_stage_results")
            .select("id, student_id, stage, edition_year, outcome, score, score_max, note, breakdown")
            .in("student_id", batch),
        ),
      ),
      paperLinksForStudents(supabase, studentIds),
    ]);
    for (const r of pages.flatMap((p) => (p.data ?? []) as StudentStageResult[])) {
      // paperKey, not the bare stage: the index is keyed by edition too, so a
      // stage-only lookup matched nothing and every paper link came back null.
      const link = paperLinks.get(r.student_id)?.get(paperKey(r.stage, r.edition_year));
      (repResultsById[r.student_id] ??= []).push({
        ...r,
        detailHref: link?.href ?? null,
        subjectOrder: link?.subjects ?? null,
      });
    }
  }

  const schoolCertsByReg: Record<string, { id: string; type: string | null }[]> = {};
  const studentCertsById: Record<string, { id: string; type: string | null }[]> = {};
  for (const c of (certRows ?? []) as CertRow[]) {
    if (c.student_id) (studentCertsById[c.student_id] ??= []).push({ id: c.id, type: c.type });
    else (schoolCertsByReg[c.registration_id] ??= []).push({ id: c.id, type: c.type });
  }

  const groups = (groupRows ?? []) as TournamentGroup[];
  // The !inner embed adds a nested tournament_groups key used only for filtering.
  const entries = (entryRows ?? []) as unknown as TournamentGroupEntry[];
  const matches = (matchRows ?? []) as TournamentMatch[];
  const awards = (awardRows ?? []) as IndividualAward[];
  const entriesByGroup = new Map<string, TournamentGroupEntry[]>();
  for (const entry of entries) {
    if (!regsById.has(entry.registration_id)) continue;
    const list = entriesByGroup.get(entry.group_id) ?? [];
    list.push(entry);
    entriesByGroup.set(entry.group_id, list);
  }
  const assignedRegIds = new Set(entries.map((e) => e.registration_id));
  const schoolName = (id?: string | null) => (id ? regsById.get(id)?.schools?.name ?? "Unknown school" : "Unassigned");
  const rosterOf = (r: ParticipantReg) =>
    r.school_id ? studentsBySchool.get(rosterKey(r.school_id, r.edition_year)) ?? [] : [];

  const allowedViews = new Set<PreviewView>(["overview", "centres", "qualifications", "groups", "knockouts", "awards"]);
  const previewView = allowedViews.has(viewParam as PreviewView) ? (viewParam as PreviewView) : "overview";
  const allowedStatuses = new Set<QualificationFilter>(["all", "pending", "advanced", "eliminated", "missing-centre"]);
  const qualificationStatus = allowedStatuses.has(statusParam as QualificationFilter)
    ? (statusParam as QualificationFilter)
    : "all";

  const previewParticipants: PreviewParticipant[] = dataRegs.map((registration) => {
    const info = examCentre(registration);
    const requested = requestedCentre(registration.details);
    const standardRequested = requested && isKnownCentre(requested) ? requested : null;
    return {
      id: registration.id,
      schoolId: registration.school_id,
      school: registration.schools?.name ?? "Unassigned school",
      lga: registration.schools?.lga ?? null,
      category: registration.schools?.category ?? null,
      email: registration.contact_email,
      reps: rosterOf(registration).length,
      roster: rosterOf(registration),
      results: resultsByReg.get(registration.id) ?? [],
      standing: standingByReg.get(registration.id) ?? { stage: "Qualifications", label: "At Qualifications" },
      centre: {
        value: info.value,
        source: info.source,
        allocated: registration.qualification_zone,
        requested: standardRequested,
        requestedRaw: requested || null,
        isStandard: Boolean(registration.qualification_zone) && isKnownCentre(registration.qualification_zone ?? ""),
      },
      schoolCerts: schoolCertsByReg[registration.id] ?? [],
      studentCertsById: Object.fromEntries(
        rosterOf(registration).map((student) => [student.id, studentCertsById[student.id] ?? []]),
      ),
      repResultsById: Object.fromEntries(
        rosterOf(registration).map((student) => [student.id, repResultsById[student.id] ?? []]),
      ),
    };
  });

  const previewGroups: PreviewGroup[] = sortedGroups(groups).map((group) => ({
    ...group,
    entries: sortedEntries(entriesByGroup.get(group.id) ?? []).map((entry) => ({
      ...entry,
      school: schoolName(entry.registration_id),
    })),
  }));
  const previewMatches: PreviewMatch[] = matches.map((match) => ({
    ...match,
    teamAName: schoolName(match.team_a_registration_id),
    teamBName: schoolName(match.team_b_registration_id),
    winnerName: match.winner_registration_id ? schoolName(match.winner_registration_id) : null,
  }));
  const registrationBySchool = new Map(
    dataRegs.filter((registration) => registration.school_id).map((registration) => [registration.school_id as string, registration]),
  );
  const previewStudents: PreviewStudent[] = students.map((student) => ({
    id: student.id,
    schoolId: student.school_id,
    name: student.name,
    level: student.level,
    school: registrationBySchool.get(student.school_id)?.schools?.name ?? "School",
  }));
  const studentNameById = new Map(previewStudents.map((student) => [student.id, student.name]));
  const previewAwards: PreviewAward[] = awards.map((award) => ({
    ...award,
    studentName: studentNameById.get(award.student_id) ?? "Rep",
  }));

  return (
    <ParticipantsPreview
      years={years}
      activeYear={activeYear}
      currentStage={activeEdition?.current_stage ?? null}
      stages={stages}
      canEditCompetition={canEditCompetition}
      view={previewView}
      q={q}
      status={qualificationStatus}
      page={requestedPage}
      focus={focus}
      participants={previewParticipants}
      groups={previewGroups}
      matches={previewMatches}
      students={previewStudents}
      awards={previewAwards}
      venues={venues}
      canOpenRegistrations={canOpenRegistrations}
    />
  );
}
