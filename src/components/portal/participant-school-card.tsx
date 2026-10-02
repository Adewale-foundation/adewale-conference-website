import { SchoolLink } from "@/components/portal/school-link";
import { Card } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ConfirmDecisionButton } from "@/components/portal/confirm-decision-button";
import type { StageOutcome, StageResult, StudentStageResult } from "@/supabase/types";
import {
  advanceStudent,
  cascadeAdvanceAction,
  issueCertificate,
  sendSchoolBack,
  syncRoster,
} from "@/app/(portal)/portal/admin/actions";
import { Select } from "@/components/ui/select";

export interface RosterStudent {
  id: string;
  name: string;
  level: string | null;
}

const inputCls =
  "rounded-md border border-foreground/15 bg-card px-2.5 py-1.5 text-sm outline-none focus:border-primary";

const OUTCOME_STYLE: Record<StageOutcome, { badge: string; label: string }> = {
  advanced: { badge: "bg-green-100 text-green-800 border-green-600/30", label: "Advanced" },
  eliminated: { badge: "bg-red-100 text-red-800 border-red-600/30", label: "Not advanced" },
  pending: { badge: "bg-primary/15 text-gold-ink border-primary/30", label: "Pending" },
};
const NOT_MARKED = "border-foreground/15 text-muted-foreground";

function OutcomeBadge({ outcome, score }: { outcome?: StageOutcome; score?: number | null }) {
  const style = outcome ? OUTCOME_STYLE[outcome] : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${
          style ? style.badge : NOT_MARKED
        }`}
      >
        {style ? style.label : "Not marked"}
      </span>
      {score != null ? (
        <span className="text-xs text-muted-foreground tabular-nums">{score}</span>
      ) : null}
    </span>
  );
}

// One school, scoped to a single stage (the active tab). No stage picker — the
// tab IS the stage. Cascade buttons and per-rep controls all carry the stage as
// a hidden field, so advancing here means "advance at THIS stage".
export function StageSchoolCard({
  registrationId,
  schoolName,
  meta,
  stage,
  prevStage,
  schoolResults,
  students,
  studentResultsById,
  canManage,
}: {
  registrationId: string;
  schoolName: string;
  meta: string;
  stage: string;
  // The stage this school advanced from to reach here — the "send back" target.
  // Null on the first stage (nowhere earlier to go).
  prevStage: string | null;
  schoolResults: StageResult[];
  students: RosterStudent[];
  studentResultsById: Record<string, StudentStageResult[]>;
  canManage: boolean;
}) {
  const schoolAt = schoolResults.find((r) => r.stage === stage);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-bebas text-2xl text-foreground">{schoolName}</span>
          <p className="text-sm text-muted-foreground">{meta}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <OutcomeBadge outcome={schoolAt?.outcome} score={schoolAt?.score} />
          {canManage && prevStage ? (
            <form action={sendSchoolBack.bind(null, registrationId)}>
              <input type="hidden" name="from_stage" value={prevStage} />
              <ConfirmSubmitButton
                size="sm"
                variant="ghost"
                destructive
                className="h-auto p-0 text-xs uppercase tracking-wide hover:bg-transparent hover:underline"
                title={`Send back to ${prevStage}?`}
                description={`Clears this school's results from ${prevStage} onward — reps included — and returns it to the ${prevStage} to be re-decided. Use this to undo a mistaken advance.`}
                confirmLabel="Yes, send back"
              >
                ↩ Send back to {prevStage}
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {/* Advance / eliminate at this stage. Each button confirms and shows a
          pending state; "reps only" is tucked away for the rare case. */}
      {canManage ? (
      <form
        action={cascadeAdvanceAction.bind(null, registrationId)}
        className="border-t border-foreground/5 pt-3 space-y-2"
      >
        <input type="hidden" name="stage" value={stage} />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Decide {schoolName} at {stage}
        </p>
        <div className="flex flex-wrap gap-2">
          <ConfirmDecisionButton
            name="op"
            value="advance-all"
            size="sm"
            title={`Advance ${schoolName} past the ${stage}?`}
            description="Marks the school AND all its reps as advanced — the school moves on to the next stage."
            confirmLabel="Yes, advance"
          >
            ✓ Advance (school + reps)
          </ConfirmDecisionButton>
          <ConfirmDecisionButton
            name="op"
            value="eliminate-all"
            size="sm"
            variant="outline"
            destructive
            title={`Mark ${schoolName} not advanced at the ${stage}?`}
            description="Marks the school and its reps as not advancing past this stage. Portal access stays open."
            confirmLabel="Yes, mark"
          >
            ✗ Not advanced
          </ConfirmDecisionButton>
        </div>
        <details>
          <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
            Reps only (leave the school as-is)…
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <ConfirmDecisionButton
              name="op"
              value="advance-reps"
              size="sm"
              variant="outline"
              title={`Advance every rep of ${schoolName} at the ${stage}?`}
              description="Marks each rep advanced. The school's own standing is left unchanged."
              confirmLabel="Yes, advance reps"
            >
              Advance reps
            </ConfirmDecisionButton>
            <ConfirmDecisionButton
              name="op"
              value="eliminate-reps"
              size="sm"
              variant="outline"
              destructive
              title={`Mark every rep of ${schoolName} not advanced at the ${stage}?`}
              description="Marks each rep as not advancing. The school's own standing is left unchanged."
              confirmLabel="Yes, mark reps"
            >
              Reps not advanced
            </ConfirmDecisionButton>
          </div>
        </details>
      </form>
      ) : null}

      {/* Roster at this stage */}
      <details className="border-t border-foreground/5 pt-3">
        <summary className="cursor-pointer text-sm font-bold uppercase tracking-wide text-foreground">
          Reps ({students.length})
        </summary>

        {students.length === 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              No roster yet — build it from this school&apos;s registered reps.
            </p>
            {canManage ? (
              <form action={syncRoster.bind(null, registrationId)}>
                <ConfirmSubmitButton
                  size="sm"
                  variant="outline"
                  title="Build the roster?"
                  description="Creates a student record for each of the school's reps so they can be advanced and certified individually. Idempotent."
                  confirmLabel="Yes, build"
                >
                  Sync roster
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {students.map((st) => {
              const at = (studentResultsById[st.id] ?? []).find((r) => r.stage === stage);
              return canManage ? (
                <form
                  key={st.id}
                  action={advanceStudent.bind(null, st.id)}
                  className="flex flex-wrap items-center gap-2 border border-foreground/10 bg-card/50 p-2"
                >
                  <input type="hidden" name="stage" value={stage} />
                  <span className="min-w-32 flex-1 text-sm font-medium text-foreground">
                    {st.name}
                    {st.level ? <span className="text-muted-foreground"> · {st.level}</span> : null}
                  </span>
                  <OutcomeBadge outcome={at?.outcome} />
                  <Select
                    name="outcome"
                    defaultValue={at?.outcome ?? "advanced"}
                    aria-label="Outcome"
                  >
                    <option value="advanced">Advanced</option>
                    <option value="eliminated">Not advanced</option>
                    <option value="pending">Pending</option>
                  </Select>
                  <input
                    name="score"
                    type="number"
                    step="any"
                    defaultValue={at?.score ?? ""}
                    placeholder="Score"
                    className={`${inputCls} w-24`}
                    aria-label="Score"
                  />
                  <SubmitButton size="sm" variant="outline" pendingText="Saving…">Save</SubmitButton>
                </form>
              ) : (
                <div
                  key={st.id}
                  className="flex flex-wrap items-center gap-2 border border-foreground/10 bg-card/50 p-2"
                >
                  <span className="min-w-32 flex-1 text-sm font-medium text-foreground">
                    {st.name}
                    {st.level ? <span className="text-muted-foreground"> · {st.level}</span> : null}
                  </span>
                  <OutcomeBadge outcome={at?.outcome} score={at?.score} />
                </div>
              );
            })}
          </div>
        )}
      </details>
    </Card>
  );
}

// One school's certificate issuance — school-wide and per rep — for the
// Certificates tab. Kept separate from advancement so the stage tabs stay lean.
export function SchoolCertificatesCard({
  registrationId,
  schoolName,
  students,
  schoolCerts,
  studentCertsById,
  canManage,
  link,
}: {
  registrationId: string;
  schoolName: string;
  /** Links the heading to the registration; plain text when omitted. */
  link?: { from: string; enabled: boolean };
  students: RosterStudent[];
  schoolCerts: { id: string; type: string | null }[];
  studentCertsById: Record<string, { id: string; type: string | null }[]>;
  canManage: boolean;
}) {
  return (
    <Card className="p-5 space-y-3">
      <SchoolLink
        registrationId={link ? registrationId : null}
        from={link?.from}
        enabled={link?.enabled}
        className="font-bebas text-xl text-foreground"
      >
        {schoolName}
      </SchoolLink>

      <div className="border-t border-foreground/5 pt-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
          School certificate
          {schoolCerts.length ? `: ${schoolCerts.map((c) => c.type ?? "—").join(", ")}` : ""}
        </p>
        {canManage ? (
          <form action={issueCertificate.bind(null, registrationId)} className="flex flex-col sm:flex-row gap-2">
            <input name="type" required placeholder="Certificate type (e.g. Participant)" className={`flex-1 ${inputCls}`} />
            <input name="asset_url" placeholder="Asset URL (optional)" className={`flex-1 ${inputCls}`} />
            <SubmitButton size="sm" pendingText="Issuing…">Issue</SubmitButton>
          </form>
        ) : null}
      </div>

      {students.length ? (
        <details className="border-t border-foreground/5 pt-3">
          <summary className="cursor-pointer text-sm font-bold uppercase tracking-wide text-foreground">
            Rep certificates ({students.length})
          </summary>
          <div className="mt-3 space-y-2">
            {students.map((st) => {
              const certs = studentCertsById[st.id] ?? [];
              return canManage ? (
                <form
                  key={st.id}
                  action={issueCertificate.bind(null, registrationId)}
                  className="flex flex-wrap items-center gap-2 border border-foreground/10 bg-card/50 p-2"
                >
                  <input type="hidden" name="student_id" value={st.id} />
                  <span className="min-w-32 flex-1 text-sm font-medium text-foreground">{st.name}</span>
                  <input name="type" required placeholder="Certificate (e.g. Finalist)" className={`${inputCls} flex-1 min-w-36`} />
                  <input name="asset_url" placeholder="Asset URL" className={`${inputCls} flex-1 min-w-36`} />
                  <SubmitButton size="sm" variant="ghost" pendingText="Issuing…">Issue</SubmitButton>
                  {certs.length ? (
                    <span className="w-full text-xs text-muted-foreground">
                      Issued: {certs.map((c) => c.type ?? "—").join(", ")}
                    </span>
                  ) : null}
                </form>
              ) : (
                <div
                  key={st.id}
                  className="flex flex-wrap items-center gap-2 border border-foreground/10 bg-card/50 p-2"
                >
                  <span className="min-w-32 flex-1 text-sm font-medium text-foreground">{st.name}</span>
                  {certs.length ? (
                    <span className="w-full text-xs text-muted-foreground">
                      Issued: {certs.map((c) => c.type ?? "—").join(", ")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No certificate issued</span>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </Card>
  );
}
