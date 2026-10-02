import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, SectionHeading, StatTile } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/submit-button";
import { EditionStages, nextStage } from "@/components/portal/edition-stages";
import { resubmitRegistration } from "./actions";
import { StageResults, type StageResultRow } from "@/components/portal/stage-results";
import CampCard from "@/components/portal/camp-card";
import { loadMyCamp } from "@/lib/camp-data";
import {
  PAPER_BASE,
  paperLinksForStudents,
  withPaperLinks,
  type PaperLinkIndex,
} from "@/lib/paper-results";
import ClaimForm from "@/components/portal/claim-form";
import RegisterEditionForm from "@/components/portal/register-edition-form";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { getSessionUser } from "@/supabase/auth";
import { isSupabaseConfigured } from "@/supabase/env";
import type {
  Edition,
  Rep,
  RegistrationWithRelations,
  StageResult,
  StudentStageResult,
} from "@/supabase/types";

export const metadata = pageMetadata("School dashboard", "Your school overview.");
export const dynamic = "force-dynamic";

export default async function SchoolOverview() {
  if (!isSupabaseConfigured) redirect("/portal/login");
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");

  const [
    { data: regData },
    { data: memberData },
    { data: editionData },
    { data: guidelineRows },
    { data: announcementRows },
  ] = await Promise.all([
    supabase
      .from("registrations")
      .select("id, edition_year, status, decline_reason, reps, school_id, schools(name)")
      .order("edition_year", { ascending: false }),
    supabase.from("school_members").select("status, schools(name)"),
    supabase
      .from("editions")
      .select("year, title, registration_open, stages, current_stage")
      .order("year", { ascending: false }),
    // The competition guideline is a resource (type "guidelines") — single
    // source of truth, managed in Admin → Resources.
    supabase
      .from("resources")
      .select("id, edition_year")
      .eq("type", "guidelines")
      .eq("published", true)
      .order("created_at", { ascending: false }),
    // The three most recent announcements aimed at this school. RLS
    // (can_read_announcement) decides which rows come back.
    supabase
      .from("announcements")
      .select("id, title, sent_at")
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(3),
  ]);
  const registrations = (regData ?? []) as unknown as RegistrationWithRelations[];
  const announcements = (announcementRows ?? []) as {
    id: string;
    title: string;
    sent_at: string | null;
  }[];
  const totalReps = registrations.reduce(
    (n, r) => n + (Array.isArray(r.reps) ? (r.reps as Rep[]).length : 0),
    0,
  );
  const pendingMemberships = (
    (memberData ?? []) as unknown as {
      status: string;
      schools: { name: string | null } | null;
    }[]
  ).filter((m) => m.status === "pending");
  const editions = (editionData ?? []) as Edition[];
  const latest = editions[0] ?? null;
  const registeredYears = new Set(registrations.map((r) => r.edition_year));

  const entry = registrations[0] ?? null;
  const accepted = entry?.status === "verified";

  // Pick the guideline for this school's edition, else one with no edition set,
  // else the newest. Downloaded through the tier-gated resource route.
  const guidelineRes = (guidelineRows ?? []) as { id: string; edition_year: number | null }[];
  const guideline =
    (entry ? guidelineRes.find((g) => g.edition_year === entry.edition_year) : undefined) ??
    guidelineRes.find((g) => g.edition_year == null) ??
    guidelineRes[0] ??
    null;
  const guidelineHref = guideline ? `/api/resources/${guideline.id}/download` : "";

  // The school's own per-stage outcomes for its latest entry (empty until an
  // admin marks a stage), plus the matching edition's ordered stage list.
  const { data: stageData } = entry
    ? await supabase
        .from("registration_stage_results")
        .select("id, registration_id, stage, outcome, score, score_max, note, reason, lga_rank, state_rank")
        .eq("registration_id", entry.id)
    : { data: [] as StageResult[] };
  const stageResults = (stageData ?? []) as StageResult[];
  const { camp, error: campError } = entry
    ? await loadMyCamp(supabase, entry.id)
    : { camp: null, error: null };
  if (campError) console.error("camp details", campError);
  const entryEdition = entry
    ? editions.find((e) => e.year === entry.edition_year) ?? latest
    : null;
  const registrationIds = registrations.map((r) => r.id);
  const { data: allStageData } = registrationIds.length
    ? await supabase
        .from("registration_stage_results")
        .select("id, registration_id, stage, outcome, score, score_max, note, reason, lga_rank, state_rank")
        .in("registration_id", registrationIds)
    : { data: [] as StageResult[] };
  const stageResultsByRegistration = new Map<string, StageResult[]>();
  for (const result of (allStageData ?? []) as StageResult[]) {
    const list = stageResultsByRegistration.get(result.registration_id) ?? [];
    list.push(result);
    stageResultsByRegistration.set(result.registration_id, list);
  }

  // Each rep's individual progress + certificates (coordinator view). The roster
  // is materialised at approval; empty until then or until "Sync roster".
  const schoolId = (entry as { school_id?: string | null } | null)?.school_id ?? null;
  // Deliberately every edition's reps, not just this year's — a coordinator's
  // history is the point. But that means the list mixes years, so each rep says
  // which sitting they are from and the newest lead.
  let roster: { id: string; name: string; level: string | null; edition_year: number | null }[] = [];
  const repResultsById: Record<string, StudentStageResult[]> = {};
  // Which paper exam produced each rep's stage score, for the "see the full
  // paper" link on their chip.
  let paperLinks: PaperLinkIndex = new Map();
  const repCertsById: Record<string, { id: string; type: string | null; asset_url: string | null }[]> = {};
  if (schoolId) {
    const { data: studentRows } = await supabase
      .from("students")
      .select("id, name, level, edition_year")
      .eq("school_id", schoolId)
      .is("deactivated_at", null)
      .order("edition_year", { ascending: false })
      .order("name");
    roster = (studentRows ?? []) as {
      id: string;
      name: string;
      level: string | null;
      edition_year: number | null;
    }[];
    const ids = roster.map((s) => s.id);
    if (ids.length) {
      const [{ data: ssr }, { data: certs }, links] = await Promise.all([
        supabase
          .from("student_stage_results")
          // score_max/breakdown carry the paper exam's total and per-subject
          // scores for each rep.
          .select("id, student_id, stage, edition_year, outcome, score, score_max, note, breakdown")
          .in("student_id", ids),
        supabase.from("certificates").select("id, student_id, type, asset_url").in("student_id", ids),
        paperLinksForStudents(supabase, ids, PAPER_BASE.school),
      ]);
      paperLinks = links;
      for (const r of (ssr ?? []) as StudentStageResult[]) (repResultsById[r.student_id] ??= []).push(r);
      for (const c of (certs ?? []) as {
        id: string;
        student_id: string | null;
        type: string | null;
        asset_url: string | null;
      }[]) {
        if (c.student_id) (repCertsById[c.student_id] ??= []).push(c);
      }
    }
  }
  const rosterHasProgress = roster.some(
    (s) => (repResultsById[s.id]?.length ?? 0) > 0 || (repCertsById[s.id]?.length ?? 0) > 0,
  );

  return (
    <>
      {camp ? <CampCard camp={camp} /> : null}

      {/* Competition-entry status — bold and unmissable. Review happens at close
          of registration; portal/prep access is never gated by it. */}
      {entry ? (
        <Card
          className={`p-5 border-l-4 ${
            accepted
              ? "border-l-green-600"
              : entry.status === "declined"
                ? "border-l-red-600"
                : "border-l-primary"
          }`}
        >
          <p
            className={`text-[10px] font-bold uppercase tracking-[0.2em] ${
              accepted
                ? "text-green-700"
                : entry.status === "declined"
                  ? "text-red-700"
                  : "text-gold-ink"
            }`}
          >
            {entry.edition_year} competition entry
          </p>
          <p className="font-bebas text-2xl text-foreground leading-tight mt-1">
            {accepted
              ? `You're in the ${entry.edition_year} competition`
              : entry.status === "declined"
                ? "Not selected this edition"
                : "Under review"}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {accepted
              ? "Your entry is confirmed — download the competition guidelines below. Your teacher will also receive the zonal schedule at least two weeks ahead."
              : entry.status === "declined"
                ? "Your school wasn't selected this time. The prep portal stays open all year — practice, Tech Lab, plans and resources — and we'd love to see you register next edition."
                : "The full competition guidelines unlock here once schools are confirmed at close of registration. Meanwhile, everything here is open — prepare freely."}
          </p>
          {entry.status === "declined" && entry.decline_reason ? (
            <div className="mt-4 border-l-4 border-l-red-600 bg-red-600/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">
                Reason from the reviewers
              </p>
              <p className="text-sm text-foreground mt-1">{entry.decline_reason}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Fix this from your{" "}
                <a href="/portal/school/students" className="font-bold text-foreground hover:underline">
                  Students
                </a>{" "}
                page (for example, replace a representative), then resubmit for review.
              </p>
              <form action={resubmitRegistration.bind(null, entry.id)} className="mt-3">
                <SubmitButton size="sm" pendingText="Resubmitting…">
                  Resubmit for review →
                </SubmitButton>
              </form>
            </div>
          ) : null}
          {accepted && guidelineHref ? (
            <a
              href={guidelineHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-foreground hover:bg-primary/90 transition-colors"
            >
              Download the competition guidelines →
            </a>
          ) : null}
          {entryEdition && stageResults.length > 0 ? (
            <div className="mt-4 border-t border-foreground/5 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Your stage results
              </p>
              <StageResults
                edition={entryEdition.year}
                stages={entryEdition.stages}
                results={stageResults}
              />
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatTile label="Registrations" value={registrations.length} />
        <StatTile label="Representatives" value={totalReps} />
        <StatTile label="Latest status" value={registrations[0]?.status ?? "—"} />
      </div>

      {announcements.length > 0 ? (
        <div>
          <SectionHeading
            action={{ href: "/portal/announcements", label: "All announcements →" }}
          >
            Latest announcements
          </SectionHeading>
          <Card className="divide-y divide-foreground/5">
            {announcements.map((a) => (
              <Link
                key={a.id}
                href={`/portal/announcements/${a.id}`}
                className="block p-4 hover:bg-foreground/2"
              >
                <p className="font-medium text-foreground">{a.title}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {a.sent_at ? new Date(a.sent_at).toLocaleDateString() : ""}
                </p>
              </Link>
            ))}
          </Card>
        </div>
      ) : null}

      {roster.length > 0 && (accepted || rosterHasProgress) ? (
        <div>
          <SectionHeading>Representatives&apos; progress</SectionHeading>
          <div className="space-y-3">
            {roster.map((s) => {
              const results = repResultsById[s.id] ?? [];
              const certs = (repCertsById[s.id] ?? []).filter((c) => c.asset_url);
              return (
                <Card key={s.id} className="p-4 space-y-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{s.name}</span>
                    {s.level ? (
                      <span className="text-sm text-muted-foreground">{s.level}</span>
                    ) : null}
                    {s.edition_year != null ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          latest && s.edition_year === latest.year
                            ? "bg-primary/10 text-primary"
                            : "bg-foreground/5 text-muted-foreground"
                        }`}
                      >
                        {s.edition_year}
                      </span>
                    ) : null}
                  </span>
                  {results.length ? (
                    <StageResults
                      edition={entryEdition?.year ?? latest?.year}
                      stages={entryEdition?.stages ?? latest?.stages ?? []}
                      results={withPaperLinks(
                        results as unknown as StageResultRow[],
                        paperLinks.get(s.id),
                      )}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">No stage results yet.</p>
                  )}
                  {certs.length ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {certs.map((c) => (
                        <a
                          key={c.id}
                          href={c.asset_url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/5"
                        >
                          {c.type ?? "Certificate"} ↓
                        </a>
                      ))}
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      {registrations.length > 1 ? (
        <div>
          <SectionHeading>Competition history</SectionHeading>
          <div className="space-y-3">
            {registrations.map((r) => {
              const edition = editions.find((e) => e.year === r.edition_year) ?? null;
              const results = stageResultsByRegistration.get(r.id) ?? [];
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bebas text-2xl text-foreground leading-none">
                        {r.edition_year} edition
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {r.schools?.name ?? "Your school"} · {r.status}
                      </p>
                    </div>
                  </div>
                  {edition && results.length ? (
                    <div className="mt-3 border-t border-foreground/5 pt-3">
                      <StageResults
                        edition={edition.year}
                        stages={edition.stages}
                        results={results}
                      />
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No stage results recorded for this edition.
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      {pendingMemberships.length > 0 ? (
        <Card className="p-5 md:p-6 border-l-4 border-l-primary">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1">
            Awaiting approval
          </p>
          <p className="text-sm text-muted-foreground">
            Your access to{" "}
            <span className="font-medium text-foreground">
              {pendingMemberships
                .map((m) => m.schools?.name)
                .filter(Boolean)
                .join(", ") || "your school"}
            </span>{" "}
            is pending an administrator&apos;s approval.
          </p>
        </Card>
      ) : null}

      {latest ? (
        <div>
          <SectionHeading>{latest.year} edition</SectionHeading>
          <Card className="p-5 md:p-6 space-y-3">
            <EditionStages stages={latest.stages} current={latest.current_stage} />
            <p className="text-sm text-muted-foreground">
              Current stage:{" "}
              <span className="font-medium text-foreground">
                {latest.current_stage}
              </span>
              {nextStage(latest.stages, latest.current_stage) ? (
                <> · Next: {nextStage(latest.stages, latest.current_stage)}</>
              ) : null}
            </p>
          </Card>
        </div>
      ) : null}

      {latest && !registeredYears.has(latest.year) ? (
        <div>
          <SectionHeading>Register your school for {latest.year}</SectionHeading>
          <Card className="p-5 md:p-6">
            {latest.registration_open ? (
              <>
                <p className="serif-display italic text-muted-foreground mb-4">
                  Registration is open — enter your school and representatives to
                  join the {latest.year} edition.
                </p>
                <RegisterEditionForm year={latest.year} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Registration for {latest.year} isn&apos;t open yet. An admin can
                open it in{" "}
                <span className="font-medium text-foreground">Admin → Editions</span>.
              </p>
            )}
          </Card>
        </div>
      ) : null}

      {registrations.length === 0 ? (
        <div>
          <SectionHeading>Link a public registration</SectionHeading>
          <Card className="p-5 md:p-6">
            <p className="serif-display italic text-muted-foreground mb-4">
              Registered through the public form? Enter the claim code from your
              confirmation email to link it to this account.
            </p>
            <ClaimForm />
          </Card>
        </div>
      ) : null}
    </>
  );
}
