import Image from "next/image";
import { GALLERY_PHOTOS } from "@/lib/gallery";

export default function GalleryGrid() {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {GALLERY_PHOTOS.map((photo) => (
        <figure key={photo.src} className="group relative aspect-square overflow-hidden bg-[#0A0F1E]">
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, 33vw"
          />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0A0F1E]/90 to-transparent p-4 text-xs text-[#F0EAD8] opacity-0 transition-opacity group-hover:opacity-100">
            {photo.alt}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
