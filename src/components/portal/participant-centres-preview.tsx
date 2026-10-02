"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Card } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { ZONAL_FINALS_OPTIONS } from "@/lib/forms";
import { centreForZone } from "@/lib/exam-centre";
import type { CentreSaveState } from "@/components/portal/centre-save-state";
import type { PreviewParticipant } from "@/components/portal/participants-preview-types";
import { Select } from "@/components/ui/select";
import { SchoolLink } from "@/components/portal/school-link";

const UNASSIGNED = "Unassigned";
const fieldClass =
  "rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-foreground/5 disabled:text-muted-foreground";

type Choice = { selected: string; other: string };

function isStandard(value: string | null) {
  return (
    Boolean(value) &&
    (ZONAL_FINALS_OPTIONS as readonly string[]).includes(value as string)
  );
}

function initialChoice(participant: PreviewParticipant): Choice {
  const allocated = participant.centre.allocated;
  if (isStandard(allocated)) return { selected: allocated ?? "", other: "" };
  if (allocated) return { selected: "", other: allocated };
  return { selected: participant.centre.requested ?? "", other: "" };
}

function target(choice: Choice) {
  return choice.selected || choice.other.trim() || null;
}

function currentGroup(participant: PreviewParticipant) {
  return (
    participant.centre.allocated ?? participant.centre.requested ?? UNASSIGNED
  );
}

function SaveState() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving allocations…" : "Save reviewed allocations"}
    </Button>
  );
}

export function ParticipantCentresPreview({
  participants,
  canManage,
  focus,
  action,
  venues = [],
  link,
}: {
  link: { from: string; enabled: boolean };
  participants: PreviewParticipant[];
  canManage: boolean;
  focus?: string;
  /** The 2026 venues, so a stored town can be labelled with the hall it means.
   *  Display only — allocation still stores and reads the town string. */
  venues?: { id: string; name: string; town: string; legacy_zone: string | null }[];
  action: (
    state: CentreSaveState,
    formData: FormData,
  ) => Promise<CentreSaveState>;
}) {
  // The projection above the list is what the admin *intends*; this is what the
  // database actually did. They are not the same claim, and a save that silently
  // changed nothing — a refused row, an RPC that is not deployed — has to be
  // distinguishable from one that worked.
  const [saveState, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  // Clicking a bar in the distribution narrows the list. It HIDES rather than
  // unmounts: every row is a field in one whole-edition form, so dropping a card
  // from the DOM would quietly drop those schools from the save.
  const [centreFilter, setCentreFilter] = useState<string | null>(null);
  // The hall a town name means, matched the same way the register matches it.
  const venueFor = (centre: string) =>
    centre === UNASSIGNED ? null : (centreForZone(centre, venues)?.name ?? null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      participants.map((participant) => [
        participant.id,
        initialChoice(participant),
      ]),
    ),
  );
  const baselineKey = participants
    .map(
      (participant) =>
        `${participant.id}:${participant.centre.allocated ?? ""}:${participant.centre.requested ?? ""}`,
    )
    .join("|");

  useEffect(() => {
    setChoices(
      Object.fromEntries(
        participants.map((participant) => [
          participant.id,
          initialChoice(participant),
        ]),
      ),
    );
    setReviewOpen(false);
  }, [baselineKey, participants]);

  // A result has come back, so the review sheet has served its purpose. Closing it
  // on the result rather than on changed data also covers the no-op save, where the
  // baseline never moves and the sheet would otherwise sit there showing zeros.
  useEffect(() => {
    if (saveState) setReviewOpen(false);
  }, [saveState]);

  useEffect(() => {
    if (!focus) return;
    document
      .querySelector(`[data-centre-row="${CSS.escape(focus)}"]`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  }, [focus]);

  const summary = useMemo(() => {
    let confirm = 0;
    let move = 0;
    let clear = 0;
    let unchanged = 0;
    let nonStandard = 0;

    for (const participant of participants) {
      const next = target(
        choices[participant.id] ?? initialChoice(participant),
      );
      const current = participant.centre.allocated;
      if (next && !isStandard(next)) nonStandard += 1;
      if (next === current) {
        unchanged += 1;
      } else if (!next && current) {
        clear += 1;
      } else if (!current && next && next === participant.centre.requested) {
        confirm += 1;
      } else {
        move += 1;
      }
    }

    return {
      confirm,
      move,
      clear,
      unchanged,
      nonStandard,
      changes: confirm + move + clear,
    };
  }, [choices, participants]);

  const load = useMemo(() => {
    const groups = new Map<string, { schools: number; reps: number }>();
    for (const centre of ZONAL_FINALS_OPTIONS)
      groups.set(centre, { schools: 0, reps: 0 });
    groups.set(UNASSIGNED, { schools: 0, reps: 0 });
    for (const participant of participants) {
      const centre =
        target(choices[participant.id] ?? initialChoice(participant)) ??
        UNASSIGNED;
      const item = groups.get(centre) ?? { schools: 0, reps: 0 };
      groups.set(centre, {
        schools: item.schools + 1,
        reps: item.reps + participant.reps,
      });
    }
    return groups;
  }, [choices, participants]);

  const grouped = useMemo(() => {
    const result = new Map<string, PreviewParticipant[]>();
    for (const centre of ZONAL_FINALS_OPTIONS) result.set(centre, []);
    result.set(UNASSIGNED, []);
    for (const participant of participants) {
      const key = currentGroup(participant);
      result.set(key, [...(result.get(key) ?? []), participant]);
    }
    return result;
  }, [participants]);

  const normalizedQuery = query.trim().toLowerCase();
  const isVisible = (participant: PreviewParticipant) =>
    (!normalizedQuery ||
      [participant.school, participant.lga, participant.centre.value]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedQuery),
        )) &&
    (!centreFilter || currentGroup(participant) === centreFilter);
  const visibleCount = participants.filter(isVisible).length;
  const busiest = Math.max(
    ...[...load.values()].map((item) => item.schools),
    1,
  );
  const allocated = participants.filter(
    (participant) => participant.centre.allocated,
  ).length;
  const unassigned = participants.length - allocated;

  if (!participants.length) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No approved teams for this Edition.
      </Card>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <Card className="overflow-hidden border border-foreground/10">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bebas text-2xl leading-none text-foreground">
                  Centre distribution
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Live preview of the allocation selected below — click a centre
                  to filter the list.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${summary.nonStandard ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}
              >
                {summary.nonStandard
                  ? `${summary.nonStandard} non-standard`
                  : "Standard centres only"}
              </span>
            </div>
            <div className="mt-5 space-y-2.5">
              {[...load.entries()].map(([centre, item]) => {
                const active = centreFilter === centre;
                return (
                  // type="button": this lives inside the allocation form, so the
                  // default submit type would save the edition on every click.
                  <button
                    key={centre}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCentreFilter(active ? null : centre)}
                    className={`grid w-full cursor-pointer grid-cols-[10rem_minmax(2px,1fr)_auto] items-center gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors ${
                      active ? "bg-primary/10" : "hover:bg-foreground/5"
                    }`}
                  >
                    <span className="min-w-0">
                      <span
                        className={`block truncate ${
                          centre === UNASSIGNED
                            ? "font-medium text-amber-700"
                            : "text-foreground"
                        }`}
                      >
                        {centre}
                      </span>
                      {venueFor(centre) ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {venueFor(centre)}
                        </span>
                      ) : null}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-foreground/5">
                      <span
                        className={`block h-full rounded-full ${active ? "bg-primary" : "bg-primary/70"}`}
                        style={{
                          width: `${Math.round((item.schools / busiest) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {item.schools} schools · {item.reps} reps
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-secondary p-5 text-secondary-foreground">
            {/* With centres defaulting to each school's own choice, no pending
                changes is the normal resting state — so "0 / 0 confirm / 0 move /
                0 clear" was the panel's usual reading, four zeros that told nobody
                anything. When nothing is staged it reports where the edition
                actually stands instead. */}
            {summary.changes ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary-foreground/60">
                  Pending review
                </p>
                <p className="mt-2 font-bebas text-4xl leading-none">
                  {summary.changes}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white/5 p-2">
                    <b className="block text-lg">{summary.confirm}</b>confirm
                  </div>
                  <div className="bg-white/5 p-2">
                    <b className="block text-lg">{summary.move}</b>move
                  </div>
                  <div className="bg-white/5 p-2">
                    <b className="block text-lg">{summary.clear}</b>clear
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary-foreground/60">
                  Allocated
                </p>
                <p className="mt-2 font-bebas text-4xl leading-none">
                  {allocated}
                  <span className="text-xl text-secondary-foreground/50">
                    /{participants.length}
                  </span>
                </p>
                <p className="mt-3 text-xs leading-relaxed text-secondary-foreground/70">
                  {unassigned
                    ? `${unassigned} school${unassigned === 1 ? "" : "s"} without a centre — ${unassigned === 1 ? "it is" : "they are"} under Unassigned below.`
                    : "Every school has a centre. Change a dropdown to stage an update."}
                </p>
              </>
            )}
            <p className="mt-3 text-xs leading-relaxed text-secondary-foreground/60">
              Centre capacity is not recorded, so distribution shows demand
              rather than available seats.
            </p>
          </div>
        </div>
      </Card>

      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-3 border-y border-foreground/10 bg-background/95 px-1 py-3 backdrop-blur">
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a school, LGA, or centre…"
            className={`${fieldClass} w-full pl-9`}
          />
        </label>
        {centreFilter ? (
          <button
            type="button"
            onClick={() => setCentreFilter(null)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-foreground hover:bg-primary/20"
          >
            {centreFilter}
            <X className="size-3.5" />
          </button>
        ) : null}
        <span className="text-xs text-muted-foreground">
          Showing {visibleCount} of {participants.length}
        </span>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setReviewOpen(true)}
            disabled={summary.changes === 0}
          >
            <SlidersHorizontal /> Review allocations
          </Button>
        ) : (
          <ReadOnlyBadge />
        )}
      </div>

      {saveState ? (
        <p
          role="status"
          aria-live="polite"
          className={`border px-3 py-2 text-sm ${
            saveState.ok
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {saveState.message}
        </p>
      ) : null}

      <div className="space-y-4">
        {[...grouped.entries()]
          .filter(([, rows]) => rows.length > 0)
          .map(([centre, rows]) => (
            <div
              key={centre}
              hidden={Boolean(centreFilter) && centre !== centreFilter}
            >
              <Card className="overflow-hidden border border-foreground/10">
                <div className="flex items-center justify-between bg-foreground/[0.025] px-4 py-3">
                  <div>
                    <p className="font-semibold text-foreground">{centre}</p>
                    <p className="text-xs text-muted-foreground">
                      Current allocation or requested centre
                    </p>
                  </div>
                  <span className="rounded-full bg-background px-2.5 py-1 text-xs font-bold text-muted-foreground">
                    {rows.length}
                  </span>
                </div>
                <div className="divide-y divide-foreground/5">
                  {rows.map((participant) => {
                    const choice =
                      choices[participant.id] ?? initialChoice(participant);
                    const next = target(choice);
                    const changed = next !== participant.centre.allocated;
                    // Most allocations now start life as the school's own answer, so
                    // the useful distinction is no longer "set / unset" but "inherited /
                    // decided". "As requested" means nobody has looked at it yet.
                    const inherited =
                      Boolean(participant.centre.allocated) &&
                      participant.centre.allocated ===
                        participant.centre.requestedRaw;
                    const status = participant.centre.allocated
                      ? !participant.centre.isStandard
                        ? "Non-standard"
                        : inherited
                          ? "As requested"
                          : "Moved"
                      : participant.centre.requested
                        ? "Requested"
                        : "Unassigned";
                    return (
                      <div
                        key={participant.id}
                        hidden={!isVisible(participant)}
                        data-centre-row={participant.id}
                        className={`grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(18rem,auto)] md:items-center ${focus === participant.id ? "bg-primary/10 ring-2 ring-inset ring-primary/50" : ""}`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">
                              <SchoolLink registrationId={participant.id} {...link}>
                                {participant.school}
                              </SchoolLink>
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                status === "Moved"
                                  ? "bg-green-100 text-green-800"
                                  : status === "Non-standard"
                                    ? "bg-amber-100 text-amber-800"
                                    : status === "As requested"
                                      ? "bg-blue-50 text-blue-700"
                                      : status === "Requested"
                                        ? "bg-blue-50 text-blue-700"
                                        : "bg-red-50 text-red-700"
                              }`}
                            >
                              {status}
                            </span>
                            {changed ? (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-gold-ink">
                                Unsaved change
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {participant.lga ?? "No LGA"} · {participant.reps}{" "}
                            rep{participant.reps === 1 ? "" : "s"}
                            {status === "Moved" &&
                            participant.centre.requestedRaw
                              ? ` · moved from ${participant.centre.requestedRaw}`
                              : !participant.centre.allocated &&
                                  participant.centre.requested
                                ? ` · requested ${participant.centre.requested}`
                                : participant.centre.requestedRaw &&
                                    !participant.centre.isStandard
                                  ? ` · asked for ${participant.centre.requestedRaw}`
                                  : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                          <Select
                            name={`zone:${participant.id}`}
                            value={choice.selected}
                            disabled={!canManage}
                            onChange={(event) =>
                              setChoices((current) => ({
                                ...current,
                                [participant.id]: {
                                  ...choice,
                                  selected: event.target.value,
                                },
                              }))
                            }
                            aria-label={`Centre for ${participant.school}`}
                          >
                            <option value="">Not allocated / other…</option>
                            {ZONAL_FINALS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                          {choice.selected === "" ? (
                            <input
                              name={`zoneOther:${participant.id}`}
                              value={choice.other}
                              disabled={!canManage}
                              onChange={(event) =>
                                setChoices((current) => ({
                                  ...current,
                                  [participant.id]: {
                                    ...choice,
                                    other: event.target.value,
                                  },
                                }))
                              }
                              maxLength={80}
                              placeholder="Clear or type another centre"
                              aria-label={`Other centre for ${participant.school}`}
                              className={`${fieldClass} min-w-56`}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          ))}
      </div>

      {reviewOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="allocation-review-title"
        >
          <button
            type="button"
            aria-label="Close review"
            onClick={() => setReviewOpen(false)}
            className="absolute inset-0 cursor-pointer bg-foreground/55"
          />
          <div className="relative w-full max-w-lg bg-card p-6 shadow-[0_20px_70px_rgba(10,15,30,0.3)]">
            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-ink">
              Whole Edition operation
            </p>
            <h2
              id="allocation-review-title"
              className="mt-1 font-bebas text-3xl text-foreground"
            >
              Review centre allocations
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This saves every school in the Edition, including rows hidden by
              the local search.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [summary.confirm, "Confirm"],
                [summary.move, "Move"],
                [summary.clear, "Clear"],
                [summary.unchanged, "Unchanged"],
              ].map(([value, label]) => (
                <div
                  key={String(label)}
                  className="border border-foreground/10 bg-background p-3 text-center"
                >
                  <b className="block font-bebas text-2xl text-foreground">
                    {value}
                  </b>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            {summary.nonStandard ? (
              <div className="mt-4 flex gap-3 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  {summary.nonStandard} resulting allocation
                  {summary.nonStandard === 1 ? " is" : "s are"} outside the
                  standard centre list.
                </p>
              </div>
            ) : (
              <div className="mt-4 flex gap-3 border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <p>
                  Every resulting allocation uses a standard centre or remains
                  unassigned.
                </p>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setReviewOpen(false)}
              >
                Cancel
              </Button>
              <SaveState />
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
