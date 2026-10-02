import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  Card,
  PortalBody,
  PortalHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/portal/ui";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import ActionForm from "@/components/portal/action-form";
import { formatDate } from "@/lib/format";
import { personNameKey } from "@/lib/person-identity";
import {
  examCarryOver,
  type CarryCandidate,
  type CarryExam,
  type CarryPaper,
  type ExamCarryOver,
} from "@/lib/replacement-carry";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { SchoolLink } from "@/components/portal/school-link";
import type { StudentReplacementRow } from "@/supabase/types";
import { approveReplacement, declineReplacement } from "./actions";

export const metadata = pageMetadata(
  "Replacements",
  "Student replacement requests from schools.",
);
export const dynamic = "force-dynamic";

export default async function AdminReplacements() {
  await requireModuleView("registrations");
  const canManage = await canManageModule("registrations");

  const supabase = await createClient();

  // RLS (sr_read) returns all rows to admins.
  const { data, error } = await supabase
    .from("student_replacements")
    .select(
      "id, registration_id, school_id, rep_slot, old_student_id, old_name, old_level, new_name, new_level, reason, status, created_at, reviewed_at, schools(name), registrations(edition_year)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load replacements: ${error.message}`);
  const rows = (data ?? []) as unknown as StudentReplacementRow[];

  // Pending is a queue, so it stays in filing order. History answers "what did
  // I just do", which is reviewed_at — a request filed days ago and approved a
  // minute ago otherwise sinks below ones reviewed hours earlier.
  const pending = rows.filter((r) => r.status === "pending");
  const reviewedAt = (r: StudentReplacementRow) =>
    Date.parse(r.reviewed_at ?? r.created_at);
  const resolved = rows
    .filter((r) => r.status !== "pending")
    .sort((a, b) => reviewedAt(b) - reviewedAt(a));

  const carryable = canManage
    ? await carryableExams(supabase, pending)
    : new Map<string, ExamCarryOver>();

  return (
    <>
      <PortalHeader
        title="Replacements"
        subtitle="Schools swapping a rep for another student — approving retires the outgoing code and issues the incoming one."
      />
      <PortalBody>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <SectionHeading>
              Pending {pending.length > 0 ? `(${pending.length})` : ""}
            </SectionHeading>
            {!canManage ? <ReadOnlyBadge /> : null}
          </div>
          {pending.length === 0 ? (
            <p className="serif-display italic text-muted-foreground">
              No replacement requests awaiting review.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((r) => {
                const carry = carryable.get(r.id) ?? null;
                return (
                  <Card key={r.id} className="p-4 space-y-3">
                    <div>
                      <SchoolLink registrationId={r.registration_id} from="/portal/admin/replacements" className="font-medium text-foreground">
                        {r.schools?.name ?? "Unknown school"}
                      </SchoolLink>
                      <p className="text-sm text-foreground mt-1">
                        <span className="text-muted-foreground line-through">
                          {r.old_name}
                          {r.old_level ? ` · ${r.old_level}` : ""}
                        </span>
                        {"  →  "}
                        <span className="font-medium">
                          {r.new_name}
                          {r.new_level ? ` · ${r.new_level}` : ""}
                        </span>
                      </p>
                      {r.reason ? (
                        <p className="text-sm text-muted-foreground mt-1">
                          Reason: {r.reason}
                        </p>
                      ) : null}
                    </div>
                    {canManage ? (
                      <>
                        {carry ? (
                          <label className="flex items-start gap-2 rounded-md border border-foreground/10 bg-muted/40 p-3 text-sm text-foreground">
                            <input
                              type="checkbox"
                              form={`approve-${r.id}`}
                              name="carry_exam_id"
                              value={carry.examId}
                              className="mt-0.5 shrink-0"
                            />
                            <span>
                              {r.new_name} sat {carry.examTitle} on{" "}
                              {r.old_name}&rsquo;s number — carry number{" "}
                              {carry.examNo}{" "}
                              {carry.total === null
                                ? "across (no sheet captured yet)"
                                : `and its score (${carry.total}/${carry.outOf}) across`}
                              .
                              {carry.nameMismatch ? (
                                <span className="text-muted-foreground">
                                  {" "}
                                  The name written on that sheet did not match the
                                  number.
                                </span>
                              ) : null}
                            </span>
                          </label>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <ActionForm
                            id={`approve-${r.id}`}
                            action={approveReplacement.bind(null, r.id)}
                          >
                            <ConfirmSubmitButton
                              size="sm"
                              title="Approve this replacement?"
                              description={`${r.old_name}'s access code stops working and ${r.new_name} gets one. The registration is updated to match.${
                                carry
                                  ? " The exam number and score move across only if you ticked the box."
                                  : ""
                              }`}
                              confirmLabel="Yes, approve"
                            >
                              Approve
                            </ConfirmSubmitButton>
                          </ActionForm>
                          <ActionForm
                            action={declineReplacement.bind(null, r.id)}
                            className="flex items-center gap-2"
                          >
                            <input
                              name="note"
                              placeholder="Reason (optional)"
                              className="rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                            <ConfirmSubmitButton
                              size="sm"
                              variant="outline"
                              destructive
                              title="Decline this replacement?"
                              description={`No student changes. ${r.new_name} will not replace ${r.old_name}.`}
                              confirmLabel="Yes, decline"
                            >
                              Decline
                            </ConfirmSubmitButton>
                          </ActionForm>
                        </div>
                      </>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <SectionHeading>History</SectionHeading>
          {resolved.length === 0 ? (
            <p className="serif-display italic text-muted-foreground">
              Approved and declined requests appear here.
            </p>
          ) : (
            <Card className="divide-y divide-foreground/5">
              {resolved.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <div>
                    <SchoolLink registrationId={r.registration_id} from="/portal/admin/replacements" className="font-medium text-foreground">
                      {r.schools?.name ?? "Unknown school"}
                    </SchoolLink>
                    <p className="text-sm text-muted-foreground">
                      {r.old_name} → {r.new_name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge status={r.status} />
                    {r.reviewed_at ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(r.reviewed_at)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </PortalBody>
    </>
  );
}

// Which pending requests have an exam identity the incoming rep could take
// over. Read for the whole queue at once and unchunked: this is a review queue,
// so the id lists are a handful of rows, not the roster.
async function carryableExams(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pending: StudentReplacementRow[],
): Promise<Map<string, ExamCarryOver>> {
  const out = new Map<string, ExamCarryOver>();
  if (pending.length === 0) return out;

  const studentFor = new Map<string, string>();
  for (const r of pending) {
    if (r.old_student_id) studentFor.set(r.id, r.old_student_id);
  }

  // old_student_id is only filled at filing time when an active row matched the
  // name then. Resolve the rest by person key, as approveReplacement does — an
  // `ilike` miss here would hide the option and strand the score.
  const unresolved = pending.filter((r) => !r.old_student_id);
  if (unresolved.length > 0) {
    const { data, error } = await supabase
      .from("students")
      .select("id, name, school_id")
      .in("school_id", [...new Set(unresolved.map((r) => r.school_id))])
      .is("deactivated_at", null);
    if (error) throw new Error(`Could not read school rosters: ${error.message}`);
    const roster = (data ?? []) as { id: string; name: string; school_id: string }[];
    for (const r of unresolved) {
      const key = personNameKey(r.old_name);
      const hit = roster.find(
        (s) => s.school_id === r.school_id && personNameKey(s.name) === key,
      );
      if (hit) studentFor.set(r.id, hit.id);
    }
  }

  const studentIds = [...new Set(studentFor.values())];
  if (studentIds.length === 0) return out;

  const [candRes, paperRes] = await Promise.all([
    supabase
      .from("paper_exam_candidates")
      .select("student_id, exam_id, exam_no")
      .in("student_id", studentIds),
    supabase
      .from("paper_exam_papers")
      .select("student_id, exam_id, total, name_mismatch")
      .in("student_id", studentIds)
      .eq("status", "matched"),
  ]);
  if (candRes.error) {
    throw new Error(`Could not read candidate numbers: ${candRes.error.message}`);
  }
  if (paperRes.error) {
    throw new Error(`Could not read marked sheets: ${paperRes.error.message}`);
  }
  const candidates = (candRes.data ?? []) as (CarryCandidate & { student_id: string })[];
  const papers = (paperRes.data ?? []) as (CarryPaper & { student_id: string })[];

  const examIds = [...new Set(candidates.map((c) => c.exam_id))];
  if (examIds.length === 0) return out;
  const { data: examRows, error: examErr } = await supabase
    .from("paper_exams")
    .select("id, title, edition_year, item_count")
    .in("id", examIds);
  if (examErr) throw new Error(`Could not read paper exams: ${examErr.message}`);
  const exams = (examRows ?? []) as CarryExam[];

  for (const r of pending) {
    const studentId = studentFor.get(r.id);
    if (!studentId) continue;
    const carry = examCarryOver(
      exams,
      candidates.filter((c) => c.student_id === studentId),
      papers.filter((p) => p.student_id === studentId),
      r.registrations?.edition_year ?? null,
    );
    if (carry) out.set(r.id, carry);
  }
  return out;
}
