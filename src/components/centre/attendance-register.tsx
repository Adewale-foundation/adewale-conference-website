"use client";

import { Fragment, useState, type ReactNode } from "react";
import { LogOut, Search, X } from "lucide-react";
import {
  mark as markAtCentre,
  markRemainingAbsent,
  signOut,
  type MarkResult,
} from "@/app/(centre)/attendance/actions";
import { attendanceCounts, matchesCandidate, type RosterEntry } from "@/lib/attendance";
import type { AttendanceStatus } from "@/supabase/types";
import CandidateRow, { type RowState } from "./candidate-row";

type Entry = RosterEntry & { centreId: string | null };
type Filter = "all" | "unmarked" | "present" | "absent";
type RegisterAction = (prev: MarkResult | null, formData: FormData) => Promise<MarkResult>;

// The camp register is marked by admins inside the portal, whose mobile tab bar
// owns the bottom of the screen and whose people have no candidate number.
const COPY = {
  centre: {
    search: "Name or candidate number…",
    empty: "No candidates are allocated to this centre yet. Call the exam desk.",
    sweepWhen: "Do this only once the paper is over.",
    noun: "candidate",
  },
  camp: {
    search: "Name or school…",
    empty: "No school has confirmed it is attending camp.",
    sweepWhen: "Do this only once today's roll call is done.",
    noun: "person",
  },
} as const;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unmarked", label: "Not marked" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
];

export default function AttendanceRegister({
  centreName,
  leadName,
  examTitle,
  roster,
  walkIns,
  variant = "centre",
  mark = markAtCentre,
  sweepAction = markRemainingAbsent,
  headerAction,
}: {
  centreName: string;
  leadName: string;
  examTitle: string;
  roster: Entry[];
  walkIns: Entry[];
  variant?: keyof typeof COPY;
  mark?: RegisterAction;
  sweepAction?: RegisterAction;
  /** Replaces the sign-out button. */
  headerAction?: ReactNode;
}) {
  const copy = COPY[variant];
  // The server's rows are the truth on load; every confirmed mark is layered on
  // top so the page does not have to round-trip a full re-render per tap.
  const [marked, setMarked] = useState<Record<string, AttendanceStatus | undefined>>({});
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Camp only: schoolId carries the registration, and a roll call goes school by school.
  const [school, setSchool] = useState("");
  const [sweeping, setSweeping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const stateOf = (entry: Entry) => marked[entry.studentId] ?? entry.state;

  const counts = attendanceCounts(roster.map((e) => ({ state: stateOf(e) })));

  async function submit(entry: Entry, status: AttendanceStatus) {
    setRowState((s) => ({ ...s, [entry.studentId]: "saving" }));
    const form = new FormData();
    form.set("student_id", entry.studentId);
    form.set("status", status);

    const result = await mark(null, form);
    if (result.ok) {
      setMarked((m) => ({ ...m, [entry.studentId]: status }));
      setRowState((s) => ({ ...s, [entry.studentId]: "saved" }));
    } else {
      // Never leave a failed mark looking marked. The row keeps its old state
      // and says so, because a phantom tick is how a present candidate ends the
      // day recorded absent.
      setRowState((s) => ({ ...s, [entry.studentId]: "failed" }));
      setNotice(result.error);
    }
  }

  async function sweep() {
    setSweeping(true);
    setNotice(null);
    const result = await sweepAction(null, new FormData());
    if (result.ok) {
      const rest: Record<string, AttendanceStatus> = {};
      for (const e of roster) if (stateOf(e) === "unmarked") rest[e.studentId] = "absent";
      setMarked((m) => ({ ...m, ...rest }));
      setNotice("Everyone still unmarked is now recorded absent.");
    } else {
      setNotice(result.error);
    }
    setSweeping(false);
  }

  const visible = roster.filter((e) => {
    if (filter !== "all" && stateOf(e) !== filter) return false;
    if (school && e.schoolId !== school) return false;
    return matchesCandidate(e, query);
  });

  const schools = [...new Map(roster.map((e) => [e.schoolId, e.schoolName])).entries()];
  const schoolCounts = (schoolId: string) =>
    attendanceCounts(roster.filter((e) => e.schoolId === schoolId).map((e) => ({ state: stateOf(e) })));

  // Walk-ins are search-only: an empty query shows none of them.
  const walkInMatches = query.trim()
    ? walkIns.filter((e) => matchesCandidate(e, query)).slice(0, 20)
    : [];

  return (
    <main className={`mx-auto w-full max-w-2xl ${variant === "centre" ? "pb-28" : ""}`}>
      <header className="flex items-start justify-between gap-3 px-5 pt-6">
        <div className="min-w-0">
          <h1 className="font-bebas text-2xl leading-tight text-foreground">{centreName}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {examTitle} · {leadName}
          </p>
        </div>
        {headerAction ?? (
          <form action={signOut}>
            <button
              type="submit"
              className="flex min-h-11 cursor-pointer items-center gap-1.5 px-2 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        )}
      </header>

      <div className="sticky top-0 z-20 mt-3 border-y border-foreground/10 bg-background/95 px-5 py-3 backdrop-blur">
        <p className="font-bebas text-2xl text-foreground" role="status" aria-live="polite">
          {counts.present} <span className="text-base text-muted-foreground">of</span>{" "}
          {counts.total} <span className="text-base text-muted-foreground">present</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {counts.absent} absent · {counts.unmarked} not marked
        </p>

        <label className="relative mt-3 block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.search}
            aria-label="Find a candidate"
            className="w-full rounded-md border border-foreground/15 bg-card py-2.5 pl-9 pr-3 text-base outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </label>

        <div className="mt-2 flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`min-h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3 text-xs font-bold ${
                filter === f.key
                  ? "bg-primary/15 text-gold-ink"
                  : "bg-foreground/5 text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {variant === "camp" && schools.length > 1 ? (
          <select
            aria-label="Filter by school"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className="mt-2 min-h-10 w-full rounded-md border border-foreground/15 bg-card px-3 text-sm"
          >
            <option value="">All schools ({schools.length})</option>
            {schools.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className="mx-5 mt-3 border border-foreground/15 bg-card px-3 py-2 text-sm"
        >
          {notice}
        </p>
      ) : null}

      <ul className="mt-3 divide-y divide-foreground/5 border-y border-foreground/10">
        {visible.map((entry, i) => {
          const startsSchool = variant === "camp" && visible[i - 1]?.schoolId !== entry.schoolId;
          const c = startsSchool ? schoolCounts(entry.schoolId) : null;
          return (
            <Fragment key={entry.studentId}>
              {c ? (
                <li className="flex items-baseline justify-between gap-2 bg-foreground/5 px-5 py-2">
                  <span className="truncate text-xs font-bold uppercase tracking-[0.12em] text-foreground">
                    {entry.schoolName}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {c.present} of {c.total} present
                  </span>
                </li>
              ) : null}
              <CandidateRow
                entry={entry}
                state={stateOf(entry)}
                rowState={rowState[entry.studentId]}
                onMark={(status) => submit(entry, status)}
              />
            </Fragment>
          );
        })}
      </ul>

      {visible.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          {roster.length === 0 ? copy.empty : `No ${copy.noun} here matches that.`}
        </p>
      ) : null}

      {walkInMatches.length > 0 ? (
        <section className="mt-6 px-5">
          <h2 className="font-bebas text-lg text-foreground">Not allocated to any centre</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Mark one of these only if they are sitting in your hall.
          </p>
          <ul className="divide-y divide-foreground/5 border-y border-foreground/10">
            {walkInMatches.map((entry) => (
              <CandidateRow
                key={entry.studentId}
                entry={entry}
                state={stateOf(entry)}
                rowState={rowState[entry.studentId]}
                onMark={(status) => submit(entry, status)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {counts.unmarked > 0 ? (
        <div
          className={
            variant === "centre"
              ? "fixed inset-x-0 bottom-0 z-30 border-t border-foreground/10 bg-card/95 px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur"
              : "px-5 py-4"
          }
        >
          <button
            type="button"
            disabled={sweeping}
            onClick={() => {
              if (
                window.confirm(
                  `Record the ${counts.unmarked} ${counts.unmarked === 1 ? copy.noun : variant === "camp" ? "people" : "candidates"} still unmarked as absent? ${copy.sweepWhen}`,
                )
              ) {
                void sweep();
              }
            }}
            className="min-h-12 w-full cursor-pointer rounded-md border border-foreground/20 bg-card px-4 text-sm font-bold text-foreground disabled:opacity-60"
          >
            {sweeping ? "Recording…" : `Mark ${counts.unmarked} remaining absent`}
          </button>
        </div>
      ) : null}
    </main>
  );
}
