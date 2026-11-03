import { Card, PortalBody, PortalHeader, StatTile } from "@/components/portal/ui";
import ActionForm from "@/components/portal/action-form";
import { SubmitButton } from "@/components/portal/submit-button";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import AttendanceLink from "@/components/portal/attendance-link";
import CentreLeadsPanel from "@/components/portal/centre-leads-panel";
import FinaleTabs from "@/components/portal/finale-tabs";
import { FINALE_STAFF_ROLE_LABELS, GRAND_FINALE } from "@/lib/finale-attend";
import { loadAttendance } from "@/lib/finale-attend-data";
import { FINALE_YEAR, finaleDb } from "@/lib/finale-data";
import { SITE_URL } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import type { CentreLead, ExamCentre } from "@/supabase/types";
import { setFinaleDoorOpen } from "../actions";

export const metadata = pageMetadata("Grand Finale door staff", "The people who scan tickets and check guests in at the door.");
export const dynamic = "force-dynamic";

export default async function FinaleDoorStaff() {
  await requireModuleView("participants");
  const canManage = await canManageModule("participants");
  const year = FINALE_YEAR;
  const supabase = await createClient();

  const [centreRes, settingsRes] = await Promise.all([
    supabase.from("exam_centres").select("id, edition_year, name, town, legacy_zone, is_active, kind").eq("edition_year", year).eq("kind", "finale").maybeSingle(),
    supabase.from("finale_settings").select("door_open").eq("edition_year", year).maybeSingle(),
  ]);
  if (centreRes.error) throw new Error(`Could not load the Grand Finale venue: ${centreRes.error.message}`);
  if (settingsRes.error) throw new Error(`Could not load the door setting: ${settingsRes.error.message}`);
  const centre = centreRes.data as ExamCentre | null;
  const doorOpen = Boolean((settingsRes.data as { door_open?: boolean } | null)?.door_open);

  const { data: staffRows, error: staffError } = centre
    ? await supabase
        .from("centre_leads")
        .select("id, edition_year, centre_id, name, email, phone, role, is_active, last_signed_in_at, last_emailed_at")
        .eq("centre_id", centre.id)
        .order("name")
    : { data: [], error: null };
  if (staffError) throw new Error(`Could not load the door staff: ${staffError.message}`);
  const staff = (staffRows ?? []) as unknown as CentreLead[];
  const active = staff.filter((s) => s.is_active);

  // Totals come from finale_attend_taken(), service role only; this page has passed requireModuleView.
  const service = finaleDb();
  const attendance = service ? await loadAttendance(service, year) : null;
  const totals = attendance && !attendance.error ? attendance.totals : null;

  return (
    <>
      <PortalHeader title="Grand Finale" subtitle={`ASC ${year}: the team checking guests in at the door.`} />
      <PortalBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FinaleTabs active="staff" />
          {!canManage ? <ReadOnlyBadge /> : null}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Door" value={doorOpen ? "Open" : "Closed"} />
          <StatTile label="Active staff" value={active.length} />
          <StatTile label="Staff signed in so far" value={active.filter((s) => s.last_signed_in_at).length} />
          <StatTile
            label="Seats checked in"
            value={totals ? `${totals.checkedIn.toLocaleString("en-NG")} of ${(totals.confirmed + totals.schoolConfirmed).toLocaleString("en-NG")}` : "—"}
          />
        </div>

        <Card className={`border-l-4 p-5 ${doorOpen ? "border-l-green-600" : "border-l-foreground/30"}`}>
          <h2 className="text-xl font-bold text-foreground">The door</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {doorOpen
              ? `Open. Staff sign in at the link below, choose “Grand Finale” and enter the email you added them with. No password.`
              : `Closed, so staff can't sign in. Open it on the morning of ${GRAND_FINALE.dateLabel}, before doors at 9am. Closing it signs everyone out at their next tap.`}
          </p>
          <div className="mt-4 grid gap-3">
            {doorOpen ? <AttendanceLink url={`${SITE_URL}/attendance`} /> : null}
            {canManage ? (
              <ActionForm action={setFinaleDoorOpen.bind(null, year, !doorOpen)}>
                <SubmitButton size="sm" variant={doorOpen ? "outline" : "default"} pendingText="Saving…">
                  {doorOpen ? "Close the door" : "Open the door"}
                </SubmitButton>
              </ActionForm>
            ) : null}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            On the day, staff tap <b>Tap to start scanning</b> and point their phone at each ticket&apos;s QR code, or search by code or name. A
            waitlisted, cancelled or already-used ticket shows a red or amber warning instead of a check-in button.
          </p>
        </Card>

        {centre ? (
          <CentreLeadsPanel centres={[centre]} leads={staff} canManage={canManage} editionYear={year} roleLabels={FINALE_STAFF_ROLE_LABELS} />
        ) : (
          <Card className="p-5 text-sm text-muted-foreground">
            The Grand Finale venue for {year} isn&apos;t set up yet. Run the latest database migration (<code>npm run db:push</code>) and refresh.
          </Card>
        )}
      </PortalBody>
    </>
  );
}
