"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { submitCampResponse } from "@/app/(portal)/portal/school/actions";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";
import {
  CAMP_EDUCATOR_ROLE_LABEL,
  CAMP_EXTRA_STATUS_LABEL,
  OTHER_EDUCATOR,
  educatorKey,
  type CampEducator,
} from "@/lib/camp";
import type { CampConfirmation } from "@/supabase/types";

const inputCls =
  "w-full rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary";
const labelCls = "text-[11px] uppercase tracking-[0.2em] text-muted-foreground";
const EXTRA_TONE = {
  pending: "border-amber-400/60 bg-amber-50 text-amber-900",
  approved: "border-green-600/40 bg-green-50 text-green-900",
  declined: "border-red-600/40 bg-red-50 text-red-900",
} as const;

// Controlled so a rejected submit keeps what the educator typed.
export default function CampResponseForm({
  registrationId,
  confirmation,
  record,
  savedOther,
  schoolName,
}: {
  registrationId: string;
  confirmation: CampConfirmation | null;
  /** Educators on record, with the saved choice and phones applied. */
  record: CampEducator[];
  /** A saved primary who isn't on record. */
  savedOther: CampEducator | null;
  /** Repeated by the submit button, so nobody answers for a school without seeing its name. */
  schoolName: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    submitCampResponse.bind(null, registrationId),
    null,
  );
  const answered = confirmation?.status === "attending" || confirmation?.status === "not_attending";
  const [status, setStatus] = useState<string>(answered ? confirmation!.status : "");
  const [primary, setPrimary] = useState(() => {
    const saved = record.find((e) => e.going);
    return saved ? educatorKey(saved) : savedOther ? OTHER_EDUCATOR : "";
  });
  const [phones, setPhones] = useState<Record<string, string>>(() =>
    Object.fromEntries(record.map((e) => [educatorKey(e), e.phone ?? ""])),
  );
  const [other, setOther] = useState({ name: savedOther?.name ?? "", phone: savedOther?.phone ?? "" });
  const savedExtra = confirmation?.extra_educator ?? null;
  const [requestExtra, setRequestExtra] = useState(Boolean(savedExtra));
  const [extra, setExtra] = useState({
    name: savedExtra?.name ?? "",
    phone: savedExtra?.phone ?? "",
    reason: confirmation?.extra_reason ?? "",
  });
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
        {choice("attending", "Yes, we're attending", "Secure our place for the three contestants and one educator.")}
        {choice("not_attending", "No, we can't attend", "Your place will be offered to another school.")}
      </fieldset>

      {status === "attending" ? (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className={`${labelCls} mb-1`}>Who will accompany your students?</legend>
            <p className="text-sm text-muted-foreground">
              Each school brings <strong className="text-foreground">one educator</strong>. Choose
              who it is and check their phone number. They stay for the full camp.
            </p>
            <ul className="divide-y divide-foreground/5 border border-foreground/10">
              {record.map((e) => {
                const key = educatorKey(e);
                const on = primary === key;
                return (
                  <li key={key} className="grid gap-2 p-3 sm:grid-cols-[1fr_12rem] sm:items-center">
                    <label className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="primary"
                        value={key}
                        checked={on}
                        onChange={() => setPrimary(key)}
                        className="mt-1 accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-foreground">{e.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {CAMP_EDUCATOR_ROLE_LABEL[e.role]}
                          {e.email ? ` · ${e.email}` : ""}
                        </span>
                      </span>
                    </label>
                    {on ? (
                      <input
                        name={`phone:${key}`}
                        type="tel"
                        aria-label={`Phone for ${e.name}`}
                        placeholder="Phone number"
                        value={phones[key] ?? ""}
                        onChange={(ev) => setPhones((p) => ({ ...p, [key]: ev.target.value }))}
                        required
                        className={inputCls}
                      />
                    ) : null}
                  </li>
                );
              })}
              <li className="grid gap-2 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="primary"
                    value={OTHER_EDUCATOR}
                    checked={primary === OTHER_EDUCATOR}
                    onChange={() => setPrimary(OTHER_EDUCATOR)}
                    className="mt-1 accent-primary"
                  />
                  <span className="text-sm font-semibold text-foreground">Someone not listed here</span>
                </label>
                {primary === OTHER_EDUCATOR ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                    <input
                      name="other_name"
                      aria-label="Educator's full name"
                      placeholder="Full name"
                      value={other.name}
                      onChange={(ev) => setOther((o) => ({ ...o, name: ev.target.value }))}
                      required
                      className={inputCls}
                    />
                    <input
                      name="other_phone"
                      type="tel"
                      aria-label="Educator's phone"
                      placeholder="Phone number"
                      value={other.phone}
                      onChange={(ev) => setOther((o) => ({ ...o, phone: ev.target.value }))}
                      required
                      className={inputCls}
                    />
                  </div>
                ) : null}
              </li>
            </ul>
          </fieldset>

          <fieldset className="space-y-2 border border-foreground/10 p-3">
            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                name="request_extra"
                checked={requestExtra}
                onChange={(ev) => setRequestExtra(ev.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold">Request a second educator</span>
                <span className="block text-muted-foreground">
                  Only if you need one, for example for female contestants. It needs approval:
                  they may not come unless we email you an approval.
                </span>
              </span>
            </label>
            {savedExtra && confirmation?.extra_status ? (
              <p className={`border px-3 py-2 text-sm ${EXTRA_TONE[confirmation.extra_status]}`}>
                {savedExtra.name}: {CAMP_EXTRA_STATUS_LABEL[confirmation.extra_status]}
                {confirmation.extra_admin_note ? ` — ${confirmation.extra_admin_note}` : ""}
              </p>
            ) : null}
            {requestExtra ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                <input
                  name="extra_name"
                  aria-label="Second educator's full name"
                  placeholder="Full name"
                  value={extra.name}
                  onChange={(ev) => setExtra((x) => ({ ...x, name: ev.target.value }))}
                  required
                  className={inputCls}
                />
                <input
                  name="extra_phone"
                  type="tel"
                  aria-label="Second educator's phone"
                  placeholder="Phone number"
                  value={extra.phone}
                  onChange={(ev) => setExtra((x) => ({ ...x, phone: ev.target.value }))}
                  required
                  className={inputCls}
                />
                <textarea
                  name="extra_reason"
                  rows={2}
                  aria-label="Why you need a second educator"
                  placeholder="Why you need a second educator, e.g. two of our contestants are girls"
                  value={extra.reason}
                  onChange={(ev) => setExtra((x) => ({ ...x, reason: ev.target.value }))}
                  required
                  className={`${inputCls} sm:col-span-2`}
                />
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Changing the name or phone sends the request for approval again.
                </p>
              </div>
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
              Our accompanying educator will stay on camp for the full three days and is
              responsible for our students throughout. Students won&apos;t use phones during
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

      {status ? <p className="text-sm text-muted-foreground">Responding for <strong className="text-foreground">{schoolName}</strong>.</p> : null}
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
