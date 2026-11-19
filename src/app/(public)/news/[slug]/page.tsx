import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/layout/page-header";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { NEWS_POSTS, findNewsPost } from "@/lib/static-news";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return NEWS_POSTS.filter((post) => post.body).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Params) {
  const post = findNewsPost((await params).slug);
  return post ? pageMetadata(post.title, post.excerpt) : pageMetadata("News", "Adewale Students Conference news");
}

const link = "font-bold underline underline-offset-4 hover:text-gold-ink";

export default async function NewsArticlePage({ params }: Params) {
  const post = findNewsPost((await params).slug);
  if (!post?.body) notFound();

  return (
    <>
      <PageHeader kicker={formatDate(post.publishedAt) || "News"} title={post.title} subtitle={post.excerpt} />
      <section className="px-6 md:px-12 py-12 md:py-16">
        <div className="max-w-3xl mx-auto">
          {post.image ? (
            <div className="relative mb-10 aspect-video bg-[#0A0F1E]">
              <Image src={post.image} alt="" fill priority className="object-cover" sizes="(max-width: 896px) 100vw, 896px" />
            </div>
          ) : null}

          <div className="serif-display space-y-5 text-lg leading-relaxed text-foreground">
            {post.body.map((para) => (
              <p key={para}>{para}</p>
            ))}
          </div>

          <Link href="/watch" className="group mt-12 flex items-center gap-5 bg-[#0A0F1E] p-5 md:p-6">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary transition-transform group-hover:scale-110">
              <svg viewBox="0 0 14 14" className="ml-0.5 size-5" aria-hidden="true">
                <path d="M3 1l10 6-10 6z" fill="#0A0F1E" />
              </svg>
            </span>
            <span>
              <span className="block text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Watch it back</span>
              <span className="block font-bebas text-2xl leading-tight text-white md:text-3xl">
                The Grand Final and every stage before it
              </span>
            </span>
          </Link>

          <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/news" className={link}>Back to News</Link>
            <Link href="/results" className={link}>Hall of Fame</Link>
          </p>

          {post.tags?.length ? (
            <ul className="mt-10 flex list-none flex-wrap gap-2 border-t border-[rgba(10,15,30,0.12)] pt-8">
              {post.tags.map((tag) => (
                <li key={tag} className="border border-[rgba(10,15,30,0.2)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </>
  );
}
