import Link from "next/link";
import Countdown from "@/components/finale/countdown";
import { ATTEND_BASE, GRAND_FINALE, attendState } from "@/lib/finale-attend";
import { loadAttendance } from "@/lib/finale-attend-data";
import { FINALE_YEAR, finaleDb } from "@/lib/finale-data";

/** The home page's notice board for the finale, until it is over. If seats can't be read (no
 *  migration yet), it still shows the event and links to the page, just without "register now". */
export default async function FinaleNotice() {
  const db = finaleDb();
  const attendance = db ? await loadAttendance(db, FINALE_YEAR) : null;
  if (attendance?.error) console.error("finale: notice could not read seats", attendance.error);
  const state = attendance && !attendance.error ? attendState(attendance.settings, attendance.totals.confirmed) : attendState(null, 0);
  if (state === "over") return null;

  return (
    // Sticks under the fixed navbar (h-18) and below its z-100 so the nav dropdowns still open over it.
    <aside aria-label="Grand Finale notice" className="sticky top-18 z-90 border-b border-primary/40 bg-secondary/95 px-4 py-2.5 backdrop-blur md:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            <span className="inline-block size-2 shrink-0 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
            <span className="truncate">Grand Finale · {GRAND_FINALE.shortDate} · {GRAND_FINALE.venueArea}</span>
          </p>
          <p className="mt-0.5 truncate text-sm font-black uppercase text-white md:text-lg">
            {GRAND_FINALE.theme}
            <span className="hidden font-semibold normal-case text-secondary-foreground/75 lg:inline">
              {" "}· {GRAND_FINALE.venue}, {GRAND_FINALE.timeLabel} · Free entry
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden md:block">
            <Countdown to={GRAND_FINALE.startsAt} compact />
          </div>
          <Link
            href={state === "closed" ? ATTEND_BASE : `${ATTEND_BASE}#register`}
            className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md bg-primary px-3.5 text-sm font-bold text-primary-foreground md:min-h-11 md:px-5 md:text-base"
          >
            {state === "closed" ? "See details →" : state === "waitlist" ? "Join waitlist →" : "Register →"}
          </Link>
        </div>
      </div>
    </aside>
  );
}
