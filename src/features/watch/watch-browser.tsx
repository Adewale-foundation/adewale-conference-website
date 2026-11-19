"use client";

import Link from "next/link";
import { useState } from "react";
import { filterMoments, formatStart, type Recording } from "@/lib/replays";

const pill = "inline-flex min-h-10 items-center px-3.5 text-xs font-bold uppercase tracking-[0.12em] transition-colors";

/** The filter and search sit above the player, as on a video site; `children` is the player column. */
export default function WatchBrowser({
  recordings,
  year,
  playing,
  children,
}: {
  recordings: Recording[];
  year: number;
  playing: string;
  children: React.ReactNode;
}) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const shown = filterMoments(recordings, videoId, query);
  const tab = (active: boolean) =>
    `${pill} ${active ? "bg-primary text-primary-foreground" : "border border-white/25 text-[#F0EAD8] hover:border-primary"}`;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by recording">
          <button type="button" onClick={() => setVideoId(null)} aria-pressed={videoId === null} className={tab(videoId === null)}>
            All
          </button>
          {recordings.map((r) => (
            <button
              key={r.videoId}
              type="button"
              onClick={() => setVideoId(r.videoId)}
              aria-pressed={videoId === r.videoId}
              className={tab(videoId === r.videoId)}
            >
              {r.title}
              <span className="ml-2 opacity-60">{r.chapters.length}</span>
            </button>
          ))}
        </div>
        <label className="w-full max-w-56">
          <span className="sr-only">Search the moments</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search moments"
            className="min-h-10 w-full border border-white/20 bg-white/5 px-3.5 text-sm text-white placeholder:text-white/45 outline-none focus:border-primary"
          />
        </label>
      </div>

      <div className="mt-6 gap-8 lg:grid lg:grid-cols-3">
        <div className="max-lg:contents lg:col-span-2">{children}</div>

        <nav aria-label="Moments" className="mt-8 lg:mt-0 lg:max-h-[38rem] lg:overflow-y-auto lg:pr-2">
          {shown.length === 0 ? (
            <p className="py-6 text-sm text-[rgba(250,247,240,0.7)]">Nothing matches that. Try a stage, like &ldquo;quarter&rdquo; or &ldquo;final&rdquo;.</p>
          ) : null}
          {shown.map((recording) => (
            <div key={recording.videoId} className="mb-6 last:mb-0">
              <h3 className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 border-b border-primary/40 pb-2">
                <span className="font-bebas text-2xl leading-none text-white">{recording.title}</span>
                <span className="text-xs text-[rgba(250,247,240,0.55)]">{recording.day}</span>
              </h3>
              <ul className="flex flex-col gap-0.5">
                {recording.chapters.map((chapter) => {
                  const active = playing === chapter.slug;
                  return (
                    <li key={chapter.slug}>
                      <Link
                        href={`/watch?year=${year}&play=${chapter.slug}`}
                        scroll={false}
                        aria-current={active ? "true" : undefined}
                        className={`flex min-h-12 items-center gap-3 px-3 py-2 transition-colors ${
                          active ? "bg-primary text-primary-foreground" : "bg-secondary text-white hover:bg-[#2A3558]"
                        }`}
                      >
                        <span className="w-16 shrink-0 font-bebas text-xl leading-none tabular-nums opacity-75">{formatStart(chapter.start)}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold leading-snug">{chapter.title}</span>
                          {chapter.note ? <span className="block text-xs opacity-75">{chapter.note}</span> : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </>
  );
}
