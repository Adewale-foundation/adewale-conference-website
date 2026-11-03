import Image from "next/image";
import Link from "next/link";
import AttendForm from "@/components/finale/attend-form";
import Countdown from "@/components/finale/countdown";
import { FINALE_BASE } from "@/lib/finale";
import { ATTEND_BASE, GRAND_FINALE, attendState, seatsLeft, type AttendState } from "@/lib/finale-attend";
import { loadAttendance } from "@/lib/finale-attend-data";
import { FINALE_YEAR, finaleDb } from "@/lib/finale-data";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 60;
export const metadata = pageMetadata(
  `ASC ${FINALE_YEAR} Grand Finale`,
  `${GRAND_FINALE.theme}: ${GRAND_FINALE.subtheme}. ${GRAND_FINALE.dateLabel}, ${GRAND_FINALE.venue}, ${GRAND_FINALE.venueArea}. Free entry: register your seats.`,
  ATTEND_BASE,
);

const HAPPENS = [
  { title: "Semi-finals", body: "Four finalist schools face off in two head-to-head rounds." },
  { title: "Project exhibition", body: "Student inventions and engineering projects on show." },
  { title: "The Final", body: `Two schools compete for the ASC ${FINALE_YEAR} trophy.` },
  { title: "Awards", body: "Prizes for the champions, the top students and the best fan-vote predictors." },
];

const WHO = [
  { title: "Teachers", body: "Bring a class. Tell us how many students are coming and we hold a seat for each of them." },
  { title: "Proprietors", body: "See what ASC schools are building and talk to the team about joining the next edition." },
  { title: "Students", body: "Come and cheer. Secondary students can register on their own or with their teacher." },
  { title: "Undergraduates", body: "STEM undergraduates are welcome, and so are our Fellows and future volunteers." },
];

const FAQ = [
  { q: "Is it free?", a: "Yes. Entry is free with a ticket code. Register first so we can hold your seats." },
  { q: "My school is registered for ASC this year. Do we use this form?", a: "No. Accept the invitation in your school portal instead. It's on your Home page, where you choose the educators and students you're bringing." },
  { q: "Do my students need their own tickets?", a: "No. A teacher's ticket covers every student they registered. Arrive together and check in as one group." },
  { q: "What if the hall is full?", a: "You join the waitlist and we email you as soon as seats open. Seats not claimed by 10:15am on the day may be released." },
  { q: "Can I change the number of students?", a: "Reply to your ticket email with the new number and we will update your seats if there is space." },
];

const GALLERY = ["gallery1.jpg", "gallery3.jpg", "gallery5.jpg", "gallery7.jpg", "gallery14.jpg"];

export default async function GrandFinalePage() {
  const db = finaleDb();
  const attendance = db ? await loadAttendance(db, FINALE_YEAR) : null;
  if (attendance?.error) console.error("finale: attendance could not load", attendance.error);
  const capacity = attendance?.settings?.attend_capacity ?? null;
  const taken = attendance?.totals.confirmed ?? 0;
  const state: AttendState = attendance && !attendance.error ? attendState(attendance.settings, taken) : "closed";
  const left = seatsLeft(capacity, taken);

  return (
    <>
      <header className="relative overflow-hidden bg-[#0A0F1E] text-white">
        <Image src="/assets/finale-venue.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[center_40%] opacity-40" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#0A0F1E]/60 via-[#0A0F1E]/35 to-[#0A0F1E]" />
        <div className="relative mx-auto max-w-6xl px-4 pt-14 md:px-12 md:pt-20">
          <span className="inline-block border border-primary bg-[rgba(232,160,32,0.1)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-primary md:text-xs">
            ASC {FINALE_YEAR} · Grand Finale
          </span>
          <h1 className="mt-6 text-[clamp(2.5rem,12.5vw,6rem)] font-black uppercase leading-[0.9] tracking-tight text-balance">
            The Gateway <span className="text-primary">Generation</span>
          </h1>
          <p className="mt-3 text-2xl font-bold text-white/85 md:text-4xl">{GRAND_FINALE.subtheme}</p>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/75 md:text-lg">
            Four schools left standing and one trophy. Spend a day with the students who will build the next Ogun State, and watch them compete live.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {state === "open" || state === "waitlist" ? (
              <a href="#register" className="inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-extrabold text-[#0A0F1E]">
                {state === "open" ? "Secure your seat" : "Join the waitlist"}
              </a>
            ) : null}
            <Link href={FINALE_BASE} className="inline-flex min-h-12 items-center rounded-md px-6 font-extrabold text-white shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.4)] hover:shadow-[inset_0_0_0_1.5px_#fff]">
              Back a school in the fan vote
            </Link>
          </div>

          {/* Phones: date and time share a row, venue and the countdown get one each. From md the
              countdown column sizes to its tiles so it never clips. */}
          <dl className="mt-12 grid grid-cols-2 border-t border-dashed border-white/30 md:mt-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto]">
            {[
              ["Date", GRAND_FINALE.shortDate, String(FINALE_YEAR)],
              ["Time", GRAND_FINALE.timeLabel, "Doors open 9am"],
              ["Venue", GRAND_FINALE.venue, GRAND_FINALE.venueArea],
            ].map(([k, v, s], i) => (
              <div
                key={k}
                className={`min-w-0 border-b border-dashed border-white/20 px-4 py-5 md:border-b-0 md:border-r ${i === 0 ? "border-r" : ""} ${i === 2 ? "col-span-2 md:col-span-1" : ""}`}
              >
                <dt className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/50">{k}</dt>
                <dd className="mt-1.5 text-xl font-black uppercase leading-tight md:text-2xl">{v}</dd>
                <dd className="text-sm text-white/60">{s}</dd>
              </div>
            ))}
            <div className="col-span-2 min-w-0 px-4 py-5 md:col-span-1">
              <dt className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/50">Starts in</dt>
              <dd><Countdown to={GRAND_FINALE.startsAt} /></dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="px-4 py-16 md:px-12 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[1.1fr_0.9fr]">
          <div className="grid content-start gap-6">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-gold-ink">About the day</span>
            <p className="text-3xl font-black uppercase leading-[1.02] tracking-tight text-balance md:text-5xl">
              Ogun State is the gateway to Nigeria. On 19 November, its <span className="text-gold-ink">students</span> show where that gateway leads.
            </p>
            <div className="grid gap-4 text-base leading-relaxed text-muted-foreground md:text-lg">
              <p>The Grand Finale closes the {FINALE_YEAR} Adewale Students Conference. Months of exams, camp and challenges come down to one day: the semi-finals, the final and the award of the ASC trophy.</p>
              <p>Entry is free. Alongside the competing schools, we are opening seats to educators, proprietors, students and undergraduates across the state.</p>
            </div>
          </div>
          <ol className="border-t-2 border-foreground">
            {HAPPENS.map((h, i) => (
              <li key={h.title} className="grid grid-cols-[2.75rem_1fr] gap-3 border-b border-foreground/10 py-4">
                <span className="text-2xl font-black text-gold-ink">{String(i + 1).padStart(2, "0")}</span>
                <p>
                  <b className="block">{h.title}</b>
                  <span className="text-sm text-muted-foreground">{h.body}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 pb-16 md:px-12 md:pb-20">
        <div className="mx-auto max-w-6xl">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-gold-ink">Who should come</span>
          <h2 className="mt-2 text-4xl font-black uppercase tracking-tight md:text-6xl">Bring your school</h2>
          <div className="mt-8 grid gap-0.5 bg-foreground/10 p-0.5 sm:grid-cols-2 lg:grid-cols-4">
            {WHO.map((w) => (
              <div key={w.title} className="bg-card p-6">
                <h3 className="text-2xl font-black uppercase">{w.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 md:px-12 md:pb-20">
        <div className="relative mx-auto grid max-w-6xl items-center gap-6 overflow-hidden bg-[#0A0F1E] p-7 text-white md:grid-cols-[1fr_auto] md:p-10">
          <div aria-hidden className="pointer-events-none absolute -right-4 -top-16 select-none text-[14rem] leading-none text-[rgba(232,160,32,0.08)]">★</div>
          <div className="relative">
            <h2 className="text-3xl font-black uppercase tracking-tight md:text-5xl">Can&apos;t make it? Back a school</h2>
            <p className="mt-2 max-w-xl text-white/70">Pick your team in the fan vote, predict the champion and share your badge. The best predictors win prizes.</p>
          </div>
          <Link href={FINALE_BASE} className="relative inline-flex min-h-12 items-center justify-self-start rounded-md bg-primary px-6 font-extrabold text-[#0A0F1E]">
            Go to the fan vote →
          </Link>
        </div>
      </section>

      <section className="px-4 pb-16 md:px-12 md:pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-gold-ink">From past editions</span>
              <h2 className="mt-2 text-4xl font-black uppercase tracking-tight md:text-6xl">Photos</h2>
            </div>
            <Link href="/gallery" className="text-sm font-semibold text-gold-ink hover:underline">See the full gallery →</Link>
          </div>
          <div className="mt-8 grid auto-rows-[140px] grid-cols-2 gap-2 md:auto-rows-[160px] md:grid-cols-6">
            {GALLERY.map((src, i) => (
              <div
                key={src}
                className={`relative overflow-hidden bg-muted ${i === 0 ? "col-span-2 row-span-2 md:col-span-3" : i === 1 || i === 4 ? "col-span-2 md:col-span-3" : "md:col-span-3"}`}
              >
                <Image src={`/assets/${src}`} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted px-4 py-16 md:px-12 md:py-20">
        <div className="mx-auto grid max-w-6xl overflow-hidden bg-card md:grid-cols-[1.2fr_1fr]">
          <div className="relative min-h-64 md:min-h-80">
            <Image src="/assets/finale-venue.jpg" alt={`${GRAND_FINALE.venue} from above`} fill sizes="(min-width: 768px) 60vw, 100vw" className="object-cover" />
          </div>
          <div className="grid content-start gap-5 p-7 md:p-9">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-gold-ink">Venue</span>
            <h2 className="text-4xl font-black uppercase leading-none tracking-tight">{GRAND_FINALE.venue}</h2>
            <dl className="grid gap-3 text-[15px]">
              {[
                ["Address", `${GRAND_FINALE.venueArea}, Ogun State`],
                ["When", `${GRAND_FINALE.dateLabel}, ${GRAND_FINALE.timeLabel} (doors 9am)`],
                ["Entry", "Free, with your ticket code"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[5.5rem_1fr] gap-3">
                  <dt className="pt-0.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <a href={GRAND_FINALE.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-self-start rounded-md bg-primary px-6 font-extrabold text-[#0A0F1E]">
              Open in Google Maps ↗
            </a>
          </div>
        </div>
      </section>

      <section id="register" className="scroll-mt-20 bg-[#0A0F1E] px-4 py-16 text-[#F0EAD8] md:px-12 md:py-20">
        <div className="mx-auto max-w-6xl">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-primary">Free registration</span>
          <h2 className="mt-2 text-4xl font-black uppercase tracking-tight text-white md:text-6xl">
            {state === "waitlist" ? "Join the waitlist" : "Secure your seat"}
          </h2>
          <p className="mt-3 max-w-2xl text-[#F0EAD8]/70">
            Register once for yourself and the students you are bringing. We email you a ticket with a QR code for the door.
          </p>
          <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0">
              {state === "open" || state === "waitlist" ? (
                <AttendForm waitlist={state === "waitlist"} />
              ) : (
                <div className="rounded-md bg-[#141B2E] p-6">
                  <p className="text-lg font-bold text-white">{state === "over" ? "The Grand Finale has ended" : "Registration opens soon"}</p>
                  <p className="mt-2 text-sm text-[#F0EAD8]/70">
                    {state === "over" ? "Thank you to everyone who came. See you at the next edition." : "Check back shortly. Schools registered for ASC this year accept in their school portal instead."}
                  </p>
                </div>
              )}
            </div>
            {left != null && capacity ? (
              <aside className="rounded-md bg-[#141B2E] p-6">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#F0EAD8]/55">Seats left</p>
                <p className="mt-1.5 text-5xl font-black leading-none text-white tabular-nums">
                  {left.toLocaleString("en-NG")} <small className="text-xl font-bold text-[#F0EAD8]/50">/ {capacity.toLocaleString("en-NG")}</small>
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <i className="block h-full bg-primary" style={{ width: `${Math.min(100, (taken / capacity) * 100)}%` }} />
                </div>
                <p className="mt-3 text-sm text-[#F0EAD8]/60">
                  {left === 0 ? "The hall is full. New registrations join the waitlist." : "Groups are confirmed while the whole group fits."}
                </p>
              </aside>
            ) : null}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-12 md:py-20">
        <div className="mx-auto max-w-6xl">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-gold-ink">FAQ</span>
          <h2 className="mt-2 text-4xl font-black uppercase tracking-tight md:text-6xl">Good to know</h2>
          <div className="mt-8 max-w-3xl border-t-2 border-foreground">
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0} className="group border-b border-foreground/10 py-4">
                <summary className="flex cursor-pointer list-none justify-between gap-4 text-[17px] font-bold">
                  {f.q}
                  <span className="text-2xl leading-none text-gold-ink group-open:rotate-45 motion-safe:transition-transform">+</span>
                </summary>
                <p className="mt-2 max-w-2xl text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
