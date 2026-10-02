import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronRight,
  FileText,
  LayoutDashboard,
  MapPinned,
  Medal,
  Swords,
  UsersRound,
  Tent,
} from "lucide-react";
import { Card, PortalBody, PortalHeader } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { FilterBar, Pagination } from "@/components/portal/list-controls";
import { SubmitButton } from "@/components/portal/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { SchoolCertificatesCard } from "@/components/portal/participant-school-card";
import { SchoolLink } from "@/components/portal/school-link";
import { ParticipantCentresPreview } from "@/components/portal/participant-centres-preview";
import {
  advanceGroupEntries,
  allocateQualificationZonesBulk,
  assignGroupEntry,
  createTournamentGroup,
  createTournamentMatch,
  issueIndividualAward,
  recordMatchResult,
  saveQualificationDecision,
  updateGroupEntry,
} from "@/app/(portal)/portal/admin/actions";
import { QUALIFICATION_REASONS, type StageOutcome } from "@/supabase/types";
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
import type { RosterStudent } from "@/components/portal/participant-school-card";
import { PaperScoreBreakdown } from "@/components/portal/paper-score-breakdown";
import { percent } from "@/lib/paper-exam";
import { resultForStage } from "@/lib/paper-results";
import { Select } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";

const PAGE_SIZE = 20;
const inputClass =
  "rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-foreground/5 disabled:text-muted-foreground";
const compactInputClass =
  "rounded-md border border-foreground/15 bg-background px-2.5 py-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]";

const WORKSPACES: { id: PreviewView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "centres", label: "Centres", icon: MapPinned },
  { id: "qualifications", label: "Qualifications", icon: Medal },
  { id: "groups", label: "Groups", icon: UsersRound },
  { id: "knockouts", label: "Knockouts", icon: Swords },
  { id: "awards", label: "Awards & certificates", icon: Award },
];

function outcomeLabel(outcome?: StageOutcome | null) {
  if (outcome === "advanced") return "Advanced";
  if (outcome === "eliminated") return "Not advanced";
  if (outcome === "pending") return "Pending";
  return "Unmarked";
}

function outcomeClass(outcome?: StageOutcome | null) {
  if (outcome === "advanced") return "border-green-600/30 bg-green-100 text-green-800";
  if (outcome === "eliminated") return "border-red-600/30 bg-red-100 text-red-800";
  if (outcome === "pending") return "border-amber-300 bg-amber-100 text-amber-800";
  return "border-foreground/10 bg-foreground/5 text-muted-foreground";
}

function OutcomeBadge({ outcome }: { outcome?: StageOutcome | null }) {
  return <span className={`inline-flex whitespace-nowrap border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${outcomeClass(outcome)}`}>{outcomeLabel(outcome)}</span>;
}

/** A match still awaiting a decision. Face-offs use it to decide their own
 *  prominence; the workspace counters use it for their badges. */
function isUnresolved(match: PreviewMatch) {
  return !["completed", "cancelled"].includes(match.status);
}

function resultAt(participant: PreviewParticipant, stage: string) {
  return participant.results.find((result) => result.stage === stage) ?? null;
}

/** Leaderboard order for a stage: highest score first, unscored teams last so
 *  the work still to do stays together at the end. */
function byScoreAt(stage: string) {
  return (a: PreviewParticipant, b: PreviewParticipant) => {
    const as = resultAt(a, stage)?.score ?? null;
    const bs = resultAt(b, stage)?.score ?? null;
    if (as === null || bs === null) {
      if (as !== bs) return as === null ? 1 : -1;
    } else if (as !== bs) {
      return bs - as;
    }
    return a.school.localeCompare(b.school);
  };
}

/** Where a school name links back from, and whether this admin may open registrations. */
type LinkCtx = { from: string; enabled: boolean };

function makeHref(
  activeYear: number | null,
  view: PreviewView,
  extras: Record<string, string | number | undefined | null> = {},
) {
  const params = new URLSearchParams({ view });
  if (activeYear) params.set("edition", String(activeYear));
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return `/portal/admin/participants?${params.toString()}`;
}

function PreviewNav({ activeYear, view, counts }: {
  activeYear: number | null;
  view: PreviewView;
  counts: Partial<Record<PreviewView, string | number>>;
}) {
  return (
    <nav aria-label="Participant workspaces" className="sticky top-0 z-30 -mx-5 overflow-x-auto border-y border-foreground/10 bg-background/95 px-5 backdrop-blur md:-mx-10 md:px-10">
      <div className="mx-auto flex max-w-6xl min-w-max gap-1 py-2">
        {WORKSPACES.map((workspace) => {
          const Icon = workspace.icon;
          const active = workspace.id === view;
          return (
            <Link
              key={workspace.id}
              href={makeHref(activeYear, workspace.id)}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm transition-colors ${active ? "bg-secondary text-secondary-foreground shadow-sm" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}
            >
              <Icon className="size-4" />
              <span className={active ? "font-semibold" : ""}>{workspace.label}</span>
              {counts[workspace.id] !== undefined ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? "bg-white/10 text-secondary-foreground" : "bg-foreground/5 text-muted-foreground"}`}>{counts[workspace.id]}</span>
              ) : null}
            </Link>
          );
        })}
        <Link
          href={`/portal/admin/participants/camp${activeYear ? `?edition=${activeYear}` : ""}`}
          className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <Tent className="size-4" />
          <span>Camp</span>
        </Link>
      </div>
    </nav>
  );
}

function AttentionCard({ count, title, detail, href, urgent = false }: {
  count: number;
  title: string;
  detail: string;
  href: string;
  urgent?: boolean;
}) {
  return (
    <Link href={href} className={`group flex min-h-28 flex-col justify-between border p-4 transition-colors ${urgent && count ? "border-amber-300 bg-amber-50 hover:bg-amber-100/70" : "border-foreground/10 bg-card hover:border-primary/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`font-bebas text-3xl leading-none ${urgent && count ? "text-amber-800" : "text-foreground"}`}>{count}</span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </Link>
  );
}

function OverviewWorkspace({
  participants,
  groups,
  matches,
  activeYear,
  currentStage,
  link,
}: {
  link: LinkCtx;
  participants: PreviewParticipant[];
  groups: PreviewGroup[];
  matches: PreviewMatch[];
  activeYear: number | null;
  currentStage: string | null;
}) {
  const atQualifications = participants.filter((participant) => participant.standing.stage === "Qualifications").length;
  const pendingQualifications = participants.filter((participant) => {
    const outcome = resultAt(participant, "Qualifications")?.outcome;
    return !outcome || outcome === "pending";
  }).length;
  const awaitingGroup = participants.filter((participant) => resultAt(participant, "Qualifications")?.outcome === "advanced")
    .filter((participant) => !groups.some((group) => group.entries.some((entry) => entry.registration_id === participant.id))).length;
  const knockoutMatches = matches.filter((match) => match.kind !== "face_off");
  const unresolved = knockoutMatches.filter(isUnresolved).length;
  const missingCentres = participants.filter((participant) => !participant.centre.allocated).length;
  const eliminated = participants.filter((participant) => participant.results.some((result) => result.outcome === "eliminated")).length;
  const inKnockouts = participants.filter((participant) => ["Round of 24", "Round of 16", "Quarter Finals", "Semi Finals", "Finals"].includes(participant.standing.stage)).length;
  const completed = participants.filter((participant) => participant.standing.stage === "Completed").length;

  const funnel = [
    { label: "Approved", value: participants.length },
    { label: "Qualifications", value: atQualifications },
    { label: "Group stage", value: groups.reduce((sum, group) => sum + group.entries.length, 0) },
    { label: "Knockouts", value: inKnockouts },
    { label: "Completed", value: completed },
  ];
  const max = Math.max(participants.length, 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card className="border border-foreground/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bebas text-2xl text-foreground">Competition flow</p>
              <p className="text-sm text-muted-foreground">Edition-wide state, unaffected by list searches.</p>
            </div>
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-gold-ink">Current: {currentStage ?? "Not set"}</span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-5">
            {funnel.map((item, index) => (
              <div key={item.label} className="relative">
                <div className="flex items-end justify-between gap-2">
                  <span className="font-bebas text-3xl leading-none text-foreground">{item.value}</span>
                  {index < funnel.length - 1 ? <ArrowRight className="hidden size-4 text-muted-foreground/40 sm:block" /> : null}
                </div>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                <div className="mt-3 h-1.5 bg-foreground/5"><div className="h-full bg-primary" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-secondary p-5 text-secondary-foreground">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary-foreground/60">At a glance</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div><p className="font-bebas text-4xl leading-none">{participants.length - eliminated}</p><p className="text-xs text-secondary-foreground/60">still competing</p></div>
            <div><p className="font-bebas text-4xl leading-none">{eliminated}</p><p className="text-xs text-secondary-foreground/60">eliminated</p></div>
            <div><p className="font-bebas text-4xl leading-none">{groups.length}</p><p className="text-xs text-secondary-foreground/60">groups</p></div>
            <div><p className="font-bebas text-4xl leading-none">{knockoutMatches.length}</p><p className="text-xs text-secondary-foreground/60">bracket items</p></div>
          </div>
        </Card>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <AlertCircle className="size-5 text-gold-ink" />
          <div><h2 className="font-bebas text-2xl text-foreground">Needs attention</h2><p className="text-xs text-muted-foreground">Open the exact workspace needed to clear each queue.</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AttentionCard count={missingCentres} title="Centres not confirmed" detail="Review requests before Qualifications" href={makeHref(activeYear, "centres")} urgent />
          <AttentionCard count={pendingQualifications} title="Qualification decisions" detail="Enter scores and outcomes" href={makeHref(activeYear, "qualifications", { status: "pending" })} urgent />
          <AttentionCard count={awaitingGroup} title="Awaiting a group" detail="Assign qualified school teams" href={makeHref(activeYear, "groups")} />
          <AttentionCard count={unresolved} title="Unresolved matches" detail="Record scores, winners, or face-offs" href={makeHref(activeYear, "knockouts", { status: "pending" })} urgent />
        </div>
      </section>

      <Card className="overflow-hidden border border-foreground/10">
        <div className="flex items-center justify-between border-b border-foreground/10 px-5 py-4">
          <div><p className="font-bebas text-2xl text-foreground">Participant directory</p><p className="text-xs text-muted-foreground">A quick operational snapshot of the first twelve teams.</p></div>
          <Button asChild size="sm" variant="outline"><Link href={makeHref(activeYear, "qualifications")}>Open results workspace</Link></Button>
        </div>
        <div className="divide-y divide-foreground/5">
          {participants.slice(0, 12).map((participant) => (
            <div key={participant.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_9rem] sm:items-center">
              <div><p className="text-sm font-semibold text-foreground"><SchoolLink registrationId={participant.id} {...link}>{participant.school}</SchoolLink></p><p className="text-xs text-muted-foreground">{participant.lga ?? "No LGA"} · {participant.reps} reps</p></div>
              <span className={`text-xs ${participant.centre.allocated ? "text-foreground" : "font-medium text-amber-700"}`}>{participant.centre.allocated ?? "Centre unconfirmed"}</span>
              <span className="text-xs font-medium text-muted-foreground sm:text-right">{participant.standing.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function FilterPill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-bold ${active ? "bg-secondary text-secondary-foreground" : "border border-foreground/10 bg-card text-muted-foreground hover:text-foreground"}`}>{children}</Link>;
}

/** The reps behind a school's row, with the score each one actually got. Read
 *  only: a paper score comes from the import, which re-grades against the key —
 *  editing it here would leave it disagreeing with the paper it came from. */
function RepScores({
  roster,
  resultsById,
  stage,
  editionYear,
}: {
  roster: RosterStudent[];
  resultsById: Record<string, PreviewRepResult[]>;
  stage: string;
  /** Matched on as well as the stage. A student row is retagged into the next
   *  edition rather than duplicated, so it keeps every previous year's results
   *  — matching on stage alone shows last year's score as this year's. */
  editionYear: number | null;
}) {
  if (roster.length === 0) {
    return <p className="text-xs text-muted-foreground">No reps on the roster yet.</p>;
  }

  const rows = roster.map((rep) => ({
    rep,
    result: resultForStage(resultsById[rep.id] ?? [], stage, editionYear),
  }));
  const scored = rows.filter((r) => r.result?.score != null);
  const total = scored.reduce((sum, r) => sum + Number(r.result?.score ?? 0), 0);
  const outOf = scored.reduce((sum, r) => sum + Number(r.result?.score_max ?? 0), 0);

  // Before any paper is graded every line would read "Not scored", so the reps
  // are named on one line instead of three rows of nothing.
  if (scored.length === 0) {
    return (
      <p className="border-t border-foreground/5 pt-3 text-xs text-muted-foreground">
        <span className="font-bold uppercase tracking-[0.16em]">Reps ({rows.length})</span>{" "}
        {rows.map(({ rep }) => rep.name).join(", ")} — no papers scored yet
      </p>
    );
  }

  return (
    <div className="border-t border-foreground/5 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Reps · {scored.length} of {rows.length} scored · {total}
        {outOf ? `/${outOf}` : ""} between them
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.map(({ rep, result }) => (
          <li key={rep.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-foreground">{rep.name}</span>
            {rep.level ? <span className="text-xs text-muted-foreground">{rep.level}</span> : null}
            {result?.score != null ? (
              <span className="text-sm tabular-nums text-foreground">
                {result.score}
                {result.score_max != null ? (
                  <span className="text-muted-foreground">/{result.score_max}</span>
                ) : null}
                {result.score_max ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {percent(Number(result.score), Number(result.score_max))}%
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not scored</span>
            )}
            {result?.breakdown && Object.keys(result.breakdown).length ? (
              <PaperScoreBreakdown
                breakdown={result.breakdown}
                order={result.subjectOrder}
                compact
              />
            ) : null}
            {result?.detailHref ? (
              <Link
                href={result.detailHref}
                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/5"
              >
                <FileText className="size-3" />
                View exam paper
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QualificationsWorkspace({
  participants,
  matches,
  activeYear,
  q,
  status,
  page,
  canManage,
  link,
}: {
  link: LinkCtx;
  participants: PreviewParticipant[];
  matches: PreviewMatch[];
  activeYear: number | null;
  q?: string;
  status: QualificationFilter;
  page: number;
  canManage: boolean;
}) {
  const searched = participants.filter((participant) => {
    const needle = q?.trim().toLowerCase();
    if (!needle) return true;
    return [participant.school, participant.lga, participant.email, participant.centre.value, ...participant.roster.map((student) => student.name)]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
  });
  // Sorted, not in registration order: this table is read as the leaderboard.
  const filtered = searched
    .filter((participant) => {
      const outcome = resultAt(participant, "Qualifications")?.outcome;
      if (status === "pending") return !outcome || outcome === "pending";
      if (status === "advanced") return outcome === "advanced";
      if (status === "eliminated") return outcome === "eliminated";
      if (status === "missing-centre") return !participant.centre.allocated;
      return true;
    })
    .sort(byScoreAt("Qualifications"));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const filters: { id: QualificationFilter; label: string }[] = [
    { id: "all", label: "All" }, { id: "pending", label: "Pending" }, { id: "advanced", label: "Advanced" },
    { id: "eliminated", label: "Not advanced" }, { id: "missing-centre", label: "Missing centre" },
  ];
  const faceOffs = matches.filter((match) => match.kind === "face_off" && match.stage === "Qualifications");
  const pendingFaceOffs = faceOffs.filter(isUnresolved).length;

  return (
    <div className="space-y-5">
      <FilterBar q={q} placeholder="Search school, centre, email, or rep…" preserve={{ view: "qualifications", edition: activeYear ? String(activeYear) : undefined, status: status === "all" ? undefined : status }} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">{filters.map((filter) => <FilterPill key={filter.id} active={filter.id === status} href={makeHref(activeYear, "qualifications", { q, status: filter.id === "all" ? undefined : filter.id })}>{filter.label}</FilterPill>)}</div>
        <div className="flex flex-wrap items-center gap-3">
          {faceOffs.length ? (
            <a
              href="#qualification-face-offs"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                pendingFaceOffs
                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                  : "bg-foreground/5 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Swords className="size-3.5" />
              {pendingFaceOffs
                ? `${pendingFaceOffs} face-off${pendingFaceOffs === 1 ? "" : "s"} to resolve`
                : `${faceOffs.length} face-off${faceOffs.length === 1 ? "" : "s"}`}
            </a>
          ) : null}
          <p className="text-xs text-muted-foreground">Showing {filtered.length} of {participants.length} teams</p>
        </div>
      </div>

      {paged.length ? (
        <Card className="overflow-hidden border border-foreground/10">
          {/* The header and each row are separate grids, so their column templates
              must be identical AND content-independent. An `auto` last column looked
              harmless but sized to its own content — "Action" in the header, a status
              badge plus a Save button in the rows — which left a different remainder
              for the 1.4fr school column and pushed every boundary out of line. Keep
              all six tracks fixed except the first. */}
          <div role="table" aria-label="Qualification results">
            <div role="row" className="hidden grid-cols-[minmax(13rem,1.4fr)_10rem_6rem_10rem_11rem_11rem] gap-3 border-b border-foreground/10 bg-foreground/[0.025] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
              <span>School</span><span>Centre</span><span>Team score</span><span>Reason</span><span>Outcome</span><span>Action</span>
            </div>
            <div className="divide-y divide-foreground/5">
              {paged.map((participant) => {
                const result = resultAt(participant, "Qualifications");
                return (
                  <form key={participant.id} action={saveQualificationDecision.bind(null, participant.id)} role="row" className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(13rem,1.4fr)_10rem_6rem_10rem_11rem_11rem] lg:items-center">
                    <div><p className="text-sm font-semibold text-foreground"><SchoolLink registrationId={participant.id} {...link}>{participant.school}</SchoolLink></p><p className="mt-0.5 text-xs text-muted-foreground">{participant.lga ?? "No LGA"} · {participant.reps} reps</p></div>
                    <div>
                      <Link href={makeHref(activeYear, "centres", { focus: participant.id })} className={`inline-flex min-h-9 items-center text-xs font-medium hover:underline ${participant.centre.allocated ? participant.centre.isStandard ? "text-foreground" : "text-amber-700" : "text-red-700"}`}>
                        {participant.centre.allocated ?? "Confirm centre"}
                      </Link>
                    </div>
                    <label className="text-xs text-muted-foreground"><span className="lg:hidden">Team score</span><input name="score" type="number" step="any" defaultValue={result?.score ?? ""} disabled={!canManage} className={`${inputClass} mt-1 w-full lg:mt-0`} /></label>
                    <label className="text-xs text-muted-foreground"><span className="lg:hidden">Reason</span><Select name="reason" defaultValue={result?.reason ?? ""} disabled={!canManage} className="mt-1 w-full lg:mt-0"><option value="">No reason</option>{QUALIFICATION_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</Select></label>
                    <label className="text-xs text-muted-foreground"><span className="lg:hidden">Outcome</span><Select name="outcome" defaultValue={result?.outcome ?? "pending"} disabled={!canManage} className="mt-1 w-full lg:mt-0"><option value="pending">Pending</option><option value="advanced">Advance</option><option value="eliminated">Not advanced</option></Select></label>
                    <div className="flex items-center gap-2"><OutcomeBadge outcome={result?.outcome} />{canManage ? <SubmitButton size="sm" pendingText="Saving…">Save</SubmitButton> : <ReadOnlyBadge />}</div>
                    <div className="lg:col-span-full">
                      <RepScores roster={participant.roster} resultsById={participant.repResultsById} stage="Qualifications" editionYear={activeYear} />
                    </div>
                    <label className="text-xs text-muted-foreground lg:col-span-full">Note<input name="note" defaultValue={result?.note ?? ""} disabled={!canManage} className={`${inputClass} mt-1 w-full`} /></label>
                  </form>
                );
              })}
            </div>
          </div>
        </Card>
      ) : <EmptyState title="No qualification results match these filters" />}

      <Pagination page={safePage} pageCount={pageCount} path="/portal/admin/participants" params={{ view: "qualifications", edition: activeYear ? String(activeYear) : undefined, q, status: status === "all" ? undefined : status }} />

      <FaceOffSection link={link} id="qualification-face-offs" matches={faceOffs} participants={participants} stages={["Qualifications"]} activeYear={activeYear} canManage={canManage} title="Qualification face-offs" />
    </div>
  );
}

function GroupsWorkspace({ participants, groups, matches, activeYear, canManage, link }: {
  link: LinkCtx;
  participants: PreviewParticipant[];
  groups: PreviewGroup[];
  matches: PreviewMatch[];
  activeYear: number | null;
  canManage: boolean;
}) {
  const assigned = new Set(groups.flatMap((group) => group.entries.map((entry) => entry.registration_id)));
  const waiting = participants.filter((participant) => resultAt(participant, "Qualifications")?.outcome === "advanced" && !assigned.has(participant.id));
  const faceOffs = matches.filter((match) => match.kind === "face_off" && match.stage === "Grand Finale Group Stage");

  return (
    <div className="space-y-6">
      {canManage ? (
        <Card className="border border-foreground/10 p-5">
          <div className="mb-4"><p className="font-bebas text-2xl text-foreground">Group setup</p><p className="text-sm text-muted-foreground">Create groups and place every qualified team before entering standings.</p></div>
          <div className="grid gap-5 lg:grid-cols-2">
            <form action={createTournamentGroup} className="grid gap-3 border border-foreground/10 bg-background/50 p-4 sm:grid-cols-2">
              <input type="hidden" name="edition_year" value={activeYear ?? ""} />
              <label className="text-xs text-muted-foreground sm:col-span-2">Group name<input name="name" required placeholder="Group A" className={`${inputClass} mt-1 w-full`} /></label>
              <label className="text-xs text-muted-foreground">Teams to advance<input name="advance_count" type="number" min="0" defaultValue="2" className={`${inputClass} mt-1 w-full`} /></label>
              <label className="text-xs text-muted-foreground">Display order<input name="sort_order" type="number" defaultValue={groups.length + 1} className={`${inputClass} mt-1 w-full`} /></label>
              <div className="sm:col-span-2"><SubmitButton size="sm" pendingText="Saving…">Save group</SubmitButton></div>
            </form>
            <form action={assignGroupEntry} className="grid gap-3 border border-foreground/10 bg-background/50 p-4 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground sm:col-span-2"><span>Qualified school</span><SearchSelect name="registration_id" disabled={!waiting.length} className="mt-1 w-full" options={waiting.map((participant) => ({ value: participant.id, label: participant.school }))} placeholder="Choose a school…" searchPlaceholder="Search qualified schools…" aria-label="Qualified school" /></label>
              <label className="text-xs text-muted-foreground">Group<Select name="group_id" disabled={!groups.length} className="mt-1 w-full">{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></label>
              <label className="text-xs text-muted-foreground">Starting position<input name="seed" type="number" min="1" placeholder="Optional" className={`${inputClass} mt-1 w-full`} /></label>
              <div className="sm:col-span-2"><SubmitButton size="sm" pendingText="Assigning…" disabled={!waiting.length || !groups.length}>Assign to group</SubmitButton></div>
            </form>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside>
          <Card className="sticky top-20 border border-foreground/10 p-4">
            <div className="flex items-center justify-between"><div><p className="font-bebas text-xl text-foreground">Assignment queue</p><p className="text-xs text-muted-foreground">Qualified, without a group</p></div><span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-gold-ink">{waiting.length}</span></div>
            <div className="mt-4 space-y-2">{waiting.length ? waiting.map((participant) => <div key={participant.id} className="border border-foreground/10 bg-background px-3 py-2"><p className="text-sm font-medium text-foreground"><SchoolLink registrationId={participant.id} {...link}>{participant.school}</SchoolLink></p><p className="text-xs text-muted-foreground">{participant.centre.allocated ?? "Centre unconfirmed"} · {participant.reps} reps</p></div>) : <p className="py-5 text-center text-sm text-muted-foreground">Queue clear.</p>}</div>
          </Card>
        </aside>
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.length ? groups.map((group) => {
            const advancing = group.entries.filter((entry) => entry.advance_override ?? (entry.rank != null && entry.rank <= group.advance_count));
            const held = group.entries.filter((entry) => !advancing.includes(entry));
            return (
              <Card key={group.id} className="border border-foreground/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-bebas text-2xl text-foreground">{group.name}</p><p className="text-xs text-muted-foreground">Top {group.advance_count} advance · {group.entries.length} teams</p></div>
                  {canManage ? <form action={advanceGroupEntries.bind(null, group.id)}><ConfirmSubmitButton size="sm" title={`Apply ${group.name} advancement?`} description={`Advance: ${advancing.map((entry) => entry.school).join(", ") || "none"}. Not advanced: ${held.map((entry) => entry.school).join(", ") || "none"}. Manual overrides take priority over rank.`} confirmLabel="Apply these outcomes">Apply advancement</ConfirmSubmitButton></form> : null}
                </div>
                <div className="mt-4 space-y-2">{group.entries.length ? group.entries.map((entry) => (
                  <form key={entry.id} action={updateGroupEntry.bind(null, entry.id)} className="grid gap-2 border border-foreground/10 bg-background/50 p-3 sm:grid-cols-[minmax(0,1fr)_4rem_5rem]">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground"><SchoolLink registrationId={entry.registration_id} {...link}>{entry.school}</SchoolLink></p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{entry.advance_override === true ? "Manual advance" : entry.advance_override === false ? "Manual hold" : entry.rank != null && entry.rank <= group.advance_count ? "In advancement places" : "Outside cutoff"}</p></div>
                    <input name="rank" type="number" defaultValue={entry.rank ?? ""} placeholder="Rank" aria-label={`Rank for ${entry.school}`} className={compactInputClass} />
                    <input name="score" type="number" step="any" defaultValue={entry.score ?? ""} placeholder="Score" aria-label={`Score for ${entry.school}`} className={compactInputClass} />
                    <Select size="sm" name="advance_override" defaultValue={entry.advance_override === true ? "advance" : entry.advance_override === false ? "hold" : ""} className="sm:col-span-2" aria-label={`Advancement override for ${entry.school}`}><option value="">Use rank</option><option value="advance">Advance</option><option value="hold">Hold</option></Select>
                    {canManage ? <SubmitButton size="sm" variant="outline" pendingText="Saving…">Save</SubmitButton> : null}
                    <input name="note" defaultValue={entry.note ?? ""} placeholder="Note" className={`${compactInputClass} sm:col-span-full`} aria-label={`Note for ${entry.school}`} />
                  </form>
                )) : <p className="py-5 text-center text-sm text-muted-foreground">No teams assigned.</p>}</div>
              </Card>
            );
          }) : <EmptyState title="No groups yet">Create a group above to begin assignments.</EmptyState>}
        </div>
      </div>
      <FaceOffSection link={link} id="group-stage-face-offs" matches={faceOffs} participants={participants} stages={["Grand Finale Group Stage"]} activeYear={activeYear} canManage={canManage} title="Group-stage face-offs" />
    </div>
  );
}

function MatchCard({ match, canManage, link }: { match: PreviewMatch; canManage: boolean; link: LinkCtx }) {
  const directAdvance = match.kind === "bye";
  return (
    <div className={`border p-3 ${match.status === "needs_face_off" ? "border-amber-300 bg-amber-50" : "border-foreground/10 bg-background/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-sm font-semibold text-foreground"><SchoolLink registrationId={match.team_a_registration_id} {...link}>{match.teamAName}</SchoolLink>{directAdvance ? " advances directly" : <> vs <SchoolLink registrationId={match.team_b_registration_id} {...link}>{match.teamBName}</SchoolLink></>}</p><p className="mt-1 text-xs text-muted-foreground">{match.kind === "face_off" ? "Face-off" : directAdvance ? "Direct advance" : "Match"} · {match.status.replaceAll("_", " ")}{match.venue ? ` · ${match.venue}` : ""}</p></div>
        {match.winnerName ? <span className="shrink-0 bg-green-100 px-2 py-1 text-[10px] font-bold uppercase text-green-800">Winner: <SchoolLink registrationId={match.winner_registration_id} {...link}>{match.winnerName}</SchoolLink></span> : null}
      </div>
      {canManage && !directAdvance ? (
        <form action={recordMatchResult.bind(null, match.id)} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">{match.teamAName}<input name="team_a_score" type="number" step="any" defaultValue={match.team_a_score ?? ""} className={`${compactInputClass} mt-1 w-full`} /></label>
          <label className="text-xs text-muted-foreground">{match.teamBName}<input name="team_b_score" type="number" step="any" defaultValue={match.team_b_score ?? ""} className={`${compactInputClass} mt-1 w-full`} /></label>
          <Select size="sm" name="winner_registration_id" defaultValue={match.winner_registration_id ?? ""} aria-label="Winner"><option value="">No winner</option>{match.team_a_registration_id ? <option value={match.team_a_registration_id}>{match.teamAName}</option> : null}{match.team_b_registration_id ? <option value={match.team_b_registration_id}>{match.teamBName}</option> : null}</Select>
          <Select size="sm" name="status" defaultValue={match.status} aria-label="Match status"><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="needs_face_off">Needs face-off</option><option value="cancelled">Cancelled</option></Select>
          <input name="note" defaultValue={match.note ?? ""} placeholder="Note" className={`${compactInputClass} sm:col-span-full`} />
          <div className="sm:col-span-full"><SubmitButton size="sm" pendingText="Saving…">Record result</SubmitButton></div>
        </form>
      ) : null}
    </div>
  );
}

// Tie-breakers belong beside the stage they resolve, which puts them below a table
// of up to 20 teams — far enough down that they were easy to miss entirely. Rather
// than move them above the results (and break the filter → table reading order),
// the section is addressable and the stage header links to it, so an unresolved
// face-off announces itself where you are already looking.
function FaceOffSection({ id, matches, participants, stages, activeYear, canManage, title, link }: {
  link: LinkCtx;
  id: string;
  matches: PreviewMatch[];
  participants: PreviewParticipant[];
  stages: string[];
  activeYear: number | null;
  canManage: boolean;
  title: string;
}) {
  const pending = matches.filter(isUnresolved).length;
  return (
    <details id={id} className="group scroll-mt-6 border border-foreground/10 bg-card" open={pending > 0}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div><p className="text-sm font-semibold text-foreground">{title}</p><p className="text-xs text-muted-foreground">Tie-breakers stay beside the stage they resolve.</p></div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${pending ? "bg-amber-100 text-amber-800" : "bg-foreground/5 text-muted-foreground"}`}>
          {pending ? `${pending} to resolve` : matches.length}
        </span>
      </summary>
      <div className="border-t border-foreground/10 p-4">
        {canManage ? (
          <form action={createTournamentMatch} className="mb-4 grid gap-3 md:grid-cols-[10rem_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] md:items-end">
            <input type="hidden" name="edition_year" value={activeYear ?? ""} /><input type="hidden" name="kind" value="face_off" />
            <label className="text-xs text-muted-foreground">Stage<Select name="stage" className="mt-1 w-full">{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</Select></label>
            <label className="text-xs text-muted-foreground"><span>First school</span><SearchSelect name="team_a_registration_id" className="mt-1 w-full" options={participants.map((participant) => ({ value: participant.id, label: participant.school }))} placeholder="Choose a school…" searchPlaceholder="Search schools…" aria-label="First school" /></label>
            <label className="text-xs text-muted-foreground"><span>Second school</span><SearchSelect name="team_b_registration_id" className="mt-1 w-full" options={participants.map((participant) => ({ value: participant.id, label: participant.school }))} placeholder="Choose a school…" searchPlaceholder="Search schools…" aria-label="Second school" /></label>
            <label className="text-xs text-muted-foreground">Reason<input name="note" placeholder="Tie-breaker reason" className={`${inputClass} mt-1 w-full`} /></label>
            <SubmitButton size="sm" pendingText="Creating…">Add face-off</SubmitButton>
          </form>
        ) : null}
        <div className="grid gap-3 lg:grid-cols-2">{matches.length ? matches.map((match) => <MatchCard key={match.id} match={match} canManage={canManage} link={link} />) : <p className="text-sm text-muted-foreground">No face-offs for this stage.</p>}</div>
      </div>
    </details>
  );
}

function KnockoutsWorkspace({ participants, matches, stages, activeYear, canManage, pendingOnly, link }: {
  link: LinkCtx;
  participants: PreviewParticipant[];
  matches: PreviewMatch[];
  stages: string[];
  activeYear: number | null;
  canManage: boolean;
  pendingOnly: boolean;
}) {
  const knockoutStages = stages.filter((stage) => ["Round of 24", "Round of 16", "Quarter Finals", "Semi Finals", "Finals"].includes(stage));
  const allBracket = matches.filter((match) => match.kind !== "face_off");
  const bracket = pendingOnly
    ? allBracket.filter(isUnresolved)
    : allBracket;
  const faceOffs = matches.filter((match) => match.kind === "face_off" && knockoutStages.includes(match.stage));
  return (
    <div className="space-y-6">
      {canManage ? (
        <Card className="border border-foreground/10 p-5">
          <div className="mb-4"><p className="font-bebas text-2xl text-foreground">Add bracket item</p><p className="text-sm text-muted-foreground">Create a match or record a direct advance in the selected round.</p></div>
          <form action={createTournamentMatch} className="grid gap-3 lg:grid-cols-[9rem_10rem_minmax(11rem,1fr)_minmax(11rem,1fr)_6rem_minmax(9rem,1fr)_auto] lg:items-end">
            <input type="hidden" name="edition_year" value={activeYear ?? ""} />
            <label className="text-xs text-muted-foreground">Round<Select name="stage" className="mt-1 w-full">{knockoutStages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</Select></label>
            <label className="text-xs text-muted-foreground">Type<Select name="kind" className="mt-1 w-full"><option value="knockout">Match</option><option value="bye">Direct advance</option></Select></label>
            <label className="text-xs text-muted-foreground"><span>First school</span><SearchSelect name="team_a_registration_id" className="mt-1 w-full" options={participants.map((participant) => ({ value: participant.id, label: participant.school }))} placeholder="Choose a school…" searchPlaceholder="Search schools…" aria-label="First school" /></label>
            <label className="text-xs text-muted-foreground"><span>Opponent</span><SearchSelect name="team_b_registration_id" className="mt-1 w-full" options={[{ value: "", label: "No opponent" }, ...participants.map((participant) => ({ value: participant.id, label: participant.school }))]} placeholder="No opponent" searchPlaceholder="Search schools…" aria-label="Opponent" /></label>
            <label className="text-xs text-muted-foreground">Slot<input name="slot" type="number" min="1" className={`${inputClass} mt-1 w-full`} /></label>
            <label className="text-xs text-muted-foreground">Venue<input name="venue" className={`${inputClass} mt-1 w-full`} /></label>
            <SubmitButton size="sm" pendingText="Creating…">Add</SubmitButton>
          </form>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <FilterPill href={makeHref(activeYear, "knockouts")} active={!pendingOnly}>All matches</FilterPill>
          <FilterPill href={makeHref(activeYear, "knockouts", { status: "pending" })} active={pendingOnly}>Needs result</FilterPill>
        </div>
        <p className="text-xs text-muted-foreground">Showing {bracket.length} of {allBracket.length} bracket items</p>
      </div>

      {knockoutStages.length ? (
        <div className="overflow-x-auto pb-3">
          <div className="flex min-w-max items-start gap-4">
            {knockoutStages.map((stage) => {
              const roundMatches = bracket.filter((match) => match.stage === stage);
              const roundFaceOffs = faceOffs.filter((match) => match.stage === stage);
              return (
                <section key={stage} className="w-[21rem] shrink-0">
                  <div className="mb-3 flex items-center justify-between"><div><h2 className="font-bebas text-2xl text-foreground">{stage}</h2><p className="text-xs text-muted-foreground">{roundMatches.length} bracket item{roundMatches.length === 1 ? "" : "s"}</p></div>{roundMatches.some(isUnresolved) ? <span className="size-2 rounded-full bg-amber-500" title="Unresolved matches" /> : <CheckCircle2 className="size-4 text-green-700" />}</div>
                  <Card className="space-y-3 border border-foreground/10 p-3">{roundMatches.length ? roundMatches.map((match) => <MatchCard key={match.id} match={match} canManage={canManage} link={link} />) : <p className="py-6 text-center text-sm text-muted-foreground">No matches yet.</p>}{roundFaceOffs.length ? <div className="border-t border-amber-200 pt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Face-offs</p>{roundFaceOffs.map((match) => <MatchCard key={match.id} match={match} canManage={canManage} link={link} />)}</div> : null}</Card>
                </section>
              );
            })}
          </div>
        </div>
      ) : <EmptyState title="No knockout stages configured" />}
      <FaceOffSection link={link} id="knockout-face-offs" matches={[]} participants={participants} stages={knockoutStages} activeYear={activeYear} canManage={canManage} title="Create a knockout face-off" />
    </div>
  );
}

function AwardsWorkspace({ participants, students, awards, stages, activeYear, q, page, canManage, link }: {
  link: LinkCtx;
  participants: PreviewParticipant[];
  students: PreviewStudent[];
  awards: PreviewAward[];
  stages: string[];
  activeYear: number | null;
  q?: string;
  page: number;
  canManage: boolean;
}) {
  const needle = q?.trim().toLowerCase();
  const filtered = participants.filter((participant) => !needle || [participant.school, participant.lga, ...participant.roster.map((student) => student.name)].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle)));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return (
    <div className="space-y-6">
      {canManage ? (
        <Card className="border border-foreground/10 p-5">
          <div className="mb-4"><p className="font-bebas text-2xl text-foreground">Individual awards</p><p className="text-sm text-muted-foreground">Recognize a Rep independently of the school team&apos;s final standing.</p></div>
          <form action={issueIndividualAward} className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_10rem_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] md:items-end">
            <input type="hidden" name="edition_year" value={activeYear ?? ""} />
            <label className="text-xs text-muted-foreground"><span>Rep</span><SearchSelect name="student_id" className="mt-1 w-full" options={students.map((student) => ({ value: student.id, label: student.name, hint: student.school }))} placeholder="Choose a rep…" searchPlaceholder="Search reps by name or school…" aria-label="Rep" /></label>
            <label className="text-xs text-muted-foreground">Stage<Select name="stage" className="mt-1 w-full"><option value="">Whole Edition</option>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</Select></label>
            <label className="text-xs text-muted-foreground">Award<input name="title" required placeholder="Top Scorer" className={`${inputClass} mt-1 w-full`} /></label>
            <label className="text-xs text-muted-foreground">Note<input name="note" className={`${inputClass} mt-1 w-full`} /></label>
            <SubmitButton size="sm" pendingText="Saving…">Add award</SubmitButton>
          </form>
          {awards.length ? <div className="mt-4 flex flex-wrap gap-2">{awards.map((award) => <span key={award.id} className="border border-foreground/10 bg-background px-3 py-2 text-xs text-muted-foreground"><b className="text-foreground">{award.title}</b> · {award.studentName}{award.stage ? ` · ${award.stage}` : ""}</span>)}</div> : null}
        </Card>
      ) : null}
      <div>
        <div className="mb-3"><p className="font-bebas text-2xl text-foreground">Certificates by school</p><p className="text-sm text-muted-foreground">Search and expand only the school you need.</p></div>
        <FilterBar q={q} placeholder="Search school or rep…" preserve={{ view: "awards", edition: activeYear ? String(activeYear) : undefined }} />
        <div className="space-y-3">{paged.map((participant) => (
          <details key={participant.id} className="border border-foreground/10 bg-card">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-semibold text-foreground">{participant.school}</p><p className="text-xs text-muted-foreground">{participant.roster.length} reps · {participant.schoolCerts.length} school certificate{participant.schoolCerts.length === 1 ? "" : "s"}</p></div><ChevronRight className="size-4 text-muted-foreground" /></summary>
            <div className="border-t border-foreground/10 p-3"><SchoolCertificatesCard registrationId={participant.id} schoolName={participant.school} link={link} students={participant.roster} schoolCerts={participant.schoolCerts} studentCertsById={participant.studentCertsById} canManage={canManage} /></div>
          </details>
        ))}</div>
        <Pagination page={safePage} pageCount={pageCount} path="/portal/admin/participants" params={{ view: "awards", edition: activeYear ? String(activeYear) : undefined, q }} />
      </div>
    </div>
  );
}

export function ParticipantsPreview({
  years,
  activeYear,
  currentStage,
  stages,
  canEditCompetition,
  view,
  q,
  status,
  page,
  focus,
  participants,
  groups,
  matches,
  students,
  awards,
  venues,
  canOpenRegistrations,
}: {
  canOpenRegistrations: boolean;
  years: number[];
  activeYear: number | null;
  currentStage: string | null;
  stages: string[];
  canEditCompetition: boolean;
  view: PreviewView;
  q?: string;
  status: QualificationFilter;
  page: number;
  focus?: string;
  participants: PreviewParticipant[];
  groups: PreviewGroup[];
  matches: PreviewMatch[];
  students: PreviewStudent[];
  venues?: { id: string; name: string; town: string; legacy_zone: string | null }[];
  awards: PreviewAward[];
}) {
  const allocated = participants.filter((participant) => participant.centre.allocated).length;
  const qualificationAdvanced = participants.filter(
    (participant) => resultAt(participant, "Qualifications")?.outcome === "advanced",
  ).length;
  const unresolvedMatches = matches.filter((match) => match.kind !== "face_off" && isUnresolved(match)).length;
  const link: LinkCtx = { from: makeHref(activeYear, view), enabled: canOpenRegistrations };
  return (
    <>
      <PortalHeader
        title="Participants"
        subtitle="Approved school teams start at Qualifications; run centres, groups, matches, awards, and certificates here"
      />
      <PortalBody>
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-bebas text-3xl text-foreground">{activeYear ? `${activeYear} Competition` : "Competition"}</h2>{!canEditCompetition ? <ReadOnlyBadge /> : null}</div>
              <p className="mt-1 text-sm text-muted-foreground">Current stage: <b className="text-foreground">{currentStage ?? "Not configured"}</b></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {years.length > 1 ? <div className="flex flex-wrap gap-2">{years.map((year) => <Link key={year} href={makeHref(year, view)} className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-bold ${year === activeYear ? "bg-secondary text-secondary-foreground" : "bg-foreground/5 text-muted-foreground hover:text-foreground"}`}>{year}</Link>)}</div> : null}
            </div>
          </div>

          {!canEditCompetition ? <Card className="border border-foreground/10 bg-foreground/5 p-4 text-sm text-muted-foreground">This Edition is read-only. Competition results, allocations, groups, matches, awards, and certificates cannot be changed.</Card> : null}

          <PreviewNav activeYear={activeYear} view={view} counts={{ centres: `${allocated}/${participants.length}`, qualifications: `${qualificationAdvanced}/${participants.length}`, groups: groups.reduce((sum, group) => sum + group.entries.length, 0), knockouts: unresolvedMatches }} />

          <main>
            {view === "overview" ? <OverviewWorkspace participants={participants} groups={groups} matches={matches} activeYear={activeYear} currentStage={currentStage} link={link} /> : null}
            {view === "centres" ? <ParticipantCentresPreview participants={participants} canManage={canEditCompetition} focus={focus} action={allocateQualificationZonesBulk} venues={venues} link={link} /> : null}
            {view === "qualifications" ? <QualificationsWorkspace participants={participants} matches={matches} activeYear={activeYear} q={q} status={status} page={page} canManage={canEditCompetition} link={link} /> : null}
            {view === "groups" ? <GroupsWorkspace participants={participants} groups={groups} matches={matches} activeYear={activeYear} canManage={canEditCompetition} link={link} /> : null}
            {view === "knockouts" ? <KnockoutsWorkspace participants={participants} matches={matches} stages={stages} activeYear={activeYear} canManage={canEditCompetition} pendingOnly={status === "pending"} link={link} /> : null}
            {view === "awards" ? <AwardsWorkspace participants={participants} students={students} awards={awards} stages={stages} activeYear={activeYear} q={q} page={page} canManage={canEditCompetition} link={link} /> : null}
          </main>
        </div>
      </PortalBody>
    </>
  );
}
