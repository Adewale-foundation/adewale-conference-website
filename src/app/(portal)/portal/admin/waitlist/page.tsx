import Link from "next/link";
import EmptyState from "@/components/ui/empty-state";
import {
  Card,
  PortalBody,
  PortalHeader,
  SectionHeading,
} from "@/components/portal/ui";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  FilterBar,
  Pagination,
  clampPage,
  listQuery,
  pageBounds,
  parsePage,
} from "@/components/portal/list-controls";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import CopyLink from "@/components/portal/copy-link";
import { SchoolLink } from "@/components/portal/school-link";
import { REGISTRATION_BASE, registrationHref } from "@/lib/admin-links";
import { waitlistInviteUrl } from "@/lib/email";
import { INVITE_TOKEN_DAY_OPTIONS, INVITE_TOKEN_DAYS } from "@/lib/waitlist-invite";
import { pageMetadata } from "@/lib/seo";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { createClient } from "@/supabase/server";
import { inviteWaitlist, inviteWaitlistEntry } from "../actions";
import { Select } from "@/components/ui/select";

export const metadata = pageMetadata("Waitlist", "Schools waiting for registration to open.");
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface WaitlistRow {
  id: string;
  school_name: string;
  lga: string | null;
  category: string | null;
  contact_name: string;
  contact_email: string;
  phone: string | null;
  notified_at: string | null;
  created_at: string;
  invite_token: string | null;
  invite_token_expires_at: string | null;
  invited_edition_year: number | null;
  invited_at: string | null;
  registration_id: string | null;
  converted_at: string | null;
}

const COLUMNS =
  "id, school_name, lga, category, contact_name, contact_email, phone, notified_at, created_at, invite_token, invite_token_expires_at, invited_edition_year, invited_at, registration_id, converted_at";

const shortDate = (value: string) => new Date(value).toLocaleDateString();

/** An expired pass reads as waiting again — that's what the admin must act on. */
function inviteState(entry: WaitlistRow) {
  if (entry.converted_at) return "registered" as const;
  if (
    entry.invite_token &&
    entry.invite_token_expires_at &&
    new Date(entry.invite_token_expires_at).getTime() > Date.now()
  ) {
    return "invited" as const;
  }
  return entry.invited_at ? ("lapsed" as const) : ("waiting" as const);
}

// Mutually exclusive, and together the whole table — so no count here can
// include a school that has already registered.
const TABS = [
  { key: "waiting", label: "Waiting" },
  { key: "invited", label: "Invited" },
  { key: "registered", label: "Registered" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTab(value: string | undefined): value is TabKey {
  return TABS.some((t) => t.key === value);
}

const TAB_EMPTY: Record<TabKey, { title: string; body: string }> = {
  waiting: {
    title: "Nobody waiting",
    body: "When registration is closed, schools can join the waitlist from the homepage.",
  },
  invited: {
    title: "No live invites",
    body: "Invite a waiting school and its link appears here until it's used or expires.",
  },
  registered: {
    title: "No conversions yet",
    body: "Schools that take up an invite and complete registration are listed here.",
  },
};

export default async function AdminWaitlist({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; tab?: string }>;
}) {
  await requireModuleView("registrations");
  const canManage = await canManageModule("registrations");
  const { q, page: pageParam, tab: tabParam } = await searchParams;
  const tab: TabKey = isTab(tabParam) ? tabParam : "waiting";
  // Default view stays out of the URL.
  const tabParamValue = tab === "waiting" ? undefined : tab;
  const requestedPage = parsePage(pageParam);
  const { from, to } = pageBounds(requestedPage, PAGE_SIZE);
  const supabase = await createClient();
  // One timestamp for every predicate, so a token can't be live in a tab count
  // and expired in the row beside it.
  const nowIso = new Date().toISOString();

  const search = q?.trim()
    ? (() => {
        const escaped = q.trim().replace(/[%_\\]/g, (m) => `\\${m}`);
        return `school_name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,contact_email.ilike.%${escaped}%`;
      })()
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forTab = (query: any, key: TabKey) => {
    if (key === "registered") return query.not("converted_at", "is", null);
    const open = query.is("converted_at", null);
    return key === "invited"
      ? open.not("invite_token", "is", null).gt("invite_token_expires_at", nowIso)
      : open.or(`invite_token.is.null,invite_token_expires_at.lte.${nowIso}`);
  };

  const buildQuery = () => {
    let query = supabase
      .from("waitlist")
      .select(COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false });
    if (search) query = query.or(search);
    return forTab(query, tab);
  };

  const countFor = (key: TabKey) => {
    let query = supabase.from("waitlist").select("id", { count: "exact", head: true });
    if (search) query = query.or(search);
    return forTab(query, key);
  };

  const [{ data, count }, waitingRes, invitedRes, registeredRes, { count: pendingCount }, { data: editionRows }] =
    await Promise.all([
      buildQuery().range(from, to),
      countFor("waiting"),
      countFor("invited"),
      countFor("registered"),
      // Who the bulk blast would actually reach. notified_at alone can't tell
      // you, because an invite never sets it.
      supabase
        .from("waitlist")
        .select("id", { count: "exact", head: true })
        .is("notified_at", null)
        .is("converted_at", null),
      // An invite admits into the open edition if there is one, else the newest.
      supabase.from("editions").select("year, registration_open").order("year", { ascending: false }),
    ]);

  const editions = (editionRows ?? []) as { year: number; registration_open: boolean }[];
  const inviteYear = editions.find((e) => e.registration_open)?.year ?? editions[0]?.year ?? null;

  const tabCounts: Record<TabKey, number> = {
    waiting: waitingRes.count ?? 0,
    invited: invitedRes.count ?? 0,
    registered: registeredRes.count ?? 0,
  };

  let entries = (data ?? []) as WaitlistRow[];
  const total = count ?? entries.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = clampPage(requestedPage, pageCount);
  if (page !== requestedPage) {
    const clamped = pageBounds(page, PAGE_SIZE);
    const { data: pageData } = await buildQuery().range(clamped.from, clamped.to);
    entries = (pageData ?? []) as WaitlistRow[];
  }
  const pending = pendingCount ?? 0;

  return (
    <>
      <PortalHeader
        title="Waitlist"
        subtitle="Schools that asked to be told when registration opens"
      />
      <PortalBody>
        {!canManage ? <ReadOnlyBadge /> : null}
        <div>
          <SectionHeading>
            {total} school{total === 1 ? "" : "s"}{" "}
            {tab === "waiting" ? "waiting" : tab === "invited" ? "invited" : "registered"}
          </SectionHeading>

          <div className="flex flex-wrap gap-2 mb-4">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/portal/admin/waitlist${listQuery({ tab: t.key === "waiting" ? undefined : t.key, q })}`}
                className={`px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                  tab === t.key
                    ? "bg-primary/15 text-gold-ink"
                    : "bg-foreground/5 text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label} {tabCounts[t.key]}
              </Link>
            ))}
          </div>

          {canManage && inviteYear && tab !== "registered" ? (
            <p className="text-sm text-muted-foreground mb-4">
              Inviting a single school issues it a one-use link that works even while
              registration is closed. Invites admit into{" "}
              <span className="font-bold text-foreground">ASC {inviteYear}</span>.
            </p>
          ) : null}

          {/* Bulk announce, for when an edition actually opens. Requires an
              open edition; never double-sends. */}
          {canManage && tab !== "registered" ? (
            <form action={inviteWaitlist}>
              <Card className="p-4 mb-4 flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground flex-1 min-w-40">
                  <span className="font-bold text-foreground">{pending}</span> not yet
                  notified — when registration opens:
                </p>
                <ConfirmSubmitButton
                  size="sm"
                  title="Invite the waitlist?"
                  description={`${pending} school(s) are emailed the registration link for the open edition. Already-notified entries and schools that have registered are skipped.`}
                  confirmLabel="Yes, send invites"
                >
                  Invite waitlist
                </ConfirmSubmitButton>
              </Card>
            </form>
          ) : null}

          <FilterBar q={q} placeholder="Search school, contact, or email…" preserve={{ tab: tabParamValue }} />

          {entries.length === 0 ? (
            <EmptyState title={q ? "No matches" : TAB_EMPTY[tab].title}>
              {q ? "No waitlist entries match the current search." : TAB_EMPTY[tab].body}
            </EmptyState>
          ) : (
            <Card className="divide-y divide-foreground/5">
              {entries.map((entry) => {
                const state = inviteState(entry);
                return (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <SchoolLink
                      registrationId={entry.registration_id}
                      from="/portal/admin/waitlist"
                      className="font-medium text-foreground"
                    >
                      {entry.school_name}
                    </SchoolLink>
                    <p className="text-sm text-muted-foreground">
                      {[entry.lga, entry.category].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.contact_name} · {entry.contact_email}
                      {entry.phone ? ` · ${entry.phone}` : ""}
                    </p>
                    {/* Shown so it can go out over WhatsApp when email fails. */}
                    {state === "invited" && entry.invite_token ? (
                      <p className="mt-2">
                        <CopyLink url={waitlistInviteUrl(entry.invite_token)} />
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    {state === "registered" ? (
                      <a
                        href={
                          entry.registration_id
                            ? registrationHref(entry.registration_id, "/portal/admin/waitlist")
                            : REGISTRATION_BASE
                        }
                        className="inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em] bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                      >
                        Registered
                      </a>
                    ) : state === "invited" ? (
                      <span className="inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em] bg-primary/10 text-gold-ink">
                        Invited{entry.invited_edition_year ? ` · ASC ${entry.invited_edition_year}` : ""}
                      </span>
                    ) : entry.notified_at ? (
                      <span className="inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em] bg-primary/10 text-gold-ink">
                        Notified
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em] bg-foreground/5 text-muted-foreground">
                        Waiting
                      </span>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {state === "registered" && entry.converted_at
                        ? `Registered ${shortDate(entry.converted_at)}`
                        : state === "invited" && entry.invite_token_expires_at
                          ? `Link expires ${shortDate(entry.invite_token_expires_at)}`
                          : state === "lapsed" && entry.invited_at
                            ? `Invite lapsed · sent ${shortDate(entry.invited_at)}`
                            : `Joined ${shortDate(entry.created_at)}`}
                    </p>

                    {canManage && state !== "registered" && inviteYear ? (
                      <form
                        action={inviteWaitlistEntry.bind(null, entry.id)}
                        className="flex items-center gap-2"
                      >
                        <label className="sr-only" htmlFor={`expiry-${entry.id}`}>
                          Invite expires after
                        </label>
                        <Select
                          size="sm"
                          id={`expiry-${entry.id}`}
                          name="expiresInDays"
                          defaultValue={INVITE_TOKEN_DAYS}
                          className="cursor-pointer bg-transparent text-muted-foreground"
                        >
                          {INVITE_TOKEN_DAY_OPTIONS.map((days) => (
                            <option key={days} value={days}>
                              {days} days
                            </option>
                          ))}
                        </Select>
                        <ConfirmSubmitButton
                          size="sm"
                          variant="outline"
                          title={`Invite ${entry.school_name} to register?`}
                          description={`${entry.contact_email} is emailed a single-use link that lets this school register for ASC ${inviteYear}, valid for the period selected${
                            state === "waiting" ? "" : " — the previous link stops working"
                          }. Registration stays closed to everyone else.`}
                          confirmLabel="Yes, send the invite"
                        >
                          {state === "waiting" ? "Invite to register" : "Send a new link"}
                        </ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </div>
                );
              })}
            </Card>
          )}
          <Pagination page={page} pageCount={pageCount} path="/portal/admin/waitlist" params={{ q, tab: tabParamValue }} />
        </div>
      </PortalBody>
    </>
  );
}
