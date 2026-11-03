import Link from "next/link";
import { Card } from "@/components/portal/ui";
import { formatCampDate } from "@/lib/camp";
import { GRAND_FINALE, SCHOOL_FINALE_PATH, schoolInviteState } from "@/lib/finale-attend";
import { loadAttendance, loadSchoolResponse } from "@/lib/finale-attend-data";
import { FINALE_YEAR, finaleDb } from "@/lib/finale-data";

const cta =
  "inline-flex items-center gap-2 bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-foreground hover:bg-primary/90 transition-colors";

/** The Grand Finale invitation on the school dashboard. `schoolId` came from an RLS read of the acting entry. */
export default async function FinaleInviteCard({ schoolId, editionYear }: { schoolId: string; editionYear: number }) {
  if (editionYear !== FINALE_YEAR) return null;
  const db = finaleDb();
  if (!db) return null;
  const [attendance, { response, error }] = await Promise.all([loadAttendance(db, FINALE_YEAR), loadSchoolResponse(db, FINALE_YEAR, schoolId)]);
  // A failed read still shows the invitation, just without the school's answer.
  if (attendance.error || error) console.error("finale: invite card", attendance.error ?? error);
  const state = schoolInviteState(attendance.settings);
  if (state === "over") return null;

  const status = response?.status ?? null;
  const tone = status === "confirmed" ? "border-l-green-600" : status === "cancelled" ? "border-l-foreground/30" : "border-l-primary";
  const heading =
    status === "confirmed"
      ? `Your seats are confirmed: ${response!.seats}`
      : status === "waitlisted"
        ? "You're on the Grand Finale waitlist"
        : status === "cancelled"
          ? "You told us you can't come"
          : state === "open"
            ? "You're invited to the Grand Finale"
            : "Grand Finale replies have closed";

  return (
    <Card className={`p-5 border-l-4 ${tone}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-ink">ASC {FINALE_YEAR} Grand Finale · {GRAND_FINALE.shortDate}</p>
      <p className="font-bebas text-2xl text-foreground leading-tight mt-1">{heading}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
        {GRAND_FINALE.venue}, {GRAND_FINALE.venueArea} · {GRAND_FINALE.timeLabel}.{" "}
        {!response && state === "open"
          ? `Accept and choose the educators and students you're bringing${attendance.settings?.school_respond_by ? ` by ${formatCampDate(attendance.settings.school_respond_by)}` : ""}.`
          : response && status !== "cancelled"
            ? `Ticket ${response.ref_code}.`
            : ""}
      </p>
      <div className="mt-4">
        <Link href={SCHOOL_FINALE_PATH} className={cta}>
          {!response && state === "open" ? "Accept and choose students →" : "View or change →"}
        </Link>
      </div>
    </Card>
  );
}
