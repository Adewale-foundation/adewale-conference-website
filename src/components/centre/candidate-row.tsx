"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import type { RosterEntry, RosterState } from "@/lib/attendance";
import type { AttendanceStatus } from "@/supabase/types";

export type RowState = "saving" | "saved" | "failed" | undefined;

const BUTTON = "min-h-11 min-w-16 cursor-pointer rounded-md px-3 text-sm font-bold";

export default function CandidateRow({
  entry,
  state,
  rowState,
  onMark,
}: {
  entry: RosterEntry;
  state: RosterState;
  rowState: RowState;
  onMark: (status: AttendanceStatus) => void;
}) {
  const busy = rowState === "saving";

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      {/* The candidate number leads, because it is what is printed on the desk
          and what a lead is reading from. */}
      {entry.examNo ? (
        <span className="w-12 shrink-0 font-bebas text-2xl tabular-nums text-foreground">
          {entry.examNo}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{entry.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.schoolName}
          {entry.level ? ` · ${entry.level}` : ""}
        </p>
        {rowState === "failed" ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-destructive">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Not saved — tap again
          </p>
        ) : null}
      </div>

      {busy ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : null}

      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          disabled={busy}
          aria-pressed={state === "present"}
          onClick={() => onMark("present")}
          className={`${BUTTON} ${
            state === "present"
              ? "bg-primary text-primary-foreground"
              : "bg-foreground/5 text-muted-foreground"
          } disabled:opacity-60`}
        >
          Here
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={state === "absent"}
          onClick={() => onMark("absent")}
          className={`${BUTTON} ${
            state === "absent"
              ? "bg-destructive text-destructive-foreground"
              : "bg-foreground/5 text-muted-foreground"
          } disabled:opacity-60`}
        >
          No
        </button>
      </div>
    </li>
  );
}
