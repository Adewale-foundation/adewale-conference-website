import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { NewsPost } from "@/lib/static-news";

/** `featured` is the wide card that leads the news page. */
export default function NewsCard({ post, featured = false }: { post: NewsPost; featured?: boolean }) {
  const meta = [featured ? "Latest" : null, formatDate(post.publishedAt)].filter(Boolean).join(" · ");
  return (
    <Link href={`/news/${post.slug}`} className={`group flex bg-white ${featured ? "flex-col md:flex-row" : "h-full flex-col"}`}>
      {post.image ? (
        <div className={`relative overflow-hidden bg-[#0A0F1E] ${featured ? "aspect-[16/10] md:aspect-auto md:min-h-96 md:flex-[3]" : "aspect-[16/10]"}`}>
          <Image
            src={post.image}
            alt=""
            fill
            priority={featured}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes={featured ? "(max-width: 768px) 100vw, 60vw" : "(max-width: 768px) 100vw, 33vw"}
          />
        </div>
      ) : null}
      <div className={featured ? "flex flex-col justify-center gap-3 p-7 md:flex-[2] md:p-10" : "flex flex-col gap-2 p-6"}>
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-ink">{meta}</div>
        <h2 className={`font-bebas leading-none text-foreground ${featured ? "text-4xl md:text-5xl" : "text-3xl"}`}>{post.title}</h2>
        <p className={`leading-relaxed text-muted-foreground ${featured ? "text-base" : "line-clamp-3 text-sm"}`}>{post.excerpt}</p>
        <span className="mt-1 text-sm font-bold text-foreground underline underline-offset-4 group-hover:text-gold-ink">
          Read the story
        </span>
      </div>
    </Link>
  );
}
