import Link from "next/link";
import ReplayPlayer from "@/features/watch/replay-player";
import WatchBrowser from "@/features/watch/watch-browser";
import {
  FILMS,
  REPLAYS,
  chapterThumb,
  findChapter,
  formatStart,
  openingChapter,
  replayPoster,
  replayWatchUrl,
  replayYears,
  videoOf,
} from "@/lib/replays";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Watch",
  "Relive the Adewale Students Conference: the Grand Final, the quarter finals and the camp, stage by stage.",
);

export default async function WatchPage({ searchParams }: { searchParams: Promise<{ year?: string; play?: string }> }) {
  const params = await searchParams;
  const years = replayYears();
  const year = years.includes(Number(params.year)) ? Number(params.year) : years[0];
  const recordings = REPLAYS[year] ?? [];
  const playing = findChapter(recordings, params.play) ?? openingChapter(recordings);

  return (
    <>
      <section className="bg-[#0A0F1E] px-6 py-8 md:px-12 md:py-10">
        <div className="mx-auto max-w-7xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">Watch it back</p>
          <h1 className="font-bebas text-4xl leading-[0.92] text-white md:text-5xl">ASC {year}, stage by stage</h1>

          {playing ? (
            <WatchBrowser recordings={recordings} year={year} playing={playing.chapter.slug}>
              {/* On a phone the video stays pinned under the navbar while the moments scroll beneath it. */}
              <div className="sticky top-18 z-10 -mx-6 bg-[#0A0F1E] max-lg:shadow-[0_12px_24px_-12px_rgba(0,0,0,0.8)] sm:mx-0 lg:static">
                <ReplayPlayer
                  videoId={videoOf(playing.recording, playing.chapter)}
                  start={playing.chapter.start}
                  end={playing.chapter.end}
                  title={playing.chapter.title}
                  poster={chapterThumb(playing.recording, playing.chapter)}
                />
              </div>
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Now showing</p>
                <h2 className="mt-1 font-bebas text-3xl leading-none text-white md:text-4xl">{playing.chapter.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[rgba(250,247,240,0.72)]">
                  {playing.recording.title} · {playing.recording.day} · starts at {formatStart(playing.chapter.start)}
                </p>
                <p className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold">
                  <a
                    href={replayWatchUrl(videoOf(playing.recording, playing.chapter), playing.chapter.start)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#F0EAD8] underline underline-offset-4 hover:text-primary"
                  >
                    Slow connection? Watch on YouTube
                  </a>
                  {playing.chapter.alsoOn ? (
                    <a
                      href={playing.chapter.alsoOn.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#F0EAD8] underline underline-offset-4 hover:text-primary"
                    >
                      {playing.chapter.alsoOn.label}
                    </a>
                  ) : null}
                  <Link href={`/results?year=${year}`} className="text-primary underline underline-offset-4">
                    Hall of Fame
                  </Link>
                </p>
              </div>
            </WatchBrowser>
          ) : null}
        </div>
      </section>

      <section className="px-6 py-14 md:px-12 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div>
            <div className="mb-5 border-b-2 border-foreground pb-3">
              <h2 className="font-bebas text-4xl leading-none text-foreground md:text-5xl">From earlier editions</h2>
            </div>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FILMS.map((film) => (
                <li key={film.videoId}>
                  <a href={replayWatchUrl(film.videoId)} target="_blank" rel="noopener noreferrer" className="group block bg-white">
                    <span className="block aspect-video overflow-hidden bg-[#0A0F1E]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail */}
                      <img
                        src={replayPoster(film.videoId)}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </span>
                    <span className="block p-5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-ink">{film.year} · YouTube</span>
                      <span className="mt-1 block text-base font-bold leading-snug text-foreground">{film.title}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
