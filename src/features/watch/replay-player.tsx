"use client";

import { useState } from "react";
import { replayEmbedUrl, replayPoster } from "@/lib/replays";

/** A poster and a play button until tapped: the YouTube player is a megabyte we don't load on spec. */
export default function ReplayPlayer({
  videoId,
  start,
  end,
  title,
  poster,
}: {
  videoId: string;
  start: number;
  end?: number;
  title: string;
  poster?: string;
}) {
  // One tap is enough: picking another moment afterwards plays it straight away.
  const [started, setStarted] = useState(false);

  return (
    <div className="relative aspect-video overflow-hidden bg-[#0A0F1E]">
        {started ? (
          <iframe
          key={`${videoId}:${start}`}
            src={replayEmbedUrl(videoId, start, end)}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        ) : (
          <button type="button" onClick={() => setStarted(true)} className="group absolute inset-0 size-full" aria-label={`Play ${title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail, already small */}
            <img src={poster ?? replayPoster(videoId)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-60" />
            <span className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary transition-transform group-hover:scale-110 md:size-24">
              <svg viewBox="0 0 14 14" className="ml-1 size-7 md:size-8" aria-hidden="true">
                <path d="M3 1l10 6-10 6z" fill="#0A0F1E" />
              </svg>
            </span>
          </button>
      )}
    </div>
  );
}
