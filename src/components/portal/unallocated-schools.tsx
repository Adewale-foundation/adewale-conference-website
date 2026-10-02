"use client";

import { useMemo, useState } from "react";
import { Card, SectionHeading } from "@/components/portal/ui";
import ActionForm from "@/components/portal/action-form";
import { SubmitButton } from "@/components/portal/submit-button";
import { setSchoolCentre } from "@/app/(portal)/portal/admin/attendance/actions";
import type { RosterEntry } from "@/lib/attendance";
import { SchoolLink } from "@/components/portal/school-link";
import type { ExamCentre } from "@/supabase/types";

type Entry = RosterEntry & { centreId: string | null; registrationId: string | null };

/**
 * Schools no lead can see.
 *
 * Two of the ten 2026 venues (Arigbajo, Imeko) are new and no stored
 * qualification_zone names them, so the only way a school reaches them is an
 * explicit exam_centre_id set here. A school left in this list has candidates
 * who cannot be marked present by anybody.
 */
export default function UnallocatedSchools({
  entries,
  centres,
  canManage,
  editionYear,
  canOpenRegistrations,
}: {
  entries: Entry[];
  centres: ExamCentre[];
  canManage: boolean;
  editionYear: number;
  canOpenRegistrations: boolean;
}) {
  const [open, setOpen] = useState(false);

  const schools = useMemo(() => {
    const bySchool = new Map<string, { name: string; count: number; registrationId: string | null }>();
    for (const e of entries) {
      if (e.centreId !== null || !e.schoolId) continue;
      const held = bySchool.get(e.schoolId);
      if (held) held.count += 1;
      else bySchool.set(e.schoolId, { name: e.schoolName, count: 1, registrationId: e.registrationId });
    }
    return [...bySchool.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  if (schools.length === 0) return null;

  const candidates = schools.reduce((n, s) => n + s.count, 0);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading>Not at any centre</SectionHeading>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-h-9 cursor-pointer text-xs font-bold text-gold-ink"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-bold text-foreground">{schools.length}</span> school
        {schools.length === 1 ? "" : "s"} and{" "}
        <span className="font-bold text-foreground">{candidates}</span> candidate
        {candidates === 1 ? "" : "s"} appear on no register. A lead can still find them by
        searching, but nobody sees them by default.
      </p>

      {open ? (
        <ul className="mt-3 divide-y divide-foreground/5 border-y border-foreground/10">
          {schools.map((school) => (
            <li
              key={school.id}
              className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  <SchoolLink
                    registrationId={school.registrationId}
                    from="/portal/admin/attendance"
                    enabled={canOpenRegistrations}
                  >
                    {school.name}
                  </SchoolLink>
                </p>
                <p className="text-xs text-muted-foreground">
                  {school.count} candidate{school.count === 1 ? "" : "s"}
                </p>
              </div>
              {canManage ? (
                <ActionForm action={setSchoolCentre} className="flex gap-2">
                  <input type="hidden" name="school_id" value={school.id} />
                  <input type="hidden" name="edition_year" value={editionYear} />
                  <select
                    name="centre_id"
                    defaultValue=""
                    className="min-h-11 rounded-md border border-foreground/15 bg-card px-2 text-sm"
                  >
                    <option value="">Choose a centre…</option>
                    {centres.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}, {c.town}
                      </option>
                    ))}
                  </select>
                  <SubmitButton variant="outline" pendingText="Moving…">
                    Move
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
