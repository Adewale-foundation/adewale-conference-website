import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import EmptyState from "@/components/ui/empty-state";
import { Card, PortalBody, PortalHeader, SectionHeading } from "@/components/portal/ui";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { pageMetadata } from "@/lib/seo";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { createClient } from "@/supabase/server";
import { SchoolLink } from "@/components/portal/school-link";
import { registrationForEdition } from "@/lib/admin-links";
import { chunk } from "@/lib/batch";
import { mergeSchools } from "../actions";

export const metadata = pageMetadata("Possible duplicate schools", "Schools that may be one school recorded twice.");
export const dynamic = "force-dynamic";

interface Candidate {
  a_id: string;
  a_name: string;
  a_school_code: string | null;
  a_years: number[] | null;
  b_id: string;
  b_name: string;
  b_school_code: string | null;
  b_years: number[] | null;
  shared_coordinators: number;
  same_school_email: boolean;
}

const RETURN_TO = "/portal/admin/schools/duplicates";

function Side({
  name,
  code,
  years,
  registrationId,
}: {
  name: string;
  code: string | null;
  years: number[] | null;
  registrationId: string | null | undefined;
}) {
  return (
    <div>
      <SchoolLink registrationId={registrationId} from={RETURN_TO} className="font-medium text-foreground">
        {name}
      </SchoolLink>
      {code ? (
        <span className="ml-2 rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {code}
        </span>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {years?.length ? `Competed ${years.join(", ")}` : "No registrations"}
      </p>
    </div>
  );
}

export default async function DuplicateSchools({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireModuleView("registrations");
  const canManage = await canManageModule("registrations");
  const { notice, error } = await searchParams;
  const supabase = await createClient();

  const { data, error: candidatesError } = await supabase.rpc("school_duplicate_candidates");
  if (candidatesError) throw new Error(`Could not load duplicate candidates: ${candidatesError.message}`);
  const candidates = (data ?? []) as Candidate[];

  const schoolIds = [...new Set(candidates.flatMap((c) => [c.a_id, c.b_id]))];
  const regPages = await Promise.all(
    chunk(schoolIds, 100).map((ids) =>
      supabase.from("registrations").select("id, school_id, edition_year").in("school_id", ids),
    ),
  );
  const regError = regPages.find((r) => r.error)?.error;
  if (regError) throw new Error(`Could not load registrations: ${regError.message}`);
  const regsBySchool = new Map<string, { id: string; edition_year: number | null }[]>();
  for (const r of regPages.flatMap((p) => (p.data ?? []) as { id: string; school_id: string; edition_year: number | null }[])) {
    regsBySchool.set(r.school_id, [...(regsBySchool.get(r.school_id) ?? []), r]);
  }
  const latestReg = (schoolId: string) => registrationForEdition(regsBySchool.get(schoolId))?.id;

  return (
    <>
      <PortalHeader
        title="Possible duplicate schools"
        subtitle="Two rows that may be one school recorded twice"
      />
      <PortalBody>
        {!canManage ? <ReadOnlyBadge /> : null}
        {notice ? (
          <Card className="border-primary/30 bg-primary/5 p-4 text-sm text-foreground">{notice}</Card>
        ) : null}
        {error ? (
          <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">{error}</Card>
        ) : null}

        <Card className="p-4 text-sm text-muted-foreground">
          <p>
            These pairs <strong className="text-foreground">share a coordinator</strong> and never
            competed in the same year. That combination is what distinguishes one school recorded
            twice from a school group with several campuses: a group shares staff but enters every
            year in parallel, while a split record has its history divided with no overlap.
          </p>
          <p className="mt-2">
            Similar names are deliberately not used as the signal — IGBUSI, ẸGBA, ODUA, ABOBI and
            FAITH COMPREHENSIVE HIGH SCHOOL are five different schools, and the four ADEDOKUN
            campuses each field their own team. Most pairs below are simply a teacher who changed
            school between editions, so <strong className="text-foreground">check before merging</strong>.
          </p>
        </Card>

        <div>
          <SectionHeading>
            {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
          </SectionHeading>
          {candidates.length === 0 ? (
            <EmptyState title="Nothing to review">
              No two schools share a coordinator without also sharing an edition.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {candidates.map((c) => (
                <Card key={`${c.a_id}-${c.b_id}`} className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {c.shared_coordinators} shared coordinator
                      {c.shared_coordinators === 1 ? "" : "s"}
                    </span>
                    {c.same_school_email ? (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                        same school email — likely the same school
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Side name={c.a_name} code={c.a_school_code} years={c.a_years} registrationId={latestReg(c.a_id)} />
                    <Side name={c.b_name} code={c.b_school_code} years={c.b_years} registrationId={latestReg(c.b_id)} />
                  </div>
                  {canManage ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {/* Both directions offered: the admin decides which record survives. */}
                      <form action={mergeSchools}>
                        <input type="hidden" name="survivorId" value={c.a_id} />
                        <input type="hidden" name="absorbedId" value={c.b_id} />
                        <input type="hidden" name="returnTo" value={RETURN_TO} />
                        <ConfirmSubmitButton
                          size="sm"
                          variant="outline"
                          title={`Merge into "${c.a_name}"?`}
                          description={`Every registration, student, coordinator and plan belonging to "${c.b_name}" moves to "${c.a_name}", and "${c.b_name}" is deleted. Duplicate coordinators and duplicate active students are removed. This is recorded and cannot be undone from the portal.`}
                          confirmLabel="Yes, merge"
                        >
                          Keep “{c.a_name.length > 26 ? `${c.a_name.slice(0, 26)}…` : c.a_name}”
                        </ConfirmSubmitButton>
                      </form>
                      <form action={mergeSchools}>
                        <input type="hidden" name="survivorId" value={c.b_id} />
                        <input type="hidden" name="absorbedId" value={c.a_id} />
                        <input type="hidden" name="returnTo" value={RETURN_TO} />
                        <ConfirmSubmitButton
                          size="sm"
                          variant="outline"
                          title={`Merge into "${c.b_name}"?`}
                          description={`Every registration, student, coordinator and plan belonging to "${c.a_name}" moves to "${c.b_name}", and "${c.a_name}" is deleted. Duplicate coordinators and duplicate active students are removed. This is recorded and cannot be undone from the portal.`}
                          confirmLabel="Yes, merge"
                        >
                          Keep “{c.b_name.length > 26 ? `${c.b_name.slice(0, 26)}…` : c.b_name}”
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
          <p className="mt-4 text-sm">
            <Link href="/portal/admin/schools" className="text-primary underline-offset-4 hover:underline">
              Back to schools
            </Link>
          </p>
        </div>
      </PortalBody>
    </>
  );
}
