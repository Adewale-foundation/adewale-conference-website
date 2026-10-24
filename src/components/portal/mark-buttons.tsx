"use client";

import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { ActionResult } from "@/app/(portal)/portal/admin/paper-exams/actions";
import type { AttendanceStatus } from "@/supabase/types";

const OPTIONS: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: "present", label: "Present", on: "bg-primary text-primary-foreground border-primary" },
  { value: "absent", label: "Absent", on: "bg-destructive text-destructive-foreground border-destructive" },
];

/**
 * An admin's present/absent correction. The standing mark is shown filled and
 * cannot be pressed again, and both buttons lock while a save is in flight, so a
 * double tap cannot file two marks.
 */
export default function MarkButtons({
  action,
  fields,
  state,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  fields: Record<string, string | number>;
  state: AttendanceStatus | "unmarked";
}) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const [choice, setChoice] = useState<AttendanceStatus | null>(null);

  return (
    <div className="space-y-1">
      <form action={formAction} className="flex gap-1.5">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {OPTIONS.map((o) => {
          const current = state === o.value;
          return (
            <button
              key={o.value}
              type="submit"
              name="status"
              value={o.value}
              disabled={pending || current}
              aria-pressed={current}
              onClick={() => setChoice(o.value)}
              className={`flex min-h-9 min-w-20 items-center justify-center gap-1 rounded-md border px-3 text-xs font-bold transition-colors ${
                current
                  ? o.on
                  : "cursor-pointer border-foreground/20 bg-card text-foreground hover:bg-foreground/5 active:scale-[0.97]"
              } disabled:cursor-default ${pending && !current ? "opacity-50" : ""}`}
            >
              {pending && choice === o.value ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : current ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : null}
              {o.label}
            </button>
          );
        })}
      </form>
      {result && !result.ok ? <p className="text-xs text-destructive">{result.error}</p> : null}
    </div>
  );
}
