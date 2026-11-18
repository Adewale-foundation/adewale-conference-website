"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { DEFAULT_RELEASE_REASON, RELEASE_REASON_MAX } from "@/lib/finale-attend";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";

export default function FinaleCancelButton({
  action,
  seats,
  waitlisted,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  seats: number;
  waitlisted: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Controlled, so a rejected submit does not wipe what the admin wrote.
  const [reason, setReason] = useState(waitlisted ? DEFAULT_RELEASE_REASON : "");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Cancel
      </Button>
      {state?.ok && state.message ? <p className="text-sm text-muted-foreground">{state.message}</p> : null}

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Cancel this registration">
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-foreground/50" />
              <div className="relative w-full max-w-md border border-foreground/10 bg-card p-6 shadow-[0_4px_40px_rgba(10,15,30,0.2)]">
                <h2 className="font-bebas text-2xl leading-tight text-foreground">Cancel this registration?</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {seats} seat{seats === 1 ? "" : "s"} {waitlisted ? "leave the waitlist" : "go back to the pool"}. They are emailed your reason, and told not to travel.
                </p>
                <form action={formAction} className="mt-4 space-y-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Reason, as it will appear in the email</span>
                    <textarea
                      name="reason"
                      rows={4}
                      required
                      minLength={20}
                      maxLength={RELEASE_REASON_MAX}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  {state && !state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
                      Keep it
                    </Button>
                    <Button type="submit" size="sm" variant="destructive" disabled={pending}>
                      {pending ? "Cancelling…" : "Cancel and email"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
