"use client";

import { useActionState, useState } from "react";
import { respondToFinale } from "@/app/(portal)/portal/school/finale/actions";
import { SubmitButton } from "@/components/portal/submit-button";
import { MAX_STUDENTS, STUDENT_CLASS_OPTIONS, type OnRecordEducator, type RegisteredStudent } from "@/lib/finale-attend";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";

const inputCls = "w-full min-h-10 rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary";
const legendCls = "text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground";
const addCls = "justify-self-start rounded-md border border-dashed border-foreground/25 px-3 py-2 text-sm font-semibold text-gold-ink";
const removeCls = "h-10 w-10 shrink-0 rounded-md border border-foreground/15 text-muted-foreground hover:text-foreground";
const OTHER = "__other";

export type FinaleSchoolInitial = {
  attending: "yes" | "no" | "";
  going: string[];
  others: { name: string; phone: string }[];
  studentIds: string[];
  extras: { name: string; cls: string }[];
  studentCount: number;
};

/** `pick` is a record key / student id, OTHER for a typed-in person, or "" while unchosen. */
type EducatorRow = { pick: string; name: string; phone: string };
type StudentRow = { pick: string; name: string; cls: string };

export default function FinaleSchoolForm({
  registrationId,
  educators,
  students,
  initial,
}: {
  registrationId: string;
  educators: OnRecordEducator[];
  students: RegisteredStudent[];
  initial: FinaleSchoolInitial;
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(respondToFinale.bind(null, registrationId), null);
  // Controlled throughout: a rejected submit must not wipe a list of thirty names.
  const [attending, setAttending] = useState(initial.attending);
  const [eduRows, setEduRows] = useState<EducatorRow[]>(() => {
    const rows = [
      ...initial.going.map((key) => ({ pick: key, name: "", phone: educators.find((e) => e.key === key)?.phone ?? "" })),
      ...initial.others.map((o) => ({ pick: OTHER, name: o.name, phone: o.phone })),
    ];
    return rows.length ? rows : [{ pick: "", name: "", phone: "" }];
  });
  const [stuRows, setStuRows] = useState<StudentRow[]>(() => [
    ...initial.studentIds.map((id) => ({ pick: id, name: "", cls: "" })),
    ...initial.extras.map((x) => ({ pick: OTHER, name: x.name, cls: x.cls })),
  ]);
  const [count, setCount] = useState(initial.studentCount);

  const named = stuRows.filter((r) => (r.pick && r.pick !== OTHER) || (r.pick === OTHER && r.name.trim())).length;
  const educatorTotal = eduRows.filter((r) => (r.pick && r.pick !== OTHER) || (r.pick === OTHER && r.name.trim())).length;
  const takenEdu = new Set(eduRows.map((r) => r.pick));
  const takenStu = new Set(stuRows.map((r) => r.pick));

  const setEdu = (i: number, patch: Partial<EducatorRow>) => setEduRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setStu = (i: number, patch: Partial<StudentRow>) => {
    const next = stuRows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setStuRows(next);
    const nextNamed = next.filter((r) => (r.pick && r.pick !== OTHER) || (r.pick === OTHER && r.name.trim())).length;
    setCount((c) => Math.max(c, nextNamed));
  };

  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-2">
        <legend className={legendCls}>Is your school coming?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["yes", "Yes, we're coming"],
              ["no", "No, we can't make it"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-foreground/15 px-4 text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-[#0A0F1E] has-[:focus-visible]:outline has-[:focus-visible]:outline-2"
            >
              <input type="radio" name="attending" value={value} checked={attending === value} onChange={() => setAttending(value)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {attending === "yes" ? (
        <>
          <fieldset className="grid gap-3">
            <legend className={legendCls}>Educators coming</legend>
            <p className="text-sm text-muted-foreground">Choose from your school&apos;s record, or pick &ldquo;Other&rdquo; to type a name.</p>
            {eduRows.map((r, i) => {
              const onRecord = educators.find((e) => e.key === r.pick);
              return (
                <div key={i} className="grid gap-2 rounded-md border border-foreground/10 p-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-start sm:border-0 sm:p-0">
                  <div className="grid gap-2">
                    <select
                      aria-label={`Educator ${i + 1}`}
                      value={r.pick}
                      onChange={(e) => {
                        const pick = e.target.value;
                        setEdu(i, { pick, name: "", phone: educators.find((x) => x.key === pick)?.phone ?? "" });
                      }}
                      className={inputCls}
                    >
                      <option value="">Choose an educator…</option>
                      {educators.map((e) => (
                        <option key={e.key} value={e.key} disabled={e.key !== r.pick && takenEdu.has(e.key)}>
                          {e.name}
                          {e.email ? ` (${e.email})` : ""}
                        </option>
                      ))}
                      <option value={OTHER}>Other (type a name)…</option>
                    </select>
                    {r.pick === OTHER ? (
                      <input name="other_name" aria-label={`Educator ${i + 1} name`} placeholder="Full name" autoFocus value={r.name} onChange={(e) => setEdu(i, { name: e.target.value })} className={inputCls} />
                    ) : null}
                    {onRecord ? <input type="hidden" name="going" value={onRecord.key} /> : null}
                  </div>
                  <input
                    name={r.pick === OTHER ? "other_phone" : onRecord ? `phone:${onRecord.key}` : undefined}
                    type="tel"
                    aria-label={`Educator ${i + 1} phone`}
                    placeholder="Phone (optional)"
                    disabled={!r.pick}
                    value={r.phone}
                    onChange={(e) => setEdu(i, { phone: e.target.value })}
                    className={inputCls}
                  />
                  <button type="button" aria-label={`Remove educator ${i + 1}`} onClick={() => setEduRows((rows) => rows.filter((_, j) => j !== i))} className={removeCls}>
                    ✕
                  </button>
                </div>
              );
            })}
            <button type="button" onClick={() => setEduRows((rows) => [...rows, { pick: "", name: "", phone: "" }])} className={addCls}>
              + Add an educator
            </button>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className={legendCls}>Students coming</legend>
            <p className="text-sm text-muted-foreground">
              Optional, but names speed up check-in. Choose a registered student, or pick &ldquo;Other&rdquo; to type a name.
            </p>
            {stuRows.map((r, i) => {
              const onRecord = students.find((s) => s.id === r.pick);
              return (
                <div key={i} className="grid gap-2 rounded-md border border-foreground/10 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-start sm:border-0 sm:p-0">
                  <div className="grid gap-2">
                    <select aria-label={`Student ${i + 1}`} value={r.pick} onChange={(e) => setStu(i, { pick: e.target.value, name: "", cls: "" })} className={inputCls}>
                      <option value="">Choose a student…</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id} disabled={s.id !== r.pick && takenStu.has(s.id)}>
                          {s.name}
                          {s.level ? ` · ${s.level}` : ""}
                        </option>
                      ))}
                      <option value={OTHER}>Other (type a name)…</option>
                    </select>
                    {r.pick === OTHER ? (
                      <input name="extra_name" aria-label={`Student ${i + 1} name`} placeholder="Full name" autoFocus value={r.name} onChange={(e) => setStu(i, { name: e.target.value })} className={inputCls} />
                    ) : null}
                    {onRecord ? <input type="hidden" name="student_id" value={onRecord.id} /> : null}
                  </div>
                  {r.pick === OTHER ? (
                    <select name="extra_class" aria-label={`Student ${i + 1} class`} value={r.cls} onChange={(e) => setStu(i, { cls: e.target.value })} className={inputCls}>
                      <option value="">Class</option>
                      {STUDENT_CLASS_OPTIONS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="hidden min-h-10 items-center px-1 text-sm text-muted-foreground sm:flex">{onRecord?.level ?? ""}</span>
                  )}
                  <button type="button" aria-label={`Remove student ${i + 1}`} onClick={() => setStuRows((rows) => rows.filter((_, j) => j !== i))} className={removeCls}>
                    ✕
                  </button>
                </div>
              );
            })}
            <button type="button" onClick={() => setStuRows((rows) => [...rows, { pick: "", name: "", cls: "" }])} className={addCls}>
              + Add a student
            </button>
            <label className="grid max-w-56 gap-1 text-sm font-semibold">
              Total students coming
              <input
                name="student_count"
                type="number"
                min={named}
                max={MAX_STUDENTS}
                value={count}
                onChange={(e) => setCount(Math.min(MAX_STUDENTS, Math.max(0, parseInt(e.target.value || "0", 10))))}
                className={inputCls}
              />
              <span className="text-xs font-normal text-muted-foreground">Include students you haven&apos;t named. At least {named}.</span>
            </label>
          </fieldset>

          <p className="rounded-md bg-foreground/5 px-4 py-3 text-sm">
            <b>{educatorTotal + count} seats</b>: {educatorTotal} educator{educatorTotal === 1 ? "" : "s"} and {count} student{count === 1 ? "" : "s"}.
          </p>
        </>
      ) : null}

      {attending ? (
        <div className="grid gap-2">
          <div>
            <SubmitButton pendingText="Saving…">{attending === "yes" ? "Confirm and email our ticket" : "Send our answer"}</SubmitButton>
          </div>
          {state && !state.ok ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
          {state?.ok ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
