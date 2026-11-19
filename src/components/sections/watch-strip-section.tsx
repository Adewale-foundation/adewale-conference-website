import Link from "next/link";
import { REPLAYS, chapterThumb, formatStart, openingChapter, type Chapter, type Recording } from "@/lib/replays";

type Pick = { recording: Recording; chapter: Chapter };

function Card({ year, pick, large = false }: { year: number; pick: Pick; large?: boolean }) {
  return (
    <Link href={`/watch?year=${year}&play=${pick.chapter.slug}`} className="group flex h-full flex-col bg-white">
      <span className={`relative block overflow-hidden bg-[#0A0F1E] ${large ? "aspect-video" : "aspect-[16/8]"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small stills, lazy-loaded */}
        <img
          src={chapterThumb(pick.recording, pick.chapter)}
          alt=""
          loading="lazy"
          className="size-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105"
        />
        <span className={`absolute left-4 top-4 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${large ? "bg-primary text-primary-foreground" : "bg-[#0A0F1E] text-white"}`}>
          {pick.recording.title}
        </span>
        <span className="absolute bottom-4 right-4 bg-[#0A0F1E] px-2 py-1 text-xs font-semibold tabular-nums text-white">
          from {formatStart(pick.chapter.start)}
        </span>
        <span className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary transition-transform group-hover:scale-110 ${large ? "size-20" : "size-12"}`}>
          <svg viewBox="0 0 14 14" className={large ? "ml-1 size-7" : "ml-0.5 size-4"} aria-hidden="true">
            <path d="M3 1l10 6-10 6z" fill="#0A0F1E" />
          </svg>
        </span>
      </span>
      <span className={large ? "block px-6 py-5" : "block px-5 py-4"}>
        <span className={`block text-foreground ${large ? "font-bebas text-3xl leading-none md:text-4xl" : "text-base font-bold leading-snug"}`}>
          {pick.chapter.title}
        </span>
        {large && pick.chapter.note ? (
          <span className="mt-1.5 block text-sm text-muted-foreground">{pick.chapter.note}</span>
        ) : null}
      </span>
    </Link>
  );
}

/** The home page's way into the recordings: the featured moment, then two earlier stages. */
export default function WatchStripSection({ year }: { year: number }) {
  const recordings = REPLAYS[year] ?? [];
  const lead = openingChapter(recordings);
  if (!lead) return null;
  // The other contest stages, not the ceremony or the press clip.
  const others = recordings
    .filter((r) => r.videoId !== lead.recording.videoId)
    .flatMap((recording) => recording.chapters.filter((c) => c.stage).slice(0, 1).map((chapter) => ({ recording, chapter })))
    .slice(0, 2);

  return (
    <section id="watch" className="bg-[#FAF7F0] px-6 py-14 md:px-12 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <span className="block h-px w-6 bg-[#E8A020]" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold-ink">Watch it back</span>
            </div>
            <h2 className="font-bebas text-5xl leading-[0.95] text-foreground md:text-6xl lg:text-7xl">Every stage. Every moment.</h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              The whole contest was streamed. Relive it from the Group Stage to the Final, and jump straight to the moment you
              came for.
            </p>
          </div>
          <Link
            href={`/watch?year=${year}`}
            className="inline-flex min-h-12 items-center bg-[#0A0F1E] px-6 text-xs font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-secondary"
          >
            Open the replay library
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card year={year} pick={lead} large />
          </div>
          {others.length ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-1">
              {others.map((pick) => (
                <Card key={pick.chapter.slug} year={year} pick={pick} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
