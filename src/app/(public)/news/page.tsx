import PageHeader from "@/components/layout/page-header";
import NewsCard from "@/features/news/news-card";
import { pageMetadata } from "@/lib/seo";
import { NEWS_POSTS } from "@/lib/static-news";

export const metadata = pageMetadata(
  "News & Announcements",
  "The latest updates, stories, and announcements from the Adewale Students Conference.",
);

export default function NewsPage() {
  const [latest, ...rest] = NEWS_POSTS;
  return (
    <>
      <PageHeader kicker="Updates" title="News & Announcements" subtitle="The latest from the Adewale Students Conference." />
      <section className="px-6 md:px-12 py-16 md:py-20">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <NewsCard post={latest} featured />
          {rest.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <NewsCard key={post.slug} post={post} />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
