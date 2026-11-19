import Link from "next/link";
import Celebration from "@/components/finale/celebration";
import InstallAppButton from "@/components/pwa/install-app-button";
import { GRAND_FINALE } from "@/lib/finale-attend";
import { REPLAYS } from "@/lib/replays";
import HeroBackdrop from "./hero-backdrop";
import { THEME_LINES } from "./hero-section";

const cta =
  "inline-flex min-h-12 items-center justify-center px-6 text-xs font-bold uppercase tracking-[0.2em] transition-colors";

/** The home page's hero once the Grand Finale has a champion. */
export default function ChampionsHero({
  year,
  champion,
  runnerUp,
}: {
  year: number;
  champion: string;
  runnerUp: string | null;
}) {
  const watchHref = REPLAYS[year]?.length ? `/watch?year=${year}` : null;
  const photoHref = watchHref ?? `/results?year=${year}`;

  return (
    <section id="home" className="bg-[#0A0F1E] px-6 py-12 md:px-12 md:py-20">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="@container flex min-w-0 flex-col gap-6">
          <p className="hero-in self-start border border-primary bg-[rgba(232,160,32,0.08)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-primary md:text-xs">
            Grand Finale · {GRAND_FINALE.shortDate} · {GRAND_FINALE.venueArea}
          </p>
          <Celebration once={`asc-champions-${year}`} className="flex flex-col gap-3">
            <p className="hero-in text-sm font-bold uppercase tracking-[0.3em] text-[#F0EAD8]" style={{ "--i": 1 } as React.CSSProperties}>
              <span className="podium-icon mr-2" data-place="1" aria-hidden="true">🏆</span>
              ASC {year} Champions
            </p>
            {/* Sized off the column, not the screen, so the longest word of a school name always fits. */}
            <h1 className="hero-line font-bebas text-[clamp(2.5rem,15cqw,6rem)] leading-[0.92] text-primary text-balance break-words">
              <span style={{ "--i": 2 } as React.CSSProperties}>
                <span className="champion-shine [--shine-base:#E8A020]">{champion}</span>
              </span>
            </h1>
          </Celebration>
          <p className="hero-in serif-display max-w-md text-base italic leading-relaxed text-[rgba(250,247,240,0.78)] md:text-xl" style={{ "--i": 4 } as React.CSSProperties}>
            Thank you to every school, student, teacher and supporter who took part in year six.
          </p>
          <div className="hero-in flex flex-col gap-3 sm:flex-row" style={{ "--i": 5 } as React.CSSProperties}>
            {watchHref ? (
              <Link href={watchHref} className={`${cta} gap-3 bg-primary text-primary-foreground hover:bg-[#F5C55A]`}>
                <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden="true">
                  <path d="M3 1l10 6-10 6z" fill="currentColor" />
                </svg>
                Watch the final
              </Link>
            ) : null}
            <Link
              href={`/results?year=${year}`}
              className={`${cta} ${watchHref ? "border border-[#F0EAD8] text-[#F0EAD8] hover:border-primary hover:text-primary" : "bg-primary text-primary-foreground hover:bg-[#F5C55A]"}`}
            >
              See full results
            </Link>
            <InstallAppButton />
          </div>
          <p className="hero-in text-[11px] font-bold uppercase tracking-[0.3em] text-[rgba(250,247,240,0.55)]" style={{ "--i": 6 } as React.CSSProperties}>
            {THEME_LINES.join(" ")}
          </p>
        </div>

        <div className="hero-in flex flex-col gap-0.5" style={{ "--i": 3 } as React.CSSProperties}>
          <Link
            href={photoHref}
            aria-label={watchHref ? "Watch the final" : "See full results"}
            className="group relative isolate block aspect-video overflow-hidden bg-secondary"
          >
            <HeroBackdrop src="/assets/gallery6.jpg" />
            <span className="absolute inset-0 -z-10 bg-[#0A0F1E]/35" aria-hidden="true" />
            {watchHref ? (
              <>
                <span className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary transition-transform group-hover:scale-110">
                  <svg viewBox="0 0 14 14" className="ml-1 size-7" aria-hidden="true">
                    <path d="M3 1l10 6-10 6z" fill="#0A0F1E" />
                  </svg>
                </span>
                <span className="absolute bottom-4 left-5 text-[11px] font-bold uppercase tracking-[0.2em] text-white">
                  The Final · full replay
                </span>
              </>
            ) : null}
          </Link>
          <div className={`grid gap-0.5 ${runnerUp ? "grid-cols-2" : "grid-cols-1"}`}>
            <div className="border-t-4 border-primary bg-secondary p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">Champion</p>
              <p className="mt-1.5 font-bebas text-2xl leading-none text-white md:text-3xl">{champion}</p>
            </div>
            {runnerUp ? (
              <div className="border-t-4 border-[#C4C9D4] bg-secondary p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#C4C9D4]">Runner-up</p>
                <p className="mt-1.5 font-bebas text-2xl leading-none text-white md:text-3xl">{runnerUp}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
