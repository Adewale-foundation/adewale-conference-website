import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import EmptyState from "@/components/ui/empty-state";
import {
  Card,
  PortalBody,
  PortalHeader,
  SectionHeading,
} from "@/components/portal/ui";
import {
  FilterBar,
  Pagination,
  clampPage,
  listQuery,
  pageBounds,
  parsePage,
} from "@/components/portal/list-controls";
import { Select } from "@/components/ui/select";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { pageMetadata } from "@/lib/seo";
import { LGA_OPTIONS, SCHOOL_CATEGORY_OPTIONS } from "@/lib/forms";
import { escapeLikePattern, searchTokens } from "@/lib/search";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { SchoolLink } from "@/components/portal/school-link";
import { registrationForEdition } from "@/lib/admin-links";
import { fetchAll } from "@/lib/batch";
import { educatorConflicts, type Membership } from "@/lib/educator-school";
import { createClient } from "@/supabase/server";
import Link from "next/link";
import { approveMembership, rejectMembership, updateSchool } from "./actions";

export const metadata = pageMetadata("Schools", "Schools and access requests.");
export const dynamic = "force-dynamic";

interface SchoolRow {
  id: string;
  name: string;
  lga: string | null;
  category: string | null;
  email: string | null;
  school_code: string | null;
  registrations: { id: string; edition_year: number | null }[] | null;
}

const fieldCls =
  "w-full rounded-md border border-foreground/15 bg-card px-2 py-1.5 text-sm outline-none focus:border-primary";
const labelCls = "block text-xs uppercase tracking-wide text-muted-foreground";

interface PendingMember {
  id: string;
  email: string;
  schools: {
    name: string | null;
    registrations: { id: string; edition_year: number | null }[] | null;
  } | null;
}

const PAGE_SIZE = 30;

export default async function AdminSchools({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    lga?: string;
    category?: string;
    page?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  await requireModuleView("registrations");
  const canManage = await canManageModule("registrations");
  const { q, lga, category, page: pageParam, notice, error } = await searchParams;
  const requestedPage = parsePage(pageParam);
  const { from, to } = pageBounds(requestedPage, PAGE_SIZE);
  const supabase = await createClient();

  // Search + filters run in the database — the schools list is 500+ rows.
  const buildSchoolsQuery = () => {
    let schoolsQuery = supabase
      .from("schools")
      .select("id, name, lga, category, email, school_code, registrations(id, edition_year)", { count: "exact" })
      .order("name", { ascending: true });
    if (q?.trim()) {
      for (const token of searchTokens(q)) {
        schoolsQuery = schoolsQuery.ilike("name", `%${escapeLikePattern(token)}%`);
      }
    }
    if (lga) schoolsQuery = schoolsQuery.eq("lga", lga);
    if (category) schoolsQuery = schoolsQuery.eq("category", category);
    return schoolsQuery;
  };

  const [{ data: schoolData, count, error: schoolsError }, { data: pendingData, error: pendingError }] =
    await Promise.all([
      buildSchoolsQuery().range(from, to),
      supabase
        .from("school_members")
        .select("id, email, schools(name, registrations(id, edition_year))")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);
  if (schoolsError || pendingError) {
    throw new Error(`Could not load schools: ${(schoolsError ?? pendingError)!.message}`);
  }

  // Emails still linked to two schools, from before one-school-per-educator.
  const memberships = await fetchAll<{ email: string; school_id: string; schools: { name: string | null } | null }>(
    (from, to) =>
      supabase
        .from("school_members")
        .select("email, school_id, schools(name)")
        .eq("status", "approved")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{
        data: { email: string; school_id: string; schools: { name: string | null } | null }[] | null;
        error: { message: string } | null;
      }>,
  );
  const conflicts = educatorConflicts(
    memberships.map((m): Membership => ({ email: m.email, school_id: m.school_id, school_name: m.schools?.name ?? null })),
  );
  const conflictSchoolIds = [...new Set(conflicts.flatMap((c) => c.schools.map((x) => x.id)))];
  const { data: conflictRegs, error: conflictRegsError } = conflictSchoolIds.length
    ? await supabase.from("registrations").select("id, school_id, edition_year").in("school_id", conflictSchoolIds)
    : { data: [], error: null };
  if (conflictRegsError) throw new Error(`Could not load registrations: ${conflictRegsError.message}`);
  const latestRegOf = (schoolId: string) =>
    registrationForEdition(
      ((conflictRegs ?? []) as { id: string; school_id: string; edition_year: number | null }[]).filter(
        (r) => r.school_id === schoolId,
      ),
    )?.id;

  let schools = (schoolData ?? []) as unknown as SchoolRow[];
  const pending = (pendingData ?? []) as unknown as PendingMember[];
  const total = count ?? schools.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = clampPage(requestedPage, pageCount);
  if (page !== requestedPage) {
    const clamped = pageBounds(page, PAGE_SIZE);
    const { data: pageData } = await buildSchoolsQuery().range(clamped.from, clamped.to);
    schools = (pageData ?? []) as unknown as SchoolRow[];
  }
  const filtering = Boolean(q?.trim() || lga || category);
  // Come back to the same page and filters after an edit.
  const returnTo = `/portal/admin/schools${listQuery({ q, lga, category, page: String(page) })}`;

  return (
    <>
      <PortalHeader title="Schools" subtitle="Access requests and registered schools" />
      <PortalBody>
        {!canManage ? <ReadOnlyBadge /> : null}
        {notice ? (
          <Card className="border-primary/30 bg-primary/5 p-4 text-sm text-foreground">{notice}</Card>
        ) : null}
        {error ? (
          <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">{error}</Card>
        ) : null}
        {conflicts.length > 0 ? (
          <div>
            <SectionHeading>Educators linked to more than one school ({conflicts.length})</SectionHeading>
            <Card className="p-4 space-y-3 text-sm">
              <p className="text-muted-foreground">
                An educator can belong to one school only. Open the school that should not keep this
                email and change its educator email there.
              </p>
              <ul className="divide-y divide-foreground/5">
                {conflicts.map((c) => (
                  <li key={c.email} className="py-2">
                    <p className="font-medium text-foreground">{c.email}</p>
                    <p className="text-muted-foreground">
                      {c.schools.map((school, i) => (
                        <span key={school.id}>
                          {i > 0 ? " · " : ""}
                          <SchoolLink registrationId={latestRegOf(school.id)} from={returnTo}>
                            {school.name}
                          </SchoolLink>
                        </span>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : null}

        <div>
          <SectionHeading>
            Pending access {pending.length > 0 ? `(${pending.length})` : ""}
          </SectionHeading>
          {pending.length === 0 ? (
            <p className="serif-display italic text-muted-foreground">
              No access requests awaiting approval.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((m) => (
                <Card
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4"
                >
                  <div>
                    <SchoolLink
                      registrationId={registrationForEdition(m.schools?.registrations)?.id}
                      from={returnTo}
                      className="font-medium text-foreground"
                    >
                      {m.schools?.name ?? "Unknown school"}
                    </SchoolLink>
                    <p className="text-sm text-muted-foreground">{m.email}</p>
                  </div>
                  {canManage ? (
                    <div className="flex gap-2">
                      <form action={approveMembership.bind(null, m.id)}>
                        <ConfirmSubmitButton
                          size="sm"
                          title="Approve this access request?"
                          description={`${m.email} gets educator access to ${m.schools?.name ?? "this school"}.`}
                          confirmLabel="Yes, approve"
                        >
                          Approve
                        </ConfirmSubmitButton>
                      </form>
                      <form action={rejectMembership.bind(null, m.id)}>
                        <ConfirmSubmitButton
                          size="sm"
                          variant="outline"
                          destructive
                          title="Reject this access request?"
                          description={`${m.email} will not get access to ${m.schools?.name ?? "this school"}.`}
                          confirmLabel="Yes, reject"
                        >
                          Reject
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionHeading>
              {total} school{total === 1 ? "" : "s"}
            </SectionHeading>
            <Link
              href="/portal/admin/schools/duplicates"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Find possible duplicates
            </Link>
          </div>
          <FilterBar q={q} placeholder="Search school name…">
            <Select name="lga" defaultValue={lga ?? ""}>
              <option value="">Any LGA</option>
              {LGA_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
            <Select name="category" defaultValue={category ?? ""}>
              <option value="">Any category</option>
              {SCHOOL_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </FilterBar>
          {schools.length === 0 ? (
            <EmptyState title={filtering ? "No matches" : "No schools yet"}>
              {filtering
                ? "No schools match the current search or filter."
                : "Schools are created when registrations are linked in the portal."}
            </EmptyState>
          ) : (
            <Card className="divide-y divide-foreground/5">
              {schools.map((s) => (
                <div key={s.id} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <SchoolLink
                        registrationId={registrationForEdition(s.registrations)?.id}
                        from={returnTo}
                        className="font-medium text-foreground"
                      >
                        {s.name}
                      </SchoolLink>
                      {s.school_code ? (
                        <span className="ml-2 rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {s.school_code}
                        </span>
                      ) : (
                        <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                          not canonical
                        </span>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {[s.lga, s.category].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {s.registrations?.length ?? 0} registration
                      {(s.registrations?.length ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                  {canManage ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-primary">Edit details</summary>
                      <form action={updateSchool} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <label className="sm:col-span-2">
                          <span className={labelCls}>School name</span>
                          <input name="name" defaultValue={s.name} required className={fieldCls} />
                        </label>
                        <label>
                          <span className={labelCls}>LGA</span>
                          <Select name="lga" defaultValue={s.lga ?? ""} className="w-full">
                            <option value="">—</option>
                            {LGA_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label>
                          <span className={labelCls}>Category</span>
                          <Select name="category" defaultValue={s.category ?? ""} className="w-full">
                            <option value="">—</option>
                            {SCHOOL_CATEGORY_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="sm:col-span-2">
                          <span className={labelCls}>School email</span>
                          <input
                            name="email"
                            type="email"
                            defaultValue={s.email ?? ""}
                            className={fieldCls}
                          />
                        </label>
                        <div className="sm:col-span-2">
                          <ConfirmSubmitButton
                            size="sm"
                            title="Save changes to this school?"
                            description={
                              s.school_code
                                ? `${s.name} carries the canonical code ${s.school_code}. Renaming it here will not update the source workbook.`
                                : "This school has no canonical code yet."
                            }
                            confirmLabel="Yes, save"
                          >
                            Save
                          </ConfirmSubmitButton>
                        </div>
                      </form>
                    </details>
                  ) : null}
                </div>
              ))}
            </Card>
          )}
          <Pagination
            page={page}
            pageCount={pageCount}
            path="/portal/admin/schools"
            params={{ q, lga, category, notice, error }}
          />
        </div>
      </PortalBody>
    </>
  );
}
