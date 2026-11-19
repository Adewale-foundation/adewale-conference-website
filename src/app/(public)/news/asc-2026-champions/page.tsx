import Image from "next/image";
import Link from "next/link";
import PageHeader from "@/components/layout/page-header";
import ReplayPlayer from "@/features/watch/replay-player";
import { finaleDb } from "@/lib/finale-data";
import { loadFinalResult } from "@/lib/finale-podium-data";
import { formatDate } from "@/lib/format";
import { REPLAYS, findChapter } from "@/lib/replays";
import { pageMetadata } from "@/lib/seo";
import { findNewsPost } from "@/lib/static-news";

const YEAR = 2026;
const post = findNewsPost("asc-2026-champions")!;

export const metadata = pageMetadata(post.title, post.excerpt);
export const revalidate = 300;

const link = "font-bold underline underline-offset-4 hover:text-gold-ink";

export default async function ChampionsStoryPage() {
  const db = finaleDb();
  const final = db ? await loadFinalResult(db, YEAR) : null;
  if (final?.error) console.error("news: could not read the final placing", final.error);
  const champion = final?.result?.champion.school;
  const runnerUp = final?.result?.runnerUp?.school;
  const report = findChapter(REPLAYS[YEAR] ?? [], "ogtv-news");

  return (
    <>
      <PageHeader
        kicker={`Announcement · ${formatDate(post.publishedAt)}`}
        title={champion ? `${champion} are the ASC ${YEAR} champions` : post.title}
        subtitle={post.excerpt}
      />
      <section className="px-6 py-12 md:px-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="relative mb-10 aspect-video bg-[#0A0F1E]">
            <Image src={post.image!} alt="The audience at the Grand Finale" fill priority className="object-cover" sizes="(max-width: 896px) 100vw, 896px" />
          </div>

          <div className="serif-display space-y-5 text-lg leading-relaxed text-foreground">
            <p>
              The sixth Adewale Students Conference closed on 19 November at the June 12 Cultural Centre, Abeokuta, under the
              theme &ldquo;The Gateway Generation: Engineering the Future of Ogun State&rdquo;.{" "}
              {champion
                ? runnerUp
                  ? `${champion} took the title in the Grand Final against ${runnerUp}.`
                  : `${champion} took the title in the Grand Final.`
                : "The Grand Final decided the title on stage."}
            </p>
            <p>
              The day also carried the Innovation Pitch finals, a keynote, a panel session and the prize presentations. Ogun
              State Television covered the finale on its 8PM News that evening.
            </p>
          </div>

          {report ? (
            <figure className="my-10">
              <ReplayPlayer
                videoId={report.recording.videoId}
                start={report.chapter.start}
                end={report.chapter.end}
                title={report.chapter.title}
              />
              <figcaption className="mt-3 text-sm text-muted-foreground">
                The report on Ogun State Television&apos;s 8PM News, 19 November.
              </figcaption>
            </figure>
          ) : null}

          <div className="serif-display space-y-5 text-lg leading-relaxed text-foreground">
            <p>
              Thank you to every school, teacher, volunteer, Fellow and sponsor who made year six possible.
            </p>
            <p>
              <Link href={`/watch?year=${YEAR}`} className={link}>Watch the final and every stage before it</Link>, or see the
              full results in the <Link href={`/results?year=${YEAR}`} className={link}>Hall of Fame</Link>.
            </p>
          </div>

          <p className="mt-10 border-t border-[rgba(10,15,30,0.12)] pt-8 text-sm">
            <Link href="/news" className={link}>Back to News</Link>
          </p>
        </div>
      </section>
    </>
  );
}
