import Link from "next/link";
import { REGISTRATION_BASE, registrationHref } from "@/lib/admin-links";
import { Eye, FileSpreadsheet, Mail, Sheet, Users } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  PortalBody,
  PortalHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/portal/ui";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { BulkDecisionForm } from "@/components/portal/bulk-decision-form";
import {
  genderMix,
  hasContactGap,
  matchesGenderFilter,
  type GenderFilter,
} from "@/components/portal/registration-details";
import {
  FilterBar,
  FilterField,
  FilterPanel,
  Pagination,
  clampPage,
  parsePage,
} from "@/components/portal/list-controls";
import { pageMetadata } from "@/lib/seo";
import { searchHaystackMatches, searchTokens } from "@/lib/search";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import type { AdminRegistrationRow, RegistrationStatus, Rep } from "@/supabase/types";
import { syncAirtableRegistrations } from "../actions";

export const metadata = pageMetadata("Registrations", "Review and accept or decline entries.");
export const dynamic = "force-dynamic";

// Registration is now just the acceptance decision. Stage advancement and
// certificates live on the Participants hub, per edition.
const STATUSES: RegistrationStatus[] = ["submitted", "verified", "declined"];
const ACTIVATION_FILTERS = ["pending", "onboarded", "active"] as const;
const GENDER_FILTERS = ["female", "male", "mixed"] as const;
type ActivationFilter = (typeof ACTIVATION_FILTERS)[number];

// Checkboxes reference this form by id (the `form` attribute), so the bulk form
// never nests inside the per-row status forms.
const BULK_FORM_ID = "bulk-decisions";

const PAGE_SIZE = 20;
const FETCH_PAGE_SIZE = 1000;
const REGISTRATION_SELECT =
  "id, edition_year, status, claim_code, contact_email, contact_name, onboarded_at, provisioned_count, reps, details, schools(name), profiles(email, full_name)";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function fetchRegistrationRows(
  supabase: SupabaseClient,
  editionYear: number | null,
) {
  const rows: AdminRegistrationRow[] = [];
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    let query = supabase
      .from("registrations")
      .select(REGISTRATION_SELECT)
      .order("edition_year", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + FETCH_PAGE_SIZE - 1);
    if (editionYear != null) query = query.eq("edition_year", editionYear);

    const { data, error } = await query;
    if (error) {
      console.error("registration list fetch failed:", error.message);
      break;
    }

    const batch = (data ?? []) as unknown as AdminRegistrationRow[];
    rows.push(...batch);
    if (batch.length < FETCH_PAGE_SIZE) break;
  }
  return rows;
}

export default async function AdminRegistrations({
  searchParams,
}: {
  searchParams: Promise<{
    edition?: string;
    q?: string;
    status?: string;
    activation?: string;
    gender?: string;
    female?: string;
    contacts?: string;
    page?: string;
  }>;
}) {
  await requireModuleView("registrations");
  const canManage = await canManageModule("registrations");
  const {
    edition,
    q,
    status,
    activation,
    gender,
    female,
    contacts,
    page: pageParam,
  } = await searchParams;
  const supabase = await createClient();
  const [{ data: editionData }] = await Promise.all([
    supabase.from("editions").select("year").order("year", { ascending: false }),
  ]);

  const editionYears = ((editionData ?? []) as { year: number }[]).map((e) => e.year);
  const years = editionYears;
  // Default to the newest edition — the close-of-registration review works one
  // edition at a time.
  const activeYear = edition === "all" ? null : Number(edition) || years[0] || null;
  const currentYear = years[0] ?? null;
  const all = await fetchRegistrationRows(supabase, activeYear);
  const canEditRegistrations = canManage && activeYear != null && activeYear === currentYear;
  const inEdition = all;

  // Search matches school, contact, coordinator, and reps; status narrows the
  // review queue. Both apply within the active edition tab.
  const needle = searchTokens(q).join(" ");
  const activationFilter = ACTIVATION_FILTERS.includes(
    activation as ActivationFilter,
  )
    ? (activation as ActivationFilter)
    : undefined;
  const genderFilter = GENDER_FILTERS.includes(gender as GenderFilter)
    ? (gender as GenderFilter)
    : female === "1"
      ? "female"
      : undefined;
  const incompleteContacts = contacts === "incomplete";
  const filtered = inEdition.filter((r) => {
    if (status && r.status !== status) return false;
    if (activationFilter === "pending" && (r.profiles || r.onboarded_at)) return false;
    if (activationFilter === "onboarded" && (r.profiles || !r.onboarded_at)) return false;
    if (activationFilter === "active" && !r.profiles) return false;
    if (genderFilter && !matchesGenderFilter(r.details, genderFilter)) return false;
    if (incompleteContacts && !hasContactGap(r.details, r.contact_name, r.contact_email))
      return false;
    if (!needle) return true;
    const haystack = [
      r.schools?.name,
      r.contact_email,
      r.contact_name,
      r.profiles?.email,
      r.profiles?.full_name,
      r.claim_code,
      ...(Array.isArray(r.reps) ? (r.reps as Rep[]).map((rep) => rep.name) : []),
    ];
    return searchHaystackMatches(haystack, q);
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = clampPage(parsePage(pageParam), pageCount);
  const registrations = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const listParams = {
    edition,
    q,
    status,
    activation: activationFilter,
    gender: genderFilter,
    contacts: incompleteContacts ? "incomplete" : undefined,
  };
  const listQuery = new URLSearchParams(
    Object.entries({ ...listParams, page: page > 1 ? String(page) : undefined }).filter(
      (e): e is [string, string] => typeof e[1] === "string" && e[1] !== "",
    ),
  ).toString();
  const listFrom = listQuery ? `${REGISTRATION_BASE}?${listQuery}` : REGISTRATION_BASE;
  const hasActiveFilter = Boolean(
    needle || status || activationFilter || genderFilter || incompleteContacts,
  );
  const statusCounts: Record<RegistrationStatus, number> = {
    submitted: filtered.filter((r) => r.status === "submitted").length,
    verified: filtered.filter((r) => r.status === "verified").length,
    declined: filtered.filter((r) => r.status === "declined").length,
  };
  const underReview = statusCounts.submitted;

  return (
    <>
      <PortalHeader
        title="Registrations"
        subtitle="Approve schools into the competition, then run them from Participants"
      />
      <PortalBody>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
            <SectionHeading>
              {activeYear ? `${activeYear} edition` : "All editions"}
            </SectionHeading>
            <div className="flex flex-wrap items-center gap-2">
              {/* Export the current edition scope. CSV opens straight into Google
                  Sheets; XLSX is a real Excel workbook. A read, so read-only
                  admins can export too. */}
              <a
                href={`/portal/admin/registrations/export?format=csv&edition=${activeYear ?? "all"}`}
                className="inline-flex items-center gap-2 rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary"
              >
                <Sheet className="size-4" strokeWidth={2} />
                Google Sheets (CSV)
              </a>
              <a
                href={`/portal/admin/registrations/export?format=xlsx&edition=${activeYear ?? "all"}`}
                className="inline-flex items-center gap-2 rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary"
              >
                <FileSpreadsheet className="size-4" strokeWidth={2} />
                Excel (.xlsx)
              </a>
              {/* Airtable stays source of truth — this pulls its rows into the
                  portal (idempotent; result arrives as a notification). */}
              {canManage && activeYear === currentYear ? (
                <form action={syncAirtableRegistrations}>
                  <ConfirmSubmitButton
                    size="sm"
                    variant="outline"
                    title="Sync from Airtable?"
                    description="Pulls every school and registration from Airtable into the portal — new rows are added, edited rows refreshed. No emails are sent. The result arrives as a notification."
                    confirmLabel="Yes, sync"
                  >
                    Sync from Airtable
                  </ConfirmSubmitButton>
                </form>
              ) : (
                <ReadOnlyBadge />
              )}
            </div>
          </div>

          {years.length > 1 || edition === "all" ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {years.map((y) => (
                <Link
                  key={y}
                  href={`/portal/admin/registrations?edition=${y}`}
                  className={`px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                    activeYear === y
                      ? "bg-primary/15 text-gold-ink"
                      : "bg-foreground/5 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {y}
                </Link>
              ))}
              <Link
                href="/portal/admin/registrations?edition=all"
                className={`px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                  activeYear === null
                    ? "bg-primary/15 text-gold-ink"
                    : "bg-foreground/5 text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </Link>
            </div>
          ) : null}

          <FilterBar
            q={q}
            placeholder="Search school, email, contact, rep, or claim code…"
            preserve={{ edition }}
            showApply={false}
          >
            <FilterPanel
              activeCount={[status, activationFilter, genderFilter, incompleteContacts ? "1" : undefined].filter(Boolean).length}
              preserve={{ edition, q }}
            >
              <FilterField label="Status" name="status" defaultValue={status}>
                <option value="">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </FilterField>

              <FilterField
                label="Activation"
                name="activation"
                defaultValue={activationFilter}
              >
                <option value="">Any activation</option>
                <option value="pending">Pending activation</option>
                <option value="onboarded">Onboarded, awaiting sign-in</option>
                <option value="active">Coordinator active</option>
              </FilterField>

              <FilterField label="Gender mix" name="gender" defaultValue={genderFilter}>
                <option value="">Any gender mix</option>
                <option value="female">Has a female rep</option>
                <option value="male">Has a male rep</option>
                <option value="mixed">Has female and male reps</option>
              </FilterField>

              <FilterField
                label="Contacts"
                name="contacts"
                defaultValue={incompleteContacts ? "incomplete" : ""}
              >
                <option value="">Any contacts</option>
                <option value="incomplete">Incomplete contacts</option>
              </FilterField>
            </FilterPanel>
          </FilterBar>

          <Card className="mb-4 border border-primary/25 bg-primary/10 p-4">
            <p className="text-sm text-foreground">
              Approving a school enters it into the competition and moves it to{" "}
              <Link href="/portal/admin/participants" className="font-bold text-gold-ink hover:underline">
                Participants
              </Link>{" "}
              at Qualifications.
            </p>
          </Card>

          {canManage && !canEditRegistrations ? (
            <Card className="mb-4 border border-foreground/10 bg-foreground/5 p-4">
              <p className="text-sm text-muted-foreground">
                This view is read-only. Past editions and the all-editions view are locked for normal review actions.
              </p>
            </Card>
          ) : null}

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {STATUSES.map((s) => (
              <div key={s} className="border border-foreground/10 bg-card px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {s}
                </p>
                <p className="mt-1 font-bebas text-3xl leading-none text-foreground">
                  {statusCounts[s]}
                </p>
              </div>
            ))}
          </div>

          {/* Close-of-registration review: tick schools, then approve or decline
              the selection. Approve sends the guidelines email (and materialises
              the school's competition roster); decline sends a polite not-selected
              email. Neither touches portal access. Everything after acceptance —
              stage advancement, certificates — lives on the Participants hub. */}
          {canEditRegistrations ? (
            <BulkDecisionForm
              formId={BULK_FORM_ID}
              underReview={underReview}
              matchCount={filtered.length}
              matchingIds={
                filtered.length > registrations.length ? filtered.map((r) => r.id) : null
              }
            />
          ) : null}

          {registrations.length === 0 ? (
            <EmptyState title={hasActiveFilter ? "No matches" : "No registrations yet"}>
              {hasActiveFilter
                ? "No registrations match the current search or filter."
                : "Submitted registrations will appear here for review."}
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {registrations.map((r) => {
                const reps = Array.isArray(r.reps) ? (r.reps as Rep[]) : [];
                const mix = genderMix(r.details);
                const contactGap = hasContactGap(r.details, r.contact_name, r.contact_email);
                const activationLabel = r.profiles
                  ? "Coordinator active"
                  : r.onboarded_at
                    ? "Onboarded, awaiting sign-in"
                    : "Activation pending";

                return (
                  <Card key={r.id} className="p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)_minmax(170px,0.8fr)_auto] lg:items-center">
                      <div className="flex items-start gap-3 min-w-0">
                        {canEditRegistrations ? (
                          <input
                            type="checkbox"
                            name="ids"
                            value={r.id}
                            form={BULK_FORM_ID}
                            aria-label={`Select ${r.schools?.name ?? "registration"}`}
                            className="mt-1 size-4 accent-primary shrink-0"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <Link
                            href={registrationHref(r.id, listFrom)}
                            className="font-bebas text-2xl leading-none text-foreground hover:text-primary"
                          >
                            {r.schools?.name ?? "Unassigned school"}
                          </Link>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            <span>{r.edition_year} edition</span>
                            <span className="inline-flex items-center gap-1 min-w-0">
                              <Mail className="size-3.5" />
                              <span className="truncate">
                                {r.contact_email ?? "No coordinator email"}
                              </span>
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="min-w-0 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground truncate">
                          {r.profiles?.full_name ??
                            r.profiles?.email ??
                            r.contact_name ??
                            "Unclaimed"}
                        </p>
                        <p className="mt-0.5">{activationLabel}</p>
                        {contactGap ? (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                            Incomplete contacts
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" />
                          {reps.length} rep{reps.length === 1 ? "" : "s"}
                        </span>
                        {mix ? (
                          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                            {mix}
                          </span>
                        ) : null}
                        {r.provisioned_count != null ? (
                          <span>{r.provisioned_count} provisioned</span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <StatusBadge status={r.status} />
                        <Button asChild size="sm" variant="outline">
                          <Link href={registrationHref(r.id, listFrom)}>
                            <Eye className="size-4" />
                            Details
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <Pagination
            page={page}
            pageCount={pageCount}
            path="/portal/admin/registrations"
            params={listParams}
          />
        </div>
      </PortalBody>
    </>
  );
}
