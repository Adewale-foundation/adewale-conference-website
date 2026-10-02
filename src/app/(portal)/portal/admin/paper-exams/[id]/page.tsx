import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/portal/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ConfirmDecisionButton } from "@/components/portal/confirm-decision-button";
import SettingsTabs from "@/components/portal/settings-tabs";
import PaperExamImport from "@/components/portal/paper-exam-import";
import PaperKeyEditor from "@/components/portal/paper-key-editor";
import { PaperExamPhaseBadge } from "@/components/portal/paper-exam-phase-badge";
import { Card, PortalBody, PortalHeader, SectionHeading } from "@/components/portal/ui";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { pageMetadata } from "@/lib/seo";
import ActionForm from "@/components/portal/action-form";
import { CutSelectionControls } from "@/components/portal/cut-selection-controls";
import { createClient } from "@/supabase/server";
import { canManageModule, canViewModule, requireModuleView } from "@/supabase/auth";
import { SchoolLink } from "@/components/portal/school-link";
import {
  SCHOOL_SCORE_RULE_LABELS,
  groupByLga,
  paperExamPhase,
  percent,
  type SchoolScoreRule,
} from "@/lib/paper-exam";
import { QUALIFICATION_REASONS, type PaperExam, type PaperExamImport as ImportRow } from "@/supabase/types";
import {
  allocateNumbers,
  commitCut,
  deletePaperExam,
  discardImport,
  setBackfill,
  previewCut,
  setReviewReleased,
  updatePaperExam,
} from "../actions";
import { Select } from "@/components/ui/select";
import { divisionOf } from "@/lib/ogun-division";

// The cut table's checkboxes sit above the commit form, so they reach it by id.
const CUT_FORM_ID = "paper-cut-commit";

export const metadata = pageMetadata("Paper exam", "Key, sheets, imports and ranking.");
export const dynamic = "force-dynamic";

const inputCls =
  "rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary";

export default async function PaperExamDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModuleView("participants");
  const [canManage, canOpenRegistrations] = await Promise.all([
    canManageModule("participants"),
    canViewModule("registrations"),
  ]);
  const { id } = await params;
  const sp = await searchParams;
  // Back from a school's registration lands on the same tab and cut preview.
  const examFrom = `/portal/admin/paper-exams/${id}?${new URLSearchParams(
    Object.entries({ tab: sp.tab, cut_kind: sp.cut_kind, cut_n: sp.cut_n, cut_min: sp.cut_min }).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  )}`;
  const supabase = await createClient();

  const { data: examRow } = await supabase
    .from("paper_exams")
    .select(
      "id, title, edition_year, stage, item_count, option_count, is_backfill, subjects, source_quiz_name, school_score_rule, school_score_top_n, review_released, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (!examRow) notFound();
  const exam = examRow as unknown as PaperExam;

  // Which edition is current decides whether this exam is locked, so the page
  // can say so plainly instead of leaving every button to fail one at a time.
  const { data: latestEdition } = await supabase
    .from("editions")
    .select("year")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentYear = Number(latestEdition?.year);
  const isPastEdition = Number(exam.edition_year) !== currentYear;

  const [{ data: items }, { data: candidates }, { data: imports }, { data: papers }] =
    await Promise.all([
      supabase
        .from("paper_exam_items")
        .select("version, position, subject, correct")
        .eq("exam_id", id)
        .order("version")
        .order("position"),
      supabase
        // !inner + the null filter drops a rep replaced after allocation: their
        // number is kept for the sheet already printed, but they are not on the
        // roster or in the count any more.
        .from("paper_exam_candidates")
        .select("exam_no, class_name, exported_at, students!inner(deactivated_at)")
        .eq("exam_id", id)
        .is("students.deactivated_at", null)
        .order("exam_no"),
      supabase
        .from("paper_exam_imports")
        .select(
          "id, filename, source, row_count, matched_count, undecided_count, key_mismatch_count, status, created_at, committed_at",
        )
        .eq("exam_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("paper_exam_papers").select("status, published_at").eq("exam_id", id),
    ]);

  // What the roster SHOULD hold, so a short count is visible rather than
  // discovered at the centre. Reps, not rep slots: a registration that lists
  // one name three times is one candidate.
  const [{ count: repCount }, { count: regCount }, { count: issuedCount }] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("edition_year", exam.edition_year)
      .is("deactivated_at", null),
    supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("edition_year", exam.edition_year)
      .neq("status", "declined"),
    // Every number ever handed out, retired ones included — allocation resumes
    // from the highest, so this and not the roster is what the 999 is spent on.
    supabase
      .from("paper_exam_candidates")
      .select("exam_no", { count: "exact", head: true })
      .eq("exam_id", id),
  ]);

  type ItemRow = { version: string; position: number; subject: string; correct: string };
  const keyRows = (items ?? []) as ItemRow[];
  const versions = [...new Set(keyRows.map((r) => r.version))].sort();
  const importRows = (imports ?? []) as unknown as ImportRow[];
  const candidateRows = (candidates ?? []) as {
    exam_no: string;
    class_name: string | null;
    exported_at: string | null;
  }[];
  const paperStatuses = (papers ?? []) as { status: string; published_at: string | null }[];
  const numbersIssued = Math.max(issuedCount ?? 0, candidateRows.length);
  const numbersRetired = numbersIssued - candidateRows.length;

  // Where this exam has got to. The tabs alone do not say what comes next, and
  // the order is not guessable — a key has to exist before results can be read
  // against it, and numbers have to be printed before there is anything to scan.
  const keyDone = keyRows.filter((r) => r.version === "A").length === exam.item_count;
  const sheetsDone = exam.is_backfill || candidateRows.length > 0;
  const stagedImport = importRows.find((i) => i.status === "staged");
  const publishedPapers = paperStatuses.filter((p) => p.published_at != null).length;
  const importDone = publishedPapers > 0;
  const undecidedNow = paperStatuses.filter((p) =>
    ["unmatched", "ambiguous", "duplicate"].includes(p.status),
  ).length;
  const publishedDone = exam.status === "published";

  const phase = paperExamPhase({
    keyComplete: keyDone,
    sheetsReady: sheetsDone,
    hasStagedImport: Boolean(stagedImport),
    hasPublishedPapers: importDone,
    published: publishedDone,
    isBackfill: exam.is_backfill,
  });

  const steps = [
    {
      slug: "key",
      name: "Answer key",
      done: keyDone,
      todo: `Set the ${exam.item_count} answers and their subjects`,
    },
    {
      slug: "sheets",
      name: exam.is_backfill ? "Candidate numbers" : "Sheets & roster",
      done: sheetsDone,
      todo: exam.is_backfill
        ? "Already on the student records for a past sitting"
        : "Allocate candidate numbers, then download the roster",
    },
    {
      slug: "imports",
      name: "Import results",
      done: importDone,
      todo: stagedImport
        ? undecidedNow
          ? `Resolve ${undecidedNow} staged paper${undecidedNow === 1 ? "" : "s"}, then commit`
          : "Commit the staged papers"
        : "Upload the capture file once the papers are scanned",
    },
    {
      slug: "results",
      name: "Rank & publish",
      done: publishedDone,
      todo: "Aggregate school scores, preview a cutoff, commit outcomes",
    },
  ];
  const nextStep = steps.find((st) => !st.done);
  const matchedPapers = paperStatuses.filter((p) => p.status === "matched").length;

  // class_name holds the rep's class (SS1 / SS2) — the capture tool prints its
  // pre-filled packs per Class, so these are the pack boundaries.
  const classes = [...new Set(candidateRows.map((c) => c.class_name).filter(Boolean))].sort() as string[];

  // The cutoff preview is driven by the URL so the whole tab stays server-
  // rendered and a preview can be shared or reloaded without re-entering it.
  const cutKind = sp.cut_kind === "min_score" ? "min_score" : "top_n";
  const cutN = Number(sp.cut_n ?? 100);
  const cutMin = Number(sp.cut_min ?? 50);
  // The standings render as soon as there are papers — hiding them behind
  // "Preview" also hid the per-school tick boxes, which is where manual
  // advancement lives. A rule is now only a way to PRE-TICK the table.
  const ruleApplied = sp.cut_kind !== undefined;
  const preview =
    canManage
      ? await previewCut(
          id,
          cutKind === "top_n"
            ? { kind: "top_n", n: Number.isInteger(cutN) && cutN > 0 ? cutN : 100 }
            : { kind: "min_score", min: Number.isFinite(cutMin) ? cutMin : 0 },
        )
      : null;
  // What finishing would actually do. "Not yet decided" and "decided against"
  // are different things, and Finish sweeps both into not-advancing — so the
  // count of the first is the number worth reading before clicking.
  const recordedAdvanced =
    preview?.standings.filter((x) => x.committedOutcome === "advanced").length ?? 0;
  const recordedOut =
    preview?.standings.filter((x) => x.committedOutcome === "eliminated").length ?? 0;
  const undecided =
    preview?.standings.filter((x) => x.committedOutcome == null).length ?? 0;

  return (
    <>
      <PortalHeader
        title={exam.title}
        subtitle={`${exam.edition_year} · ${exam.stage} · ${exam.item_count} items · A-${
          "ABCDE"[Number(exam.option_count ?? 4) - 1]
        } · ${phase.label}`}
      />
      <PortalBody>
        {!canManage ? (
          <div>
            <ReadOnlyBadge />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <PaperExamPhaseBadge phase={phase} />
          {nextStep ? (
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground">Next:</span> {nextStep.todo}.{" "}
              <Link
                href={`?tab=${nextStep.slug}`}
                scroll={false}
                className="text-primary hover:underline"
              >
                Go to {nextStep.name} →
              </Link>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Every step is done — results are published to students and coordinators.
            </p>
          )}
        </div>

        <SettingsTabs
          paramKey="tab"
          tabs={[
            {
              slug: "key",
              status: keyDone ? ("done" as const) : ("todo" as const),
              label: `Answer key (${keyRows.filter((r) => r.version === "A").length}/${exam.item_count})`,
              content: (
                <div className="space-y-6">
                  <div>
                    <SectionHeading>Subjects</SectionHeading>
                    <Card className="p-5 md:p-6">
                      {canManage ? (
                        <ActionForm
                          action={updatePaperExam.bind(null, id)}
                          className="grid gap-2 sm:grid-cols-2"
                        >
                          <input
                            name="subjects"
                            defaultValue={(exam.subjects ?? []).join(", ")}
                            className={`sm:col-span-2 ${inputCls}`}
                          />
                          <input
                            name="source_quiz_name"
                            defaultValue={exam.source_quiz_name ?? ""}
                            placeholder="Capture-tool quiz name (guards against the wrong export)"
                            className={`sm:col-span-2 ${inputCls}`}
                          />
                          <label className="text-sm text-muted-foreground">
                            School score
                            <Select
                              name="school_score_rule"
                              defaultValue={exam.school_score_rule}
                              className="ml-2"
                            >
                              {(
                                Object.entries(SCHOOL_SCORE_RULE_LABELS) as [
                                  SchoolScoreRule,
                                  string,
                                ][]
                              ).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="text-sm text-muted-foreground">
                            Top N
                            <input
                              name="school_score_top_n"
                              type="number"
                              min={1}
                              max={10}
                              defaultValue={exam.school_score_top_n}
                              className={`ml-2 w-20 ${inputCls}`}
                            />
                          </label>
                          <div className="sm:col-span-2">
                            <SubmitButton pendingText="Saving…">Save</SubmitButton>
                          </div>
                        </ActionForm>
                      ) : (
                        <p className="text-sm text-foreground">
                          {(exam.subjects ?? []).join(" · ")}
                        </p>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">
                        These strings are published to students as their subject breakdown, so
                        they are awkward to rename later. The school score rule is recorded on the
                        exam rather than assumed, so the ranking screen can say which rule
                        produced its numbers.
                      </p>
                    </Card>
                  </div>

                  {canManage ? (
                    <div>
                      <SectionHeading>Answer key</SectionHeading>
                      <PaperKeyEditor
                        examId={id}
                        itemCount={exam.item_count}
                        optionCount={Number(exam.option_count ?? 4)}
                        subjects={exam.subjects ?? []}
                        existingVersions={versions}
                        saved={versions.map((v) => ({
                          version: v,
                          count: keyRows.filter((r) => r.version === v).length,
                        }))}
                      />
                    </div>
                  ) : null}

                  <div>
                    <SectionHeading>
                      {versions.length > 1
                        ? `Answers on file (${versions.map((v) => `copy ${v}`).join(", ")})`
                        : "Answers on file"}
                    </SectionHeading>
                    {keyRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No answer key yet. Results can&apos;t be imported until you set one.
                      </p>
                    ) : (
                      <Card className="overflow-x-auto p-4">
                        <table className="w-full text-left text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="py-1 pr-3 font-normal">Copy</th>
                              <th className="py-1 pr-3 font-normal">Question</th>
                              <th className="py-1 pr-3 font-normal">Subject</th>
                              <th className="py-1 font-normal">Correct</th>
                            </tr>
                          </thead>
                          <tbody>
                            {keyRows.slice(0, 400).map((r) => (
                              <tr
                                key={`${r.version}-${r.position}`}
                                className="border-t border-foreground/5"
                              >
                                <td className="py-1 pr-3">{r.version}</td>
                                <td className="py-1 pr-3 tabular-nums">{r.position}</td>
                                <td className="py-1 pr-3">{r.subject}</td>
                                <td className="py-1 font-mono">{r.correct}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Card>
                    )}
                  </div>

                  {canManage && isPastEdition ? (
                    <div>
                      <SectionHeading>Past edition</SectionHeading>
                      <Card className="p-5 md:p-6 space-y-3">
                        <p className="text-sm text-foreground">
                          This exam is for {exam.edition_year}, and the current edition is{" "}
                          {currentYear || "unknown"}.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Past editions are locked so finished results cannot be changed by
                          accident. Importing a sitting that has already been run is not an
                          accident, so mark it as one and the lock no longer applies to this exam.
                          {exam.is_backfill
                            ? " It is marked, so every action here is available."
                            : " Until it is marked, every action here will refuse."}
                        </p>
                        <ActionForm action={setBackfill.bind(null, id)}>
                          <input
                            type="hidden"
                            name="is_backfill"
                            value={exam.is_backfill ? "0" : "1"}
                          />
                          <SubmitButton
                            variant={exam.is_backfill ? "outline" : "default"}
                            pendingText="Saving…"
                          >
                            {exam.is_backfill
                              ? "Stop treating this as a past sitting"
                              : "Mark as a past sitting being imported"}
                          </SubmitButton>
                        </ActionForm>
                      </Card>
                    </div>
                  ) : null}

                  {canManage && !publishedDone && !importDone ? (
                    <div>
                      <SectionHeading>Delete this exam</SectionHeading>
                      <Card className="p-5 md:p-6 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          A title can only be used once per edition and stage, so an exam set up
                          wrongly has to be deleted before it can be created again the same way.
                          This removes the answer key, any allocated candidate numbers and any
                          staged imports. It disappears once an import is committed — from then on
                          the scores are on students&apos; records and deleting would leave them
                          behind.
                        </p>
                        <ActionForm action={deletePaperExam.bind(null, id)}>
                          <ConfirmSubmitButton
                            variant="outline"
                            destructive
                            title="Delete this exam?"
                            description={`“${exam.title}” and everything staged under it will be removed. Scores already published to students are never touched — an exam that has published any is refused instead.`}
                            confirmLabel="Delete"
                          >
                            Delete this exam
                          </ConfirmSubmitButton>
                        </ActionForm>
                      </Card>
                    </div>
                  ) : null}
                </div>
              ),
            },
            {
              slug: "sheets",
              status: sheetsDone ? ("done" as const) : ("todo" as const),
              label: exam.is_backfill
                ? "Candidate numbers"
                : `Sheets & roster (${candidateRows.length})`,
              content: (
                <div className="space-y-6">
                  <div>
                    <SectionHeading>Candidate numbers</SectionHeading>
                    <Card className="p-5 md:p-6 space-y-3">
                      <p className="text-sm text-foreground">
                        {numbersIssued} of 999 numbers used
                        {repCount != null
                          ? `, for ${repCount} rep${repCount === 1 ? "" : "s"} on ${regCount ?? 0} registration${regCount === 1 ? "" : "s"}`
                          : ""}
                        .
                        {numbersRetired === 0
                          ? ""
                          : numbersRetired === 1
                            ? ` 1 number belongs to a rep who has since left and is never reissued, so the roster below lists ${candidateRows.length}.`
                            : ` ${numbersRetired} numbers belong to reps who have since left and are never reissued, so the roster below lists ${candidateRows.length}.`}
                        {repCount != null && repCount > candidateRows.length
                          ? ` ${repCount - candidateRows.length} still need one.`
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        One list for the whole exam: 001 upward, never reused, so a bubbled number
                        identifies exactly one candidate and a single import can span every centre.
                        Every registered rep gets one whether or not their school has been
                        approved yet — declined entries are left out — and a registration that
                        lists the same name more than once is one rep, not two. Re-running this
                        after a late school joins continues the list — it
                        never renumbers a rep whose sheet is already printed. The ceiling is 999,
                        which is what the 3-digit box on the sheet holds.
                      </p>
                      {exam.is_backfill ? (
                        <p className="text-sm text-amber-600 dark:text-amber-500">
                          This is a past sitting, so numbers are not allocated here — the students
                          already carry the numbers that were on their sheets, and those are what
                          the import matches against. Allocating would overwrite them.
                        </p>
                      ) : canManage ? (
                        <ActionForm action={allocateNumbers.bind(null, id)}>
                          <SubmitButton pendingText="Allocating…">
                            Allocate numbers for anyone missing one
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </Card>
                  </div>

                  <div>
                    <SectionHeading>Roster for the capture tool</SectionHeading>
                    <Card className="p-5 md:p-6 space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Import this into the capture tool, then print its pre-filled answer sheet
                        packs — each rep&apos;s name and candidate number already on the sheet.
                        Columns: First Name, Last Name, Student ID, Class, School, Teacher.
                        Identity is the candidate number alone, so nothing else about a student
                        leaves for the capture tool; School and Teacher are there for whoever
                        hands the sheets out. Packs are printed per Class, so download by class
                        if you want them pre-split.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline">
                          <a href={`/portal/admin/paper-exams/${id}/roster?scope=all`}>
                            Whole exam ({candidateRows.length})
                          </a>
                        </Button>
                        {classes.map((c) => (
                          <Button asChild variant="outline" key={c}>
                            <a
                              href={`/portal/admin/paper-exams/${id}/roster?scope=class:${encodeURIComponent(c)}`}
                            >
                              {c} ({candidateRows.filter((r) => r.class_name === c).length})
                            </a>
                          </Button>
                        ))}
                      </div>
                      {candidateRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Allocate candidate numbers first.
                        </p>
                      ) : null}
                    </Card>
                  </div>
                </div>
              ),
            },
            {
              slug: "imports",
              status: importDone ? ("done" as const) : ("todo" as const),
              label: `Import results (${importRows.length})`,
              content: (
                <div className="space-y-6">
                  {canManage ? (
                    <div>
                      <SectionHeading>Import captured results</SectionHeading>
                      <PaperExamImport examId={id} />
                    </div>
                  ) : null}

                  <div>
                    <SectionHeading>Import history</SectionHeading>
                    {importRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nothing imported yet.</p>
                    ) : (
                      <Card className="divide-y divide-foreground/5">
                        {importRows.map((imp) => (
                          <div
                            key={imp.id}
                            className="flex flex-wrap items-center justify-between gap-3 p-4"
                          >
                            <div className="min-w-0">
                              <Link
                                href={`/portal/admin/paper-exams/${id}/imports/${imp.id}`}
                                className="block truncate text-foreground hover:text-primary"
                              >
                                {imp.filename ?? "Capture import"}
                              </Link>
                              <span className="block text-xs text-muted-foreground">
                                {[
                                  new Date(imp.created_at).toLocaleString(),
                                  `${imp.row_count} papers`,
                                  `${imp.matched_count} matched`,
                                  imp.undecided_count
                                    ? `${imp.undecided_count} need a decision`
                                    : null,
                                  imp.key_mismatch_count
                                    ? `${imp.key_mismatch_count} key mismatch`
                                    : null,
                                  imp.status,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </div>
                            {canManage && imp.status === "staged" ? (
                              <ActionForm action={discardImport.bind(null, imp.id)}>
                                <ConfirmSubmitButton
                                  variant="outline"
                                  destructive
                                  title="Discard this import?"
                                  description="The staged papers stay on record but are not published. Nothing already committed is affected."
                                  confirmLabel="Discard"
                                >
                                  Discard
                                </ConfirmSubmitButton>
                              </ActionForm>
                            ) : null}
                          </div>
                        ))}
                      </Card>
                    )}
                  </div>
                </div>
              ),
            },
            {
              slug: "results",
              status: publishedDone ? ("done" as const) : ("todo" as const),
              label: "Rank & publish",
              content: (
                <div className="space-y-6">
                  <div>
                    <SectionHeading>Student review</SectionHeading>
                    <Card className="p-5 md:p-6 space-y-3">
                      <p className="text-sm text-foreground">
                        Per-item correct answers are{" "}
                        {exam.review_released ? "VISIBLE to students" : "hidden from students"}.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Students always see their total, their subject breakdown and which items
                        they got right. Releasing the review additionally shows the{" "}
                        <strong>correct answer</strong> per item. The key is reused across centres
                        and sittings, so release it only once every centre has sat the paper.
                      </p>
                      {canManage ? (
                        <ActionForm action={setReviewReleased.bind(null, id)}>
                          <input
                            type="hidden"
                            name="released"
                            value={exam.review_released ? "0" : "1"}
                          />
                          <ConfirmSubmitButton
                            variant={exam.review_released ? "outline" : "default"}
                            title={
                              exam.review_released
                                ? "Hide the correct answers again?"
                                : "Publish the correct answers?"
                            }
                            description={
                              exam.review_released
                                ? "Students keep their scores and breakdown but stop seeing the correct answer per item."
                                : "Every student who sat this paper will be able to see the correct answer for every item. Do this only after the last centre has sat it."
                            }
                            confirmLabel={exam.review_released ? "Hide answers" : "Release answers"}
                          >
                            {exam.review_released ? "Hide the answers" : "Release the answers"}
                          </ConfirmSubmitButton>
                        </ActionForm>
                      ) : null}
                    </Card>
                  </div>

                  <div>
                    {/* The commit lives in the section heading: it is this
                        section's action, and putting it above the standings read
                        as "do this first". */}
                    <SectionHeading
                      actions={
                        canManage && preview ? (
                          <ActionForm
                            id={CUT_FORM_ID}
                            action={commitCut.bind(null, id)}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="cut_kind" value={cutKind} />
                            <input type="hidden" name="cut_n" value={cutN} />
                            <input type="hidden" name="cut_min" value={cutMin} />
                            <label className="text-sm text-muted-foreground">
                              Reason
                              <Select name="reason" defaultValue="" className="ml-2">
                                <option value="">—</option>
                                {QUALIFICATION_REASONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </Select>
                            </label>
                            <ConfirmDecisionButton
                              name="mode"
                              value="advance"
                              size="sm"
                              title="Advance the ticked schools?"
                              description="Only the ticked schools are written, as advanced, under the reason chosen here. Every other school is left exactly as it is, so you can commit each route under its own reason."
                              confirmLabel="Advance them"
                            >
                              Advance ticked
                            </ConfirmDecisionButton>
                            <ConfirmDecisionButton
                              name="mode"
                              value="finish"
                              size="sm"
                              variant="outline"
                              title="Finish and publish?"
                              description={
                                `${recordedAdvanced} school${recordedAdvanced === 1 ? "" : "s"} stay advanced and keep the reason their batch recorded. ` +
                                `${recordedOut + undecided} are marked not advancing` +
                                (undecided > 0
                                  ? ` — and ${undecided} of those have NO decision recorded yet. If you have a route still to commit, cancel and commit it first.`
                                  : ".") +
                                " The exam is then published and students can see their results."
                              }
                              confirmLabel={
                                undecided > 0
                                  ? `Yes, publish and drop ${undecided} undecided`
                                  : "Finish and publish"
                              }
                            >
                              Finish &amp; publish
                            </ConfirmDecisionButton>
                          </ActionForm>
                        ) : null
                      }
                    >
                      Rank and cut ({matchedPapers} papers)
                    </SectionHeading>
                    <Card className="p-5 md:p-6 space-y-4">
                      <form method="get" className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="tab" value="results" />
                        <label className="text-sm text-muted-foreground">
                          Rule
                          <Select name="cut_kind" defaultValue={cutKind} className="ml-2">
                            <option value="top_n">Top N schools</option>
                            <option value="min_score">Minimum score</option>
                          </Select>
                        </label>
                        <label className="text-sm text-muted-foreground">
                          N
                          <input
                            name="cut_n"
                            type="number"
                            min={1}
                            defaultValue={cutN}
                            className={`ml-2 w-24 ${inputCls}`}
                          />
                        </label>
                        <label className="text-sm text-muted-foreground">
                          Minimum
                          <input
                            name="cut_min"
                            type="number"
                            defaultValue={cutMin}
                            className={`ml-2 w-24 ${inputCls}`}
                          />
                        </label>
                        <Button type="submit" variant="outline">
                          Preview
                        </Button>
                      </form>

                      {preview ? (
                        <>
                          <p className="text-sm text-muted-foreground">
                            {SCHOOL_SCORE_RULE_LABELS[preview.rule]}
                            {preview.rule === "sum_top_n" ? ` (N=${preview.topN})` : ""} ·{" "}
                            {preview.standings.length} schools ranked ·{" "}
                            {ruleApplied
                              ? `rule pre-ticks ${preview.advanced}${
                                  preview.cutScore !== null ? `, cut at ${preview.cutScore}` : ""
                                }`
                              : "tick the schools that advance, or preview a rule to pre-tick them"}
                          </p>

                          <p className="text-sm">
                            <span className="text-green-700">{recordedAdvanced} advanced</span>
                            {" · "}
                            <span className="text-muted-foreground">
                              {recordedOut} not advancing
                            </span>
                            {" · "}
                            <span className={undecided > 0 ? "text-amber-700" : "text-muted-foreground"}>
                              {undecided} no decision yet
                            </span>
                            {undecided > 0 ? (
                              <span className="text-muted-foreground">
                                {" "}
                                — filter to “Not yet decided” to see them. Finishing marks them
                                not advancing.
                              </span>
                            ) : null}
                          </p>

                          {ruleApplied && preview.tied.length > 0 ? (
                            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                              <p className="text-sm text-foreground">
                                Face-off needed — {preview.tied.length} schools are tied on{" "}
                                {preview.cutScore} and that score straddles the cut.
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {preview.tied.map((t, i) => (
                                  <span key={t.registrationId}>
                                    {i > 0 ? ", " : ""}
                                    <SchoolLink registrationId={t.registrationId} from={examFrom} enabled={canOpenRegistrations}>
                                      {t.schoolName}
                                    </SchoolLink>
                                  </span>
                                ))}
                                . Widen N to
                                include all of them, tick the ones that advance, or settle it
                                with a face-off — committing the rule as it stands would decide
                                a national tie by sort order.
                              </p>
                            </div>
                          ) : null}

                          {canManage ? (
                            <CutSelectionControls formId={CUT_FORM_ID} />
                          ) : null}

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="text-muted-foreground">
                                <tr>
                                  {canManage ? (
                                    <th className="py-1 pr-3 font-normal">Advance</th>
                                  ) : null}
                                  <th className="py-1 pr-3 font-normal">#</th>
                                  <th className="py-1 pr-3 font-normal">School</th>
                                  <th className="py-1 pr-3 font-normal">LGA</th>
                                  <th className="py-1 pr-3 font-normal">Division</th>
                                  {/* Already computed and already committed as
                                      lga_rank — surfaced because the top school
                                      in each LGA is its own qualifying route. */}
                                  <th className="py-1 pr-3 font-normal">In LGA</th>
                                  <th className="py-1 pr-3 font-normal">Reps</th>
                                  <th className="py-1 pr-3 font-normal">Score</th>
                                  <th className="py-1 pr-3 font-normal">Rule says</th>
                                  <th className="py-1 font-normal">Recorded</th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupByLga(preview.standings).flatMap((group) => [
                                  <tr
                                    key={`lga:${group.lga}`}
                                    data-lga-header={group.lga}
                                    className="border-t border-foreground/10 bg-foreground/[0.03]"
                                  >
                                    <td
                                      colSpan={canManage ? 10 : 9}
                                      className="px-1 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
                                    >
                                      {group.lga}
                                      <span className="ml-2 font-normal normal-case tracking-normal">
                                        {group.rows.length} school
                                        {group.rows.length === 1 ? "" : "s"}
                                        {group.champion ? (
                                          <>
                                            {" · champion "}
                                            <SchoolLink
                                              registrationId={group.champion.registrationId}
                                              from={examFrom}
                                              enabled={canOpenRegistrations}
                                              className="font-semibold text-foreground"
                                            >
                                              {group.champion.schoolName}
                                            </SchoolLink>
                                          </>
                                        ) : null}
                                      </span>
                                    </td>
                                  </tr>,
                                  ...group.rows.map((s) => (
                                  <tr
                                    key={s.registrationId}
                                    className="border-t border-foreground/5"
                                    data-cut-row={CUT_FORM_ID}
                                    data-lga={group.lga}
                                    data-division={divisionOf(s.lga) ?? ""}
                                    // What is on record, as one string the filter
                                    // can match: the reason if there is one, else
                                    // the bare outcome, else empty for undecided.
                                    data-recorded={
                                      s.committedOutcome === "advanced"
                                        ? (s.committedReason ?? "Advanced")
                                        : s.committedOutcome === "eliminated"
                                          ? "Not advancing"
                                          : ""
                                    }
                                    data-lga-rank={s.lgaRank}
                                    data-rank={s.rank}
                                    // Searched client-side so filtering only HIDES rows: a
                                    // hidden checkbox still submits, and a server-side filter
                                    // would silently commit every unlisted school as not
                                    // advancing.
                                    data-search={`${s.schoolName} ${s.lga ?? ""}`.toLowerCase()}
                                  >
                                    {canManage ? (
                                      <td className="py-1 pr-3">
                                        <input
                                          type="checkbox"
                                          form={CUT_FORM_ID}
                                          name="advance_ids"
                                          value={s.registrationId}
                                          defaultChecked={ruleApplied && s.outcome === "advanced"}
                                          aria-label={`Advance ${s.schoolName}`}
                                          className="size-4 accent-primary"
                                        />
                                      </td>
                                    ) : null}
                                    <td className="py-1 pr-3 tabular-nums">{s.rank}</td>
                                    <td className="py-1 pr-3">
                                      <SchoolLink registrationId={s.registrationId} from={examFrom} enabled={canOpenRegistrations}>
                                        {s.schoolName}
                                      </SchoolLink>
                                    </td>
                                    <td className="py-1 pr-3">{s.lga ?? "—"}</td>
                                    <td className="py-1 pr-3">{divisionOf(s.lga) ?? "—"}</td>
                                    <td className="py-1 pr-3 tabular-nums">
                                      {s.lgaRank ? (
                                        <span className={s.lgaRank === 1 ? "font-bold text-foreground" : ""}>
                                          {s.lgaRank}
                                        </span>
                                      ) : (
                                        "—"
                                      )}
                                    </td>
                                    <td className="py-1 pr-3 tabular-nums">{s.reps}</td>
                                    <td className="py-1 pr-3 tabular-nums">
                                      {s.score}
                                      {s.scoreMax ? `/${s.scoreMax}` : ""}
                                      {s.scoreMax ? (
                                        <span className="ml-1 text-muted-foreground">
                                          {percent(s.score, s.scoreMax)}%
                                        </span>
                                      ) : null}
                                    </td>
                                    <td className="py-1 pr-3 text-muted-foreground">
                                      {!ruleApplied
                                        ? "—"
                                        : s.outcome === "advanced"
                                          ? "Advancing"
                                          : "Not advancing"}
                                    </td>
                                    <td className="py-1">
                                      {s.committedOutcome === "advanced" ? (
                                        <span className="text-green-700">
                                          ✓ {s.committedReason ?? "Advanced"}
                                        </span>
                                      ) : s.committedOutcome === "eliminated" ? (
                                        <span className="text-muted-foreground">Not advancing</span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </td>
                                  </tr>
                                  )),
                                ])}
                              </tbody>
                            </table>
                          </div>

                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No standings yet — schools appear here once their papers are
                          matched and committed.
                        </p>
                      )}
                    </Card>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </PortalBody>
    </>
  );
}
