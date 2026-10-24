import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { Card, EmptyState, PortalBody, PortalHeader, SectionHeading, StatTile } from "@/components/portal/ui";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import ActionForm from "@/components/portal/action-form";
import { SubmitButton } from "@/components/portal/submit-button";
import AttendanceLink from "@/components/portal/attendance-link";
import AttendanceTabs from "@/components/portal/attendance-tabs";
import CentreLeadsPanel from "@/components/portal/centre-leads-panel";
import MarkButtons from "@/components/portal/mark-buttons";
import { CENTRE_LEAD_ROLE_LABELS, type CentreLead, type ExamCentre } from "@/supabase/types";
import { attendanceCounts, latestEventByStudent, markerName, type AttendanceEvent } from "@/lib/attendance";
import { campDayFor, campDays, campRegister, formatCampDay } from "@/lib/camp-attendance";
import { loadCampMarks, loadCampPeople } from "@/lib/camp-attendance-data";
import { SITE_URL } from "@/lib/site";
import { correctCampMark, setCampAttendanceOpen } from "./actions";

export const metadata = pageMetadata("Camp attendance", "Who is at camp, day by day, and who marked them.");
export const dynamic = "force-dynamic";

export default async function CampAttendance({
  searchParams,
}: {
  searchParams: Promise<{ edition?: string; day?: string }>;
}) {
  await requireModuleView("participants");
  const canManage = await canManageModule("participants");
  const { edition, day: dayParam } = await searchParams;
  const supabase = await createClient();

  const { data: latest, error: latestError } = await supabase
    .from("camp_settings")
    .select("edition_year")
    .order("edition_year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(latestError.message);
  const year = Number(edition) || latest?.edition_year || null;

  const { settings, people, error } = year
    ? await loadCampPeople(supabase, year)
    : { settings: null, people: [], error: null };
  if (error) throw new Error(`Could not load the camp list: ${error}`);

  const days = campDays(settings?.arrival_at, settings?.departure_at);
  const day = days.includes(dayParam ?? "") ? dayParam! : campDayFor(days);

  if (!year || !settings || !day) {
    return (
      <>
        <PortalHeader title="Attendance" />
        <PortalBody>
          <AttendanceTabs active="camp" />
          <EmptyState title="Camp has no dates yet">
            Set the arrival and departure times on the{" "}
            <Link href="/portal/admin/participants/camp" className="text-gold-ink hover:underline">
              camp page
            </Link>{" "}
            and the register opens with one day per day of camp.
          </EmptyState>
        </PortalBody>
      </>
    );
  }

  const [marks, { data: centre, error: centreError }, { data: eventRows, error: eventsError }] =
    await Promise.all([
      loadCampMarks(supabase, year, day),
      supabase
        .from("exam_centres")
        .select("id, edition_year, name, town, legacy_zone, is_active, kind")
        .eq("edition_year", year)
        .eq("kind", "camp")
        .maybeSingle(),
      supabase
        .from("camp_attendance_events")
        .select("student_id:person_key, at, centre_leads(name), profiles(full_name, email)")
        .eq("edition_year", year)
        .eq("camp_day", day),
    ]);
  if (centreError) throw new Error(centreError.message);
  if (eventsError) throw new Error(eventsError.message);

  const { data: staffRows, error: staffError } = centre
    ? await supabase
        .from("centre_leads")
        .select(
          "id, edition_year, centre_id, name, email, phone, role, is_active," +
            " last_signed_in_at, last_emailed_at",
        )
        .eq("centre_id", centre.id)
        .order("name")
    : { data: [], error: null };
  if (staffError) throw new Error(staffError.message);
  const staff = (staffRows ?? []) as unknown as CentreLead[];
  const staffCount = staff.filter((s) => s.is_active).length;

  const register = campRegister(people, marks);
  const latestEvent = latestEventByStudent((eventRows ?? []) as unknown as AttendanceEvent[]);
  const students = attendanceCounts(register.filter((p) => p.role === "student"));
  const educators = attendanceCounts(register.filter((p) => p.role !== "student"));
  const dayHref = (d: string) => `/portal/admin/attendance/camp?edition=${year}&day=${d}`;
  const open = Boolean(settings.attendance_open);

  return (
    <>
      <PortalHeader title="Attendance" subtitle={`${settings.title} · ${formatCampDay(day, days)}`} />
      <PortalBody>
        <AttendanceTabs active="camp" />

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionHeading>Camp register</SectionHeading>
            {canManage ? null : <ReadOnlyBadge />}
          </div>
          <Card className="space-y-3 p-4">
            <p className="text-sm">
              {open ? (
                <>
                  <span className="font-bold text-foreground">Open.</span> Camp staff sign in at the
                  link below, choose <span className="font-bold">{centre ? `${centre.name}, ${centre.town}` : "the camp"}</span>,
                  and mark today&apos;s register.
                </>
              ) : (
                <span className="text-muted-foreground">
                  Closed, so camp staff cannot sign in. Open it on the morning of arrival.
                </span>
              )}
            </p>
            <p className={`text-sm ${staffCount ? "text-muted-foreground" : "font-bold text-destructive"}`}>
              {staffCount
                ? `${staffCount} staff can sign in to mark the camp.`
                : "Nobody can mark the camp yet."}{" "}
              <a href="#staff" className="font-bold text-gold-ink hover:underline">
                {staffCount ? "Manage camp staff ↓" : "Add camp staff ↓"}
              </a>
            </p>
            {open ? <AttendanceLink url={`${SITE_URL}/attendance`} /> : null}
            {canManage ? (
              <ActionForm action={setCampAttendanceOpen}>
                <input type="hidden" name="edition_year" value={year} />
                <input type="hidden" name="open" value={open ? "false" : "true"} />
                <SubmitButton variant={open ? "outline" : undefined} pendingText={open ? "Closing…" : "Opening…"}>
                  {open ? "Close camp attendance" : "Open camp attendance"}
                </SubmitButton>
              </ActionForm>
            ) : null}
          </Card>
        </section>

        {centre ? (
          <section id="staff" className="space-y-3 scroll-mt-6">
            <SectionHeading>Camp staff ({staffCount})</SectionHeading>
            <CentreLeadsPanel
              centres={[centre as ExamCentre]}
              leads={staff}
              canManage={canManage}
              editionYear={year}
              roleLabels={CENTRE_LEAD_ROLE_LABELS}
            />
          </section>
        ) : (
          <EmptyState title="No camp venue yet">
            Open camp attendance once and the camp appears here, ready for staff.
          </EmptyState>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {days.map((d) => (
              <Link
                key={d}
                href={dayHref(d)}
                scroll={false}
                className={`min-h-9 rounded-full px-3 py-2 text-xs font-bold ${
                  d === day ? "bg-primary/15 text-gold-ink" : "bg-foreground/5 text-muted-foreground"
                }`}
              >
                {formatCampDay(d, days)}
              </Link>
            ))}
            <a
              href={`/portal/admin/attendance/camp/export?edition=${year}`}
              className="ml-auto text-xs font-bold text-gold-ink hover:underline"
            >
              Download CSV
            </a>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <StatTile label="Students present" value={`${students.present} / ${students.total}`} />
            <StatTile label="Educators present" value={`${educators.present} / ${educators.total}`} />
            <StatTile label="Absent" value={String(students.absent + educators.absent)} />
            <StatTile label="Not marked" value={String(students.unmarked + educators.unmarked)} />
          </div>

          {register.length === 0 ? (
            <EmptyState title="Nobody on the camp list">
              No school has confirmed it is attending camp.
            </EmptyState>
          ) : (
            <Card className="divide-y divide-foreground/5 p-0">
              {register.map((p) => {
                const event = latestEvent.get(p.key);
                const who = markerName(event);
                return (
                  <div
                    key={p.key}
                    className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.schoolName}
                        {p.detail ? ` · ${p.detail}` : ""}
                      </p>
                    </div>
                    <div className="min-w-0 text-xs text-muted-foreground">
                      {p.state === "unmarked" ? (
                        <span className="text-gold-ink">Not marked</span>
                      ) : (
                        <>
                          <span
                            className={
                              p.state === "present" ? "font-bold text-foreground" : "font-bold text-destructive"
                            }
                          >
                            {p.state === "present" ? "Present" : "Absent"}
                          </span>
                          {who ? ` · marked by ${who}` : ""}
                          {event ? ` · ${new Date(event.at).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos" })}` : ""}
                        </>
                      )}
                    </div>
                    {canManage ? (
                      <MarkButtons
                        action={correctCampMark}
                        fields={{ edition_year: year, day, person_key: p.key }}
                        state={p.state}
                      />
                    ) : null}
                  </div>
                );
              })}
            </Card>
          )}
        </section>
      </PortalBody>
    </>
  );
}
