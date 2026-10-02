import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, canViewModule, requireModuleView } from "@/supabase/auth";
import { Card, EmptyState, PortalBody, PortalHeader, SectionHeading, StatTile } from "@/components/portal/ui";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import ActionForm from "@/components/portal/action-form";
import { SubmitButton } from "@/components/portal/submit-button";
import { attendanceCounts } from "@/lib/attendance";
import { loadSitting, openAttendanceExam } from "@/lib/attendance-data";
import { SITE_URL } from "@/lib/site";
import AttendanceLink from "@/components/portal/attendance-link";
import SettingsTabs from "@/components/portal/settings-tabs";
import { CENTRE_LEAD_ROLE_LABELS, type CentreLead, type ExamCentre } from "@/supabase/types";
import { setAttendanceOpen } from "./actions";
import CentreLeadsPanel from "@/components/portal/centre-leads-panel";
import UnallocatedSchools from "@/components/portal/unallocated-schools";

export const metadata = pageMetadata(
  "Attendance",
  "Who turned up at each centre, and who marked them.",
);
export const dynamic = "force-dynamic";

export default async function AdminAttendance() {
  await requireModuleView("participants");
  const [canManage, canOpenRegistrations] = await Promise.all([
    canManageModule("participants"),
    canViewModule("registrations"),
  ]);
  const supabase = await createClient();

  const [{ data: exams, error: examsError }, open] = await Promise.all([
    supabase
      .from("paper_exams")
      .select("id, title, edition_year, stage, attendance_open")
      .order("edition_year", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
    openAttendanceExam(),
  ]);
  if (examsError) {
    return (
      <>
        <PortalHeader title="Attendance" />
        <PortalBody>
          <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm">
            Could not read the paper exams: {examsError.message}
          </Card>
        </PortalBody>
      </>
    );
  }

  // `??` does not catch NaN, so a missing edition has to be tested for, not
  // defaulted around — otherwise both queries below filter on edition_year=NaN.
  const candidateYear = open?.edition_year ?? Number(exams?.[0]?.edition_year);
  const editionYear = Number.isFinite(candidateYear) ? candidateYear : new Date().getFullYear();

  const [{ data: centreRows, error: centresError }, { data: leadRows, error: leadsError }] =
    await Promise.all([
      supabase
        .from("exam_centres")
        .select("id, edition_year, name, town, legacy_zone, is_active")
        .eq("edition_year", editionYear)
        .order("town"),
      supabase
        .from("centre_leads")
        .select(
          "id, edition_year, centre_id, name, email, phone, role, is_active," +
            " last_signed_in_at, last_emailed_at",
        )
        .eq("edition_year", editionYear)
        .order("name"),
    ]);

  const centres = (centreRows ?? []) as ExamCentre[];
  const leads = (leadRows ?? []) as unknown as CentreLead[];

  const sitting = open ? await loadSitting(open) : null;
  const entries = sitting?.entries ?? [];
  const overall = attendanceCounts(entries.filter((e) => e.centreId !== null));

  const activeLeads = leads.filter((l) => l.is_active);
  const staffedCentreIds = new Set(activeLeads.map((l) => l.centre_id));
  const unstaffed = centres.filter((c) => c.is_active && !staffedCentreIds.has(c.id));

  const turnoutTab = (
    <section className="space-y-3">
      {/* Staff are what make the register reachable at all, and the admin can
          only find out by opening the other tab. Say it here instead. */}
      {unstaffed.length > 0 ? (
        <Card className="border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-bold text-foreground">
            {activeLeads.length === 0
              ? "Nobody can mark attendance yet."
              : `${unstaffed.length} centre${unstaffed.length === 1 ? " has" : "s have"} no staff.`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            A centre with no registered staff has nobody who can sign in, so its candidates stay
            unmarked all day: {unstaffed.map((c) => c.town).join(", ")}.
          </p>
          <Link
            href="?tab=staff"
            scroll={false}
            className="mt-2 inline-block text-sm font-bold text-gold-ink hover:underline"
          >
            Add centre staff →
          </Link>
        </Card>
      ) : null}

      {open ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <SectionHeading>Turnout</SectionHeading>
            <Link
              href="/portal/admin/attendance/export"
              className="text-xs font-bold text-gold-ink hover:underline"
            >
              Download CSV
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <StatTile label="Present" value={String(overall.present)} />
            <StatTile label="Absent" value={String(overall.absent)} />
            <StatTile label="Not marked" value={String(overall.unmarked)} />
            <StatTile label="Allocated" value={String(overall.total)} />
          </div>

          <div className="divide-y divide-foreground/5 border border-foreground/10">
            {centres.map((centre) => {
              const counts = attendanceCounts(entries.filter((e) => e.centreId === centre.id));
              const staffed = activeLeads.filter((l) => l.centre_id === centre.id).length;
              return (
                <Link
                  key={centre.id}
                  href={`/portal/admin/attendance/${centre.id}`}
                  className="grid gap-1 px-4 py-3 hover:bg-foreground/5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {centre.name}, {centre.town}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {counts.total} allocated ·{" "}
                      <span className={staffed === 0 ? "font-bold text-destructive" : ""}>
                        {staffed} staff
                      </span>
                      {centre.legacy_zone ? "" : " · no legacy zone — allocate by hand"}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">
                    <span className="font-bold text-foreground">{counts.present}</span> present ·{" "}
                    {counts.absent} absent ·{" "}
                    <span className={counts.unmarked ? "text-gold-ink" : ""}>
                      {counts.unmarked} not marked
                    </span>
                  </p>
                </Link>
              );
            })}
            {centres.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No centres for this edition">
                  The venues are seeded by migration 20260921090200. Push it, then reload.
                </EmptyState>
              </div>
            ) : null}
          </div>

          <UnallocatedSchools
            entries={entries}
            centres={centres}
            canManage={canManage}
            editionYear={open.edition_year}
            canOpenRegistrations={canOpenRegistrations}
          />
        </>
      ) : (
        <EmptyState title="No sitting is open">
          Open attendance on the exam being sat, above, and turnout appears here as centre staff
          mark their registers.
        </EmptyState>
      )}
    </section>
  );

  return (
    <>
      <PortalHeader
        title="Attendance"
        subtitle="Centre staff mark this on their phones. Nobody here needs a portal account."
      />
      <PortalBody>
        {centresError || leadsError ? (
          <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm">
            {centresError?.message ?? leadsError?.message}
          </Card>
        ) : null}

        {/* ── the sitting ───────────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionHeading>The sitting</SectionHeading>
            {canManage ? null : <ReadOnlyBadge />}
          </div>

          {open ? (
            <Card className="p-4">
              <p className="mb-3 text-sm">
                <span className="font-bold text-foreground">{open.title}</span> is open for
                attendance. Staff also reach this from the banner now showing on the Fellows
                page — send the link to anyone who cannot find it.
              </p>
              <AttendanceLink url={`${SITE_URL}/attendance`} />
              {canManage ? (
                <ActionForm action={setAttendanceOpen} className="mt-3">
                  <input type="hidden" name="exam_id" value={open.id} />
                  <input type="hidden" name="open" value="false" />
                  <SubmitButton variant="outline" pendingText="Closing…">
                    Close attendance
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </Card>
          ) : (
            <Card className="p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Nothing is open, so nobody can sign in. Open the exam being sat today.
              </p>
              {canManage && exams?.length ? (
                <ActionForm action={setAttendanceOpen} className="flex flex-wrap gap-2">
                  <input type="hidden" name="open" value="true" />
                  <select
                    name="exam_id"
                    defaultValue={exams[0].id}
                    className="min-h-11 rounded-md border border-foreground/15 bg-card px-3 text-sm"
                  >
                    {exams.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title} · {e.edition_year}
                      </option>
                    ))}
                  </select>
                  <SubmitButton pendingText="Opening…">Open attendance</SubmitButton>
                </ActionForm>
              ) : null}
            </Card>
          )}
        </section>

        <SettingsTabs
          paramKey="tab"
          tabs={[
            { label: "Turnout", slug: "turnout", content: turnoutTab },
            {
              // The count is in the label because "0" is the thing the admin
              // needs to notice before exam morning, not after.
              label: `Centre staff (${activeLeads.length})`,
              slug: "staff",
              content: (
                <CentreLeadsPanel
                  centres={centres}
                  leads={leads}
                  canManage={canManage}
                  editionYear={editionYear}
                  roleLabels={CENTRE_LEAD_ROLE_LABELS}
                />
              ),
            },
          ]}
        />
      </PortalBody>
    </>
  );
}
