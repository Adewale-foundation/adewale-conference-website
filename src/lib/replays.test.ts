import { test } from "node:test";
import assert from "node:assert/strict";
import { FILMS, REPLAYS, videoOf, filterMoments, findChapter, formatStart, openingChapter, replayEmbedUrl, replayHref, replayWatchUrl } from "./replays";

test("formats a start the way YouTube shows it", () => {
  assert.equal(formatStart(0), "0:00");
  assert.equal(formatStart(1230), "20:30");
  assert.equal(formatStart(16440), "4:34:00");
  assert.equal(formatStart(3605), "1:00:05");
});

test("a start of zero adds no parameter", () => {
  assert.equal(replayWatchUrl("abcdefghijk"), "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(replayWatchUrl("abcdefghijk", 90), "https://www.youtube.com/watch?v=abcdefghijk&t=90s");
  assert.match(replayEmbedUrl("abcdefghijk", 90), /embed\/abcdefghijk\?autoplay=1&rel=0&start=90$/);
  assert.doesNotMatch(replayEmbedUrl("abcdefghijk"), /start=/);
});

test("finds a chapter in whichever recording holds it", () => {
  const found = findChapter(REPLAYS[2026], "winner");
  assert.equal(found?.recording.videoId, "r84Dyrz6LPY");
  assert.equal(findChapter(REPLAYS[2026], "nope"), null);
  assert.equal(findChapter(REPLAYS[2026], undefined), null);
});

test("every slug is unique within an edition, and every id is a YouTube id", () => {
  for (const recordings of Object.values(REPLAYS)) {
    const slugs = recordings.flatMap((r) => r.chapters.map((c) => c.slug));
    assert.equal(new Set(slugs).size, slugs.length);
    for (const r of recordings) for (const c of r.chapters) assert.match(videoOf(r, c), /^[\w-]{11}$/);
  }
  for (const film of FILMS) assert.match(film.videoId, /^[\w-]{11}$/);
});

test("opens on the featured moment, else the first", () => {
  assert.equal(openingChapter(REPLAYS[2026])?.chapter.slug, "final");
  const plain = [{ videoId: "abcdefghijk", title: "t", day: "d", chapters: [{ slug: "a", title: "A", start: 0 }] }];
  assert.equal(openingChapter(plain)?.chapter.slug, "a");
  assert.equal(openingChapter([]), null);
});

test("moments run in time order within a recording", () => {
  for (const recordings of Object.values(REPLAYS)) {
    for (const r of recordings) {
      // Clips that are their own video have no order among themselves.
      const starts = r.chapters.filter((c) => !c.videoId).map((c) => c.start);
      assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
    }
  }
});

test("links a stage to its recording only where one exists", () => {
  assert.equal(replayHref(2026, "Finals"), "/watch?year=2026&play=final");
  assert.equal(replayHref(2026, "Semi Finals"), null);
  assert.equal(replayHref(2019, "Finals"), null);
});

test("a segment stops where it should", () => {
  assert.match(replayEmbedUrl("abcdefghijk", 455, 665), /start=455&end=665$/);
});

test("filters moments by recording and by every word typed", () => {
  const all = REPLAYS[2026];
  assert.equal(filterMoments(all, null, "").length, all.length);
  assert.deepEqual(filterMoments(all, "z6GE3PvmMAE", "").map((r) => r.videoId), ["z6GE3PvmMAE"]);
  const quarters = filterMoments(all, null, "QUARTER final");
  assert.deepEqual(quarters.flatMap((r) => r.chapters.map((c) => c.slug)), ["qf-1", "qf-2", "qf-3", "qf-4"]);
  assert.deepEqual(filterMoments(all, null, "pitch").map((r) => r.chapters.length), [1, 2]);
  assert.deepEqual(filterMoments(all, null, "no such thing"), []);
});

test("every moment that claims its own thumbnail has the file", async () => {
  const { existsSync } = await import("node:fs");
  for (const r of REPLAYS[2026]) {
    for (const c of r.chapters) {
      if (c.ownThumb !== false) assert.ok(existsSync(`public/assets/replays/${c.slug}.jpg`), c.slug);
    }
  }
});

test("a press clip plays its own video, not its group's", () => {
  const nta = findChapter(REPLAYS[2026], "nta-news")!;
  const ogtv = findChapter(REPLAYS[2026], "ogtv-news")!;
  assert.equal(nta.recording.videoId, ogtv.recording.videoId);
  assert.equal(videoOf(nta.recording, nta.chapter), "X1lCthYrNus");
  assert.equal(videoOf(ogtv.recording, ogtv.chapter), ogtv.recording.videoId);
});
