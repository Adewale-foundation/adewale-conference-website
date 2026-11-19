# Public Content Lives in Code, Not a CMS

News posts, the past-editions archive and the gallery are typed lists in `src/lib/` (`static-news.ts`, `editions-archive.ts`, `gallery.ts`). Sanity, its Studio at `/studio` and the live-preview connection are removed. This supersedes the Sanity half of ADR 0005; resources had already left for S3 (ADR 0006) and results for the portal (ADR 0012).

## Considered options

- **Content in code (chosen).** Production Sanity held two news posts, one edition and no gallery photos, while every public page paid for the client, the Studio bundle and a live connection. A post is now a pull request, which is acceptable at a handful of posts a year and removes a second place to sign in, a second set of environments and a token.
- **Keep Sanity.** Lets a non-developer publish without a deploy. Rejected for now: nobody was using it, and the pages that matter most (results, resources, the champions) already read the portal.
- **Move news into the portal database.** The right home if posts become frequent or need non-developer authors: a `news_posts` table and an admin module, like Announcements. Deferred until that need is real.

## Notes

- **Titles in `static-news.ts` name no school.** A story that needs the champion reads it from the portal at render time (`news/asc-2026-champions`), so real names stay out of a public repo.
- **`/editions/:year` redirects to `/results?year=`.** The edition page's stats and sponsors existed only in Sanity and are gone; the Hall of Fame is the per-year page.
- **The Sanity projects themselves are untouched.** Deleting them, and the `NEXT_PUBLIC_SANITY_*` and `SANITY_PROD_AUTH_TOKEN` variables in `.env` files and on the host, is the owner's to do.
