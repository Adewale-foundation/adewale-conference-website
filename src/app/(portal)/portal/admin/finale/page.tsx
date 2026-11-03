import Link from "next/link";
import { Card, PortalBody, PortalHeader, StatTile } from "@/components/portal/ui";
import ActionForm from "@/components/portal/action-form";
import { SubmitButton } from "@/components/portal/submit-button";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import FinaleTabs from "@/components/portal/finale-tabs";
import { Pagination, clampPage, pageBounds, parsePage } from "@/components/portal/list-controls";
import { Select } from "@/components/ui/select";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatCampDate, isoToLagosInput } from "@/lib/camp";
import { maskPhone } from "@/lib/finale";
import { ATTEND_BASE, ATTENDEE_ROLES, SOURCE_LABELS, STATUS_LABELS, normalizeRefCode, schoolInviteState, seatsLeft, ticketPath } from "@/lib/finale-attend";
import { loadAttendance } from "@/lib/finale-attend-data";
import { FINALE_YEAR, finaleDb } from "@/lib/finale-data";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import type { FinaleAttendee, FinaleAttendeeSource, FinaleAttendeeStatus } from "@/supabase/types";
import {
  checkInAttendee,
  draftSchoolInviteAnnouncement,
  inviteAttendee,
  resendTicket,
  saveAttendSettings,
  saveSchoolInviteSettings,
  setAttendeeStatus,
} from "./actions";

export const metadata = pageMetadata("Grand Finale attendees", "Who is coming to the Grand Finale, and how they got their seats.");
export const dynamic = "force-dynamic";

const PATH = "/portal/admin/finale";
const PAGE_SIZE = 50;
const inputCls =
  "w-full rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-foreground/5";
const labelCls = "text-[11px] uppercase tracking-[0.2em] text-muted-foreground";
const chip = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-bold ${active ? "bg-secondary text-secondary-foreground" : "border border-foreground/10 bg-card text-muted-foreground"}`;
const SOURCE_TONE: Record<FinaleAttendeeSource, string> = {
  open: "bg-sky-100 text-sky-900",
  invited: "bg-violet-100 text-violet-900",
  school: "bg-amber-100 text-amber-900",
};
const STATUS_TONE: Record<FinaleAttendeeStatus, string> = {
  confirmed: "text-emerald-700",
  waitlisted: "text-amber-700",
  cancelled: "text-destructive",
};

export default async function AdminFinaleAttendees({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; status?: string; q?: string; page?: string }>;
}) {
  await requireModuleView("participants");
  const canManage = await canManageModule("participants");
  const params = await searchParams;
  const year = FINALE_YEAR;
  const source = (Object.keys(SOURCE_LABELS) as FinaleAttendeeSource[]).find((s) => s === params.source) ?? null;
  const status = (Object.keys(STATUS_LABELS) as FinaleAttendeeStatus[]).find((s) => s === params.status) ?? null;
  // Commas and brackets would break PostgREST's or() syntax.
  const q = (params.q ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 80);
  const code = normalizeRefCode(q);

  // Seat totals come from finale_attend_taken(), service role only; this page has passed requireModuleView.
  const service = finaleDb();
  if (!service) throw new Error("Grand Finale registration needs SUPABASE_SECRET_KEY to be set.");
  const supabase = await createClient();

  const countBy = (s: FinaleAttendeeSource) =>
    supabase.from("finale_attendees").select("id", { count: "exact", head: true }).eq("edition_year", year).eq("source", s).neq("status", "cancelled");
  let list = supabase.from("finale_attendees").select("*", { count: "exact" }).eq("edition_year", year);
  if (source) list = list.eq("source", source);
  if (status) list = list.eq("status", status);
  if (code) list = list.eq("ref_code", code);
  else if (q) list = list.or(["first_name", "last_name", "email", "organisation"].map((c) => `${c}.ilike.%${q}%`).join(","));
  const page = parsePage(params.page);
  const { from, to } = pageBounds(page, PAGE_SIZE);

  const [attendance, openRes, invitedRes, schoolRes, listRes] = await Promise.all([
    loadAttendance(service, year),
    countBy("open"),
    countBy("invited"),
    countBy("school"),
    list.order("created_at", { ascending: false }).order("id").range(from, to),
  ]);
  const loadError = attendance.error ?? openRes.error?.message ?? invitedRes.error?.message ?? schoolRes.error?.message ?? listRes.error?.message;
  if (loadError) throw new Error(`Could not load the attendees: ${loadError}`);

  const rows = (listRes.data ?? []) as FinaleAttendee[];
  const ids = rows.map((r) => r.id);
  const studentsRes = ids.length
    ? await supabase.from("finale_attendee_students").select("attendee_id, full_name, class, sort").in("attendee_id", ids).order("sort")
    : { data: [], error: null };
  if (studentsRes.error) throw new Error(`Could not load the named students: ${studentsRes.error.message}`);
  const named = new Map<string, string[]>();
  for (const s of (studentsRes.data ?? []) as { attendee_id: string; full_name: string; class: string | null }[]) {
    named.set(s.attendee_id, [...(named.get(s.attendee_id) ?? []), s.class ? `${s.full_name} (${s.class})` : s.full_name]);
  }

  const { settings, totals } = attendance;
  const capacity = settings?.attend_capacity ?? null;
  const left = seatsLeft(capacity, totals.confirmed);
  const schoolCapacity = settings?.school_capacity ?? null;
  const schoolLeft = seatsLeft(schoolCapacity, totals.schoolConfirmed);
  const inviteState = schoolInviteState(settings);
  const pageCount = Math.max(1, Math.ceil((listRes.count ?? 0) / PAGE_SIZE));
  const filterParams = { source: source ?? undefined, status: status ?? undefined, q: q || undefined };
  const href = (extra: Record<string, string | undefined>) => {
    const merged = { ...filterParams, ...extra };
    const qs = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => !!e[1]));
    return `${PATH}${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PortalHeader title="Grand Finale" subtitle={`ASC ${year}: who is coming, and how they got their seats.`} />
      <PortalBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FinaleTabs active="attendees" />
          <div className="flex items-center gap-3">
            <a href={ATTEND_BASE} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-gold-ink hover:underline">
              Open the public page ↗
            </a>
            {!canManage ? <ReadOnlyBadge /> : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label={capacity ? `Public seats of ${capacity.toLocaleString("en-NG")}` : "Public seats confirmed"}
            value={`${totals.confirmed.toLocaleString("en-NG")}${left != null ? ` · ${left.toLocaleString("en-NG")} left` : ""}`}
          />
          <StatTile
            label={schoolCapacity ? `School seats of ${schoolCapacity.toLocaleString("en-NG")}` : "School seats confirmed"}
            value={`${totals.schoolConfirmed.toLocaleString("en-NG")}${schoolLeft != null ? ` · ${schoolLeft.toLocaleString("en-NG")} left` : ""}`}
          />
          <StatTile label="Seats waitlisted" value={totals.waitlisted.toLocaleString("en-NG")} />
          <StatTile label="Seats checked in" value={totals.checkedIn.toLocaleString("en-NG")} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-xl font-bold text-foreground">Public registration</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Public registration is {settings?.attend_open ? "open" : "closed"}. Covers the public form and people you invite; schools have their own reserve. Once confirmed seats reach the cap, new sign-ups join the waitlist. A group that doesn&apos;t fit waits as a whole.
            </p>
            <ActionForm action={saveAttendSettings.bind(null, year)} className="mt-4 grid gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name="attend_open" defaultChecked={settings?.attend_open ?? false} disabled={!canManage} />
                Let the public register at {ATTEND_BASE}
              </label>
              <label className="block space-y-1">
                <span className={labelCls}>Public seats</span>
                <input name="attend_capacity" inputMode="numeric" defaultValue={capacity ?? ""} placeholder="Blank for no cap" disabled={!canManage} className={inputCls} />
              </label>
              {canManage ? (
                <div>
                  <SubmitButton size="sm" pendingText="Saving…">Save</SubmitButton>
                </div>
              ) : null}
            </ActionForm>
          </Card>

          <Card className="p-5">
            <h2 className="text-xl font-bold text-foreground">School invitations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every school registered for {year} sees the invitation on its portal Home and can answer
              {inviteState === "past-deadline" ? " (the reply-by date has passed, so answers are now locked)" : " until the reply-by date"}. The announcement just tells educators it&apos;s there. Schools fill their own seat reserve, apart from the public pool.
            </p>
            <ActionForm action={saveSchoolInviteSettings.bind(null, year)} className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className={labelCls}>Seats reserved for schools</span>
                <input name="school_capacity" inputMode="numeric" defaultValue={schoolCapacity ?? ""} placeholder="Blank for no cap" disabled={!canManage} className={inputCls} />
              </label>
              <label className="block space-y-1">
                <span className={labelCls}>Reply by (Lagos time)</span>
                <input name="school_respond_by" type="datetime-local" defaultValue={isoToLagosInput(settings?.school_respond_by)} disabled={!canManage} className={inputCls} />
              </label>
              {canManage ? (
                <div className="sm:col-span-2">
                  <SubmitButton size="sm" pendingText="Saving…">Save</SubmitButton>
                </div>
              ) : null}
            </ActionForm>
            {canManage ? (
              <ActionForm action={draftSchoolInviteAnnouncement.bind(null, year)} className="mt-4 flex flex-wrap items-center gap-3 border-t border-foreground/10 pt-4">
                <SubmitButton size="sm" variant="outline" pendingText="Drafting…">Draft the announcement to educators</SubmitButton>
                <span className="text-xs text-muted-foreground">Opens a draft with the link to accept. Review it, then send from Announcements.</span>
              </ActionForm>
            ) : null}
          </Card>
        </div>

        {canManage ? (
          <Card className="p-5">
            <h2 className="text-xl font-bold text-foreground">Invite someone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              For guests, sponsors and partners. They get a ticket email like any other attendee, marked as invited.
            </p>
            <ActionForm action={inviteAttendee.bind(null, year)} className="mt-4 grid gap-3 sm:grid-cols-6">
              <label className="block space-y-1 sm:col-span-2">
                <span className={labelCls}>First name</span>
                <input name="first_name" required className={inputCls} />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className={labelCls}>Last name</span>
                <input name="last_name" required className={inputCls} />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className={labelCls}>Email</span>
                <input name="email" type="email" required className={inputCls} />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className={labelCls}>Phone (optional)</span>
                <input name="phone" type="tel" className={inputCls} />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className={labelCls}>Role</span>
                <Select name="role" defaultValue="other" className="w-full">
                  {ATTENDEE_ROLES.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className={labelCls}>School or organisation</span>
                <input name="organisation" className={inputCls} />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className={labelCls}>Students (teachers and proprietors)</span>
                <input name="student_count" type="number" min={0} max={200} defaultValue={0} className={inputCls} />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-4">
                <input type="checkbox" name="force" defaultChecked />
                Confirm even if the hall is full
              </label>
              <div className="sm:col-span-6">
                <SubmitButton size="sm" pendingText="Inviting…">Invite and email ticket</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ) : null}

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-foreground">Attendees</h2>
            {canManage ? (
              <a href={`${PATH}/export`} className="text-xs uppercase tracking-[0.2em] text-primary hover:underline">Export CSV ↓</a>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={href({ source: undefined, page: undefined })} className={chip(!source)}>
              All ({((openRes.count ?? 0) + (invitedRes.count ?? 0) + (schoolRes.count ?? 0)).toLocaleString("en-NG")})
            </Link>
            {(
              [
                ["open", openRes.count],
                ["invited", invitedRes.count],
                ["school", schoolRes.count],
              ] as const
            ).map(([s, n]) => (
              <Link key={s} href={href({ source: s, page: undefined })} className={chip(source === s)}>
                {SOURCE_LABELS[s]} ({(n ?? 0).toLocaleString("en-NG")})
              </Link>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={href({ status: undefined, page: undefined })} className={chip(!status)}>Any status</Link>
            {(Object.keys(STATUS_LABELS) as FinaleAttendeeStatus[]).map((s) => (
              <Link key={s} href={href({ status: s, page: undefined })} className={chip(status === s)}>{STATUS_LABELS[s]}</Link>
            ))}
          </div>
          <form method="get" action={PATH} className="mt-4 flex flex-wrap gap-2">
            {source ? <input type="hidden" name="source" value={source} /> : null}
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <input name="q" defaultValue={q} placeholder="Name, email, school or ticket code" className={`${inputCls} max-w-sm`} />
            <SubmitButton size="sm" variant="outline">Search</SubmitButton>
          </form>

          <ul className="mt-4 divide-y divide-foreground/10">
            {rows.length === 0 ? <li className="py-3 text-sm text-muted-foreground">Nobody matches.</li> : null}
            {rows.map((r) => (
              <li key={r.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.source === "school" ? r.organisation : `${r.first_name} ${r.last_name}`}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SOURCE_TONE[r.source]}`}>{SOURCE_LABELS[r.source]}</span>
                    <span className={`text-xs font-bold ${STATUS_TONE[r.status]}`}>
                      {STATUS_LABELS[r.status]}{r.checked_in_at ? " · checked in" : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    <Link href={ticketPath(r.ref_code)} className="font-mono text-foreground hover:underline">{r.ref_code}</Link>
                    {r.source === "school"
                      ? ` · replied by ${r.first_name} ${r.last_name}`
                      : ` · ${ATTENDEE_ROLES.find((x) => x.key === r.role)?.label}${r.organisation ? ` · ${r.organisation}` : ""}`}
                    {r.lga ? ` · ${r.lga}` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {r.email}{r.phone ? ` · ${maskPhone(r.phone)}` : ""} · {r.seats} seat{r.seats === 1 ? "" : "s"}
                    {r.student_count ? ` (${r.student_count} student${r.student_count === 1 ? "" : "s"})` : ""} · {formatCampDate(r.created_at)}
                  </p>
                  {r.source === "school" && r.educators?.length ? (
                    <p className="mt-1 wrap-break-word">Educators: {r.educators.map((e) => e.name).join(", ")}</p>
                  ) : null}
                  {named.get(r.id)?.length ? <p className="mt-1 wrap-break-word">Students: {named.get(r.id)!.join(", ")}</p> : null}
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {r.status === "confirmed" ? (
                      <ActionForm action={checkInAttendee.bind(null, r.id, !!r.checked_in_at)}>
                        <SubmitButton size="sm" variant={r.checked_in_at ? "outline" : "default"} pendingText="…">{r.checked_in_at ? "Undo check-in" : "Check in"}</SubmitButton>
                      </ActionForm>
                    ) : null}
                    {r.status !== "confirmed" ? (
                      <ActionForm action={setAttendeeStatus.bind(null, r.id, "confirmed")}>
                        <SubmitButton size="sm" pendingText="…">Confirm and email</SubmitButton>
                      </ActionForm>
                    ) : null}
                    {r.status !== "cancelled" ? (
                      <ActionForm action={resendTicket.bind(null, r.id)}>
                        <SubmitButton size="sm" variant="outline" pendingText="…">Resend</SubmitButton>
                      </ActionForm>
                    ) : null}
                    {r.status !== "cancelled" ? (
                      <ActionForm action={setAttendeeStatus.bind(null, r.id, "cancelled")}>
                        <ConfirmSubmitButton
                          size="sm"
                          variant="outline"
                          destructive
                          title="Cancel this registration?"
                          description={`${r.seats} seat${r.seats === 1 ? "" : "s"} go back to the pool. No email is sent.`}
                          confirmLabel="Yes, cancel"
                        >
                          Cancel
                        </ConfirmSubmitButton>
                      </ActionForm>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Pagination page={clampPage(page, pageCount)} pageCount={pageCount} path={PATH} params={filterParams} />
          </div>
        </Card>
      </PortalBody>
    </>
  );
}
