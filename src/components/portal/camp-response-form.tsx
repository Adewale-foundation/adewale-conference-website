"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { submitCampResponse } from "@/app/(portal)/portal/school/actions";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";
import {
  CAMP_EDUCATOR_ROLE_LABEL,
  MAX_EXTRA_EDUCATORS,
  educatorKey,
  type CampEducator,
} from "@/lib/camp";
import type { CampConfirmation } from "@/supabase/types";

const inputCls =
  "w-full rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary";
const labelCls = "text-[11px] uppercase tracking-[0.2em] text-muted-foreground";

// Controlled so a rejected submit keeps what the educator typed.
export default function CampResponseForm({
  registrationId,
  confirmation,
  record,
  savedExtras,
}: {
  registrationId: string;
  confirmation: CampConfirmation | null;
  /** Educators on record, with any saved going/phone choices applied. */
  record: CampEducator[];
  savedExtras: CampEducator[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    submitCampResponse.bind(null, registrationId),
    null,
  );
  const answered = confirmation?.status === "attending" || confirmation?.status === "not_attending";
  const [status, setStatus] = useState<string>(answered ? confirmation!.status : "");
  const [going, setGoing] = useState(() => new Set(record.filter((e) => e.going).map(educatorKey)));
  const [phones, setPhones] = useState<Record<string, string>>(() =>
    Object.fromEntries(record.map((e) => [educatorKey(e), e.phone ?? ""])),
  );
  const [extras, setExtras] = useState(() => savedExtras.map((e) => ({ name: e.name, phone: e.phone ?? "" })));
  const toggleGoing = (key: string, on: boolean) =>
    setGoing((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const setExtra = (i: number, field: "name" | "phone", value: string) =>
    setExtras((prev) => prev.map((x, j) => (j === i ? { ...x, [field]: value } : x)));
  const [notes, setNotes] = useState(confirmation?.notes ?? "");
  const [declineReason, setDeclineReason] = useState(confirmation?.decline_reason ?? "");
  const [repsConfirmed, setRepsConfirmed] = useState(confirmation?.reps_confirmed ?? false);
  const [terms, setTerms] = useState(confirmation?.status === "attending");

  const choice = (value: string, title: string, hint: string) => (
    <label
      className={`flex cursor-pointer items-start gap-3 border p-4 transition-colors ${
        status === value ? "border-primary bg-primary/[0.06]" : "border-foreground/15 hover:border-foreground/30"
      }`}
    >
      <input
        type="radio"
        name="status"
        value={value}
        checked={status === value}
        onChange={() => setStatus(value)}
        className="mt-1 accent-primary"
      />
      <span>
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
    </label>
  );

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className={`${labelCls} mb-2`}>Will your school attend?</legend>
        {choice("attending", "Yes, we're attending", "Secure our place for the three contestants and their educators.")}
        {choice("not_attending", "No, we can't attend", "Your place will be offered to another school.")}
      </fieldset>

      {status === "attending" ? (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className={`${labelCls} mb-1`}>Who is accompanying your students?</legend>
            <p className="text-sm text-muted-foreground">
              Tick each educator on record who is coming. Everyone going stays for the full
              camp, so check their phone number is right.
            </p>
            {record.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                We have no educators on record for your school. Add who is coming below.
              </p>
            ) : (
              <ul className="divide-y divide-foreground/5 border border-foreground/10">
                {record.map((e) => {
                  const key = educatorKey(e);
                  const on = going.has(key);
                  return (
                    <li key={key} className="grid gap-2 p-3 sm:grid-cols-[1fr_12rem] sm:items-center">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="going"
                          value={key}
                          checked={on}
                          onChange={(ev) => toggleGoing(key, ev.target.checked)}
                          className="mt-1"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-foreground">{e.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {CAMP_EDUCATOR_ROLE_LABEL[e.role]}
                            {e.email ? ` · ${e.email}` : ""} · {on ? "Going" : "Not going"}
                          </span>
                        </span>
                      </label>
                      <input
                        name={`phone:${key}`}
                        type="tel"
                        aria-label={`Phone for ${e.name}`}
                        placeholder="Phone number"
                        value={phones[key] ?? ""}
                        onChange={(ev) => setPhones((p) => ({ ...p, [key]: ev.target.value }))}
                        required={on}
                        disabled={!on}
                        className={`${inputCls} disabled:opacity-50`}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={`${labelCls} mb-1`}>Additional teachers (optional)</legend>
            {extras.map((x, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                <input
                  name="extra_name"
                  aria-label={`Additional teacher ${i + 1} name`}
                  placeholder="Full name"
                  value={x.name}
                  onChange={(ev) => setExtra(i, "name", ev.target.value)}
                  className={inputCls}
                />
                <input
                  name="extra_phone"
                  type="tel"
                  aria-label={`Additional teacher ${i + 1} phone`}
                  placeholder="Phone number"
                  value={x.phone}
                  onChange={(ev) => setExtra(i, "phone", ev.target.value)}
                  className={inputCls}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setExtras((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            {extras.length < MAX_EXTRA_EDUCATORS ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setExtras((prev) => [...prev, { name: "", phone: "" }])}
              >
                + Add a teacher not listed
              </Button>
            ) : null}
          </fieldset>

          <label className="block space-y-1">
            <span className={labelCls}>Medical or dietary notes (optional)</span>
            <textarea
              name="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergies, medication or anything the camp team should know"
              className={inputCls}
            />
          </label>
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              name="reps_confirmed"
              checked={repsConfirmed}
              onChange={(e) => setRepsConfirmed(e.target.checked)}
              className="mt-1"
            />
            <span>Our three registered contestants listed above will attend.</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              name="terms"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              className="mt-1"
            />
            <span>
              Everyone accompanying our students will stay on camp for the full three days and
              is responsible for them throughout. Students won&apos;t use phones during
              competition rounds.
            </span>
          </label>
        </div>
      ) : null}

      {status === "not_attending" ? (
        <label className="block space-y-1">
          <span className={labelCls}>Why can&apos;t your school attend?</span>
          <textarea
            name="decline_reason"
            rows={3}
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            required
            className={inputCls}
          />
        </label>
      ) : null}

      {state && !state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok && state.message ? <p className="text-sm text-green-700">{state.message}</p> : null}

      <Button type="submit" disabled={pending || !status}>
        {pending
          ? "Saving…"
          : status === "not_attending"
            ? "Submit response"
            : answered
              ? "Update our response"
              : "Secure our place"}
      </Button>
    </form>
  );
}
