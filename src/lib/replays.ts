import { youTubeEmbedUrl } from "@/lib/youtube";

export interface Chapter {
  slug: string;
  title: string;
  note?: string;
  /** Seconds into the recording. */
  start: number;
  /** Seconds in, where the player should stop: for a segment of someone else's broadcast. */
  end?: number;
  /** What the page opens on. */
  featured?: boolean;
  /** The edition stage this is the way into, as the edition names it. */
  stage?: string;
  /** False when no frame of this moment was saved. */
  ownThumb?: boolean;
  /** Set when this moment is a different video from the rest of its group: press clips. */
  videoId?: string;
  /** The same piece published somewhere the player cannot embed. */
  alsoOn?: { label: string; href: string };
}

export interface Recording {
  videoId: string;
  title: string;
  day: string;
  chapters: Chapter[];
}

const at = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;

// Newest first, the Grand Finale leading. The contest was streamed as whole days, so a "match" is a place inside a long recording.
// Starts were read off sampled frames and sit a minute or two early on purpose.
// No school is named here: the public repo keeps real names out of source.
export const REPLAYS: Record<number, Recording[]> = {
  2026: [
    {
      videoId: "pz5kPUaF8Oc",
      title: "Grand Finale",
      day: "19 November · Abeokuta",
      chapters: [
        { slug: "finale-quiz", title: "Opening quiz match", start: at(1, 14) },
        { slug: "keynote", title: "Speeches and keynote", start: at(1, 44) },
        { slug: "awards", title: "Student awards", start: at(2, 26) },
        { slug: "pitch-final", title: "Innovation Pitch finals", start: at(2, 46) },
        { slug: "panel", title: "Panel session", start: at(3, 52) },
        { slug: "final", stage: "Finals", title: "The Grand Final", note: "Three rounds for the title.", start: at(4, 34), featured: true },
      ],
    },
    {
      videoId: "r84Dyrz6LPY",
      title: "The Result",
      day: "19 November · Abeokuta",
      chapters: [
        { slug: "prizes", title: "Prize presentations", start: at(0, 1, 30) },
        { slug: "winner", title: "The winner is announced", note: "The trophy and the cheque.", start: at(0, 20, 30) },
      ],
    },
    {
      videoId: "JKWkXH4cR5o",
      title: "In the News",
      day: "Television coverage of the Grand Finale",
      chapters: [
        { slug: "ogtv-news", title: "The Grand Finale on Ogun State Television", note: "The report from the 8PM News.", start: at(0, 7, 35), end: at(0, 11, 5), ownThumb: false },
        {
          slug: "nta-news",
          videoId: "X1lCthYrNus",
          title: "The Grand Finale on NTA Abeokuta",
          note: "The report from NTA Abeokuta, Channel 12.",
          start: 0,
          ownThumb: false,
          alsoOn: { label: "Watch on Facebook", href: "https://www.facebook.com/share/v/1534QLEambi/" },
        },
      ],
    },
    {
      videoId: "z6GE3PvmMAE",
      title: "Quarter Finals",
      day: "Camp · day 3",
      chapters: [
        { slug: "qf-1", stage: "Quarter Finals", title: "Quarter Final 1", note: "The stream opens during round one.", start: 0 },
        { slug: "qf-2", title: "Quarter Final 2", start: at(0, 48) },
        { slug: "pitch-1", title: "Innovation Pitch, first session", start: at(1, 32) },
        { slug: "qf-3", title: "Quarter Final 3", start: at(2, 8) },
        { slug: "qf-4", title: "Quarter Final 4", start: at(2, 50) },
        { slug: "pitch-2", title: "Innovation Pitch, second session", start: at(3, 26) },
        { slug: "semi-draw", title: "The semi-final draw", start: at(4, 26) },
      ],
    },
    {
      videoId: "M9zSP1t6bOQ",
      title: "Group Stage",
      day: "Camp · day 2",
      chapters: [
        { slug: "group-paper", stage: "Grand Finale Group Stage", title: "The theory paper", start: at(0, 4) },
        { slug: "group-results", title: "Group Stage results", note: "Group by group.", start: at(1, 16) },
        { slug: "revival", title: "The Revival Round", start: at(1, 40) },
        { slug: "round-of-24", stage: "Round of 16", title: "Knockout Round of 24", note: "Six heats.", start: at(3, 16) },
      ],
    },
  ],
};

export const videoOf = (recording: Recording, chapter: Chapter) => chapter.videoId ?? recording.videoId;

/** A frame from the moment itself, saved under public/assets/replays; else the recording's poster. */
export const chapterThumb = (recording: Recording, chapter: Chapter) =>
  chapter.ownThumb === false ? replayPoster(videoOf(recording, chapter)) : `/assets/replays/${chapter.slug}.jpg`;

export interface Film {
  videoId: string;
  title: string;
  year: number;
}

export const FILMS: Film[] = [
  { videoId: "lDXCsquXLoY", title: "The 2025 champions documentary", year: 2025 },
  { videoId: "RNzHfGS-OCM", title: "The ASC impact story: conveners' interview", year: 2025 },
  { videoId: "a4g9A7pH0UU", title: "ASC 2025 in ninety seconds", year: 2025 },
  { videoId: "-RMv6dck88I", title: "The 2023 conference film", year: 2023 },
  { videoId: "fNQRUXhvPpw", title: "STEM Contest 2023: zonal finals", year: 2023 },
  { videoId: "OoxfTx710VQ", title: "The 2022 conference film", year: 2022 },
];

export const replayYears = () =>
  Object.keys(REPLAYS)
    .map(Number)
    .sort((a, b) => b - a);

export function findChapter(recordings: readonly Recording[], slug: string | undefined) {
  for (const recording of recordings) {
    const chapter = recording.chapters.find((c) => c.slug === slug);
    if (chapter) return { recording, chapter };
  }
  return null;
}

/** Where to start watching an edition's stage, if any of it was recorded. */
export function replayHref(year: number, stage: string): string | null {
  for (const recording of REPLAYS[year] ?? []) {
    const chapter = recording.chapters.find((c) => c.stage === stage);
    if (chapter) return `/watch?year=${year}&play=${chapter.slug}`;
  }
  return null;
}

/** Narrows the list to one recording and/or the moments matching every word typed. Recordings left empty drop out. */
export function filterMoments(recordings: readonly Recording[], videoId: string | null, query: string): Recording[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return recordings
    .filter((r) => !videoId || r.videoId === videoId)
    .map((r) => ({
      ...r,
      chapters: r.chapters.filter((c) => {
        const text = `${c.title} ${c.note ?? ""}`.toLowerCase();
        return words.every((w) => text.includes(w));
      }),
    }))
    .filter((r) => r.chapters.length);
}

/** The moment to open on: the featured one, else the first. */
export function openingChapter(recordings: readonly Recording[]) {
  for (const recording of recordings) {
    const chapter = recording.chapters.find((c) => c.featured);
    if (chapter) return { recording, chapter };
  }
  const recording = recordings[0];
  return recording?.chapters[0] ? { recording, chapter: recording.chapters[0] } : null;
}

/** 4:34:00, or 20:30 under an hour. */
export function formatStart(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export const replayEmbedUrl = (videoId: string, start = 0, end?: number) =>
  `${youTubeEmbedUrl(videoId)}?autoplay=1&rel=0${start ? `&start=${start}` : ""}${end ? `&end=${end}` : ""}`;

export const replayWatchUrl = (videoId: string, start = 0) =>
  `https://www.youtube.com/watch?v=${videoId}${start ? `&t=${start}s` : ""}`;

export const replayPoster = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
