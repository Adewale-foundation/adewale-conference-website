export interface NewsPost {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  image?: string;
  tags?: string[];
  /** Paragraphs. A post without a body has a page of its own under app/(public)/news/. */
  body?: string[];
}

// Newest first. Titles here name no school: a page that needs one reads it from the portal,
// so real names stay out of source.
export const NEWS_POSTS: NewsPost[] = [
  {
    slug: "asc-2026-champions",
    title: "ASC 2026 has its champions",
    excerpt:
      "The sixth Adewale Students Conference closed in Abeokuta. Thank you to every school, student and supporter who took part.",
    publishedAt: "2026-11-19",
    image: "/assets/gallery6.jpg",
  },
  {
    slug: "registration-open-2026",
    title: "Registration Now Open for 2026",
    excerpt: "Schools across Ogun State can now register for the 2026 edition of the Adewale Students Conference.",
    publishedAt: "2026-06-01",
    tags: ["announcement", "registration"],
    body: [
      "We are thrilled to announce that registration for the 2026 edition is now open. Schools can register up to three student representatives through our online form.",
    ],
  },
  {
    slug: "2025-grand-finale-recap",
    title: "2025 Grand Finale Recap",
    excerpt: "A look back at a record-breaking 2025 edition and its standout moments.",
    publishedAt: "2025-10-20",
    tags: ["recap", "edition"],
    body: [
      "The 2025 grand finale in Abeokuta was the most competitive yet, with 640 students and a thrilling final round.",
    ],
  },
];

export const findNewsPost = (slug: string) => NEWS_POSTS.find((post) => post.slug === slug) ?? null;
