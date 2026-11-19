import PageHeader from "@/components/layout/page-header";
import EditionCard from "@/features/editions/edition-card";
import { EDITIONS } from "@/lib/editions-archive";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Past Editions",
  "Every edition of the Adewale Students Conference, year by year.",
);

export default function EditionsPage() {
  return (
    <>
      <PageHeader kicker="Archive" title="Past Editions" subtitle="Every edition of the Conference, year by year." />
      <section className="px-6 md:px-12 py-16 md:py-20">
        <div className="max-w-7xl mx-auto grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[...EDITIONS].reverse().map((edition) => (
            <EditionCard key={edition.year} edition={edition} />
          ))}
        </div>
      </section>
    </>
  );
}
