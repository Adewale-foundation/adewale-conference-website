import PageHeader from "@/components/layout/page-header";
import GalleryGrid from "@/features/gallery/gallery-grid";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Gallery",
  "Photos and highlights from past editions of the Adewale Students Conference.",
);

export default function GalleryPage() {
  return (
    <>
      <PageHeader kicker="Media" title="Gallery" subtitle="Photos and highlights from past editions." />
      <section className="px-6 md:px-12 py-16 md:py-20">
        <div className="max-w-7xl mx-auto">
          <GalleryGrid />
        </div>
      </section>
    </>
  );
}
