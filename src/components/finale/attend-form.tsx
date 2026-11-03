"use client";

import { useActionState, useState } from "react";
import { registerToAttend, type AttendFormResult } from "@/app/(public)/grand-finale/actions";
import {
  ATTEND_LGA_OPTIONS,
  ATTENDEE_ROLES,
  MAX_STUDENTS,
  STUDENT_CLASS_OPTIONS,
  bringsStudents,
  organisationLabel,
} from "@/lib/finale-attend";
import type { FinaleAttendeeRole } from "@/supabase/types";

const inputClass =
  "w-full min-h-12 rounded-md border border-white/15 bg-[#141B2E] px-3.5 text-base text-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/25";
const labelClass = "grid gap-1.5 text-sm font-bold text-[#F0EAD8]/85";

export default function AttendForm({ waitlist }: { waitlist: boolean }) {
  const [state, action, pending] = useActionState<AttendFormResult, FormData>(registerToAttend, null);
  // Controlled throughout: React resets an uncontrolled form after every action,
  // and a rejected submit would otherwise wipe a teacher's list of students.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<FinaleAttendeeRole>("teacher");
  const [organisation, setOrganisation] = useState("");
  const [lga, setLga] = useState("");
  const [count, setCount] = useState(1);
  const [students, setStudents] = useState<{ name: string; cls: string }[]>([]);

  const group = bringsStudents(role);
  const studentCount = group ? count : 0;
  const setCountClamped = (n: number) => {
    const next = Math.min(MAX_STUDENTS, Math.max(0, Number.isFinite(n) ? n : 0));
    setCount(next);
    setStudents((s) => s.slice(0, next));
  };
  const updateStudent = (i: number, patch: Partial<{ name: string; cls: string }>) =>
    setStudents((s) => s.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  if (state?.ok) {
    return (
      <div className="rounded-md border border-primary/50 bg-[#141B2E] p-6 text-[#F0EAD8]">
        <p className="text-lg font-bold text-white">Check your inbox</p>
        <p className="mt-2 text-sm leading-relaxed text-[#F0EAD8]/80">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className={labelClass}>
          First name
          <input name="first_name" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Last name
          <input name="last_name" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Email
          <input name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Phone number
          <input name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </label>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-bold text-[#F0EAD8]/85">I am a…</legend>
        <div className="flex flex-wrap gap-2">
          {ATTENDEE_ROLES.map((r) => (
            <label
              key={r.key}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-white/20 px-4 text-sm font-semibold text-[#F0EAD8] has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-[#0A0F1E] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
            >
              <input type="radio" name="role" value={r.key} checked={role === r.key} onChange={() => setRole(r.key)} className="sr-only" />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className={labelClass}>
          <span>
            {organisationLabel(role)}
            {role === "parent" || role === "other" ? <span className="font-medium text-[#F0EAD8]/45"> (optional)</span> : null}
          </span>
          <input name="organisation" value={organisation} onChange={(e) => setOrganisation(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>LGA <span className="font-medium text-[#F0EAD8]/45">(optional)</span></span>
          <select name="lga" value={lga} onChange={(e) => setLga(e.target.value)} className={`${inputClass} select-chevron-on-dark appearance-none bg-no-repeat pr-10`}>
            <option value="">Choose…</option>
            {ATTEND_LGA_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>

      {group ? (
        <fieldset className="grid gap-4 rounded-md border border-white/15 p-4 sm:p-5">
          <legend className="px-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">Students you're bringing</legend>
          <div className="grid gap-1.5">
            <label htmlFor="student_count" className="text-sm font-bold text-[#F0EAD8]/85">How many students?</label>
            <div className="flex w-max">
              <button type="button" aria-label="One fewer student" onClick={() => setCountClamped(count - 1)} className="size-12 border border-white/15 bg-[#141B2E] text-xl text-white">–</button>
              <input
                id="student_count"
                name="student_count"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCountClamped(parseInt(e.target.value || "0", 10))}
                className="h-12 w-20 border-y border-white/15 bg-[#141B2E] text-center font-mono text-lg text-white outline-none focus:border-primary"
              />
              <button type="button" aria-label="One more student" onClick={() => setCountClamped(count + 1)} className="size-12 border border-white/15 bg-[#141B2E] text-xl text-white">+</button>
            </div>
          </div>
          <div className="grid gap-2">
            <p className="text-sm font-bold text-[#F0EAD8]/85">
              Student names <span className="font-medium text-[#F0EAD8]/45">(optional, but it speeds up check-in)</span>
            </p>
            {students.map((s, i) => (
              <div key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_6rem_2.75rem] items-center gap-2">
                <span className="font-mono text-xs text-[#F0EAD8]/45">{i + 1}</span>
                <input name="student_name" aria-label={`Student ${i + 1} name`} placeholder="Full name" value={s.name} onChange={(e) => updateStudent(i, { name: e.target.value })} className={inputClass} />
                <select name="student_class" aria-label={`Student ${i + 1} class`} value={s.cls} onChange={(e) => updateStudent(i, { cls: e.target.value })} className={`${inputClass} px-2`}>
                  <option value="">Class</option>
                  {STUDENT_CLASS_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button type="button" aria-label={`Remove student ${i + 1}`} onClick={() => setStudents((rows) => rows.filter((_, j) => j !== i))} className="h-12 rounded-md border border-white/15 text-[#F0EAD8]/60">✕</button>
              </div>
            ))}
            {students.length < count ? (
              <button type="button" onClick={() => setStudents((s) => [...s, { name: "", cls: "" }])} className="justify-self-start rounded-md border border-dashed border-primary/60 px-3.5 py-2.5 text-sm font-bold text-primary">
                + Add a student name
              </button>
            ) : null}
          </div>
        </fieldset>
      ) : null}

      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px]" />

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-extrabold text-[#0A0F1E] disabled:opacity-60">
          {pending ? "Registering…" : waitlist ? "Join the waitlist" : "Register and email my ticket"}
        </button>
        <span className="text-sm text-[#F0EAD8]/70">
          {studentCount ? `${studentCount + 1} seats: you + ${studentCount} student${studentCount === 1 ? "" : "s"}` : "1 seat"}
        </span>
      </div>
      {state && !state.ok ? <p role="alert" className="text-sm text-red-300">{state.error}</p> : null}
      <p className="text-sm text-[#F0EAD8]/50">We only use your details for the Grand Finale. One registration per email address.</p>
    </form>
  );
}
