"use client";

import { useState } from "react";
import ActionForm from "@/components/portal/action-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { DEFAULT_RELEASE_REASON, RELEASE_REASON_MAX } from "@/lib/finale-attend";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";

export default function FinaleReleaseWaitlist({
  action,
  seats,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  seats: number;
}) {
  // Controlled: React resets a form after its action, and a second batch must send the same reason.
  const [reason, setReason] = useState(DEFAULT_RELEASE_REASON);

  return (
    <div className="mt-4 rounded-md border border-foreground/10 p-4">
      <p className="text-sm text-muted-foreground">
        {seats.toLocaleString("en-NG")} seat{seats === 1 ? " is" : "s are"} on the waitlist. To close it, write the reason below: everyone waiting is emailed it, then cancelled once their email has gone out.
      </p>
      <ActionForm action={action} className="mt-3 grid gap-3">
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
        <p className="text-xs text-muted-foreground">
          The email then adds that their waitlist place is closed and that they should not travel to the venue.
        </p>
        <div>
          <ConfirmSubmitButton
            size="sm"
            variant="outline"
            destructive
            title="Email the waitlist and cancel them?"
            description="Everyone on the waitlist, public and school, is emailed your reason, then cancelled. The emails cannot be recalled."
            confirmLabel="Yes, email and cancel"
          >
            Email the waitlist and cancel
          </ConfirmSubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
