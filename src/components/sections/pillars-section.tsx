import Link from "next/link";
import { pillars } from "./about-section";

/** The programme in four lines, for the home page; /about carries it in full. */
export default function PillarsSection() {
  return (
    <section id="programme" className="bg-[#FAF7F0] px-6 py-14 md:px-12 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6 md:mb-12">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <span className="block h-px w-6 bg-[#E8A020]" />
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold-ink">The programme</span>
            </div>
            <h2 className="font-bebas text-5xl leading-[0.95] text-foreground md:text-6xl lg:text-7xl">
              Four pillars. One platform.
            </h2>
          </div>
          <Link href="/about#programme" className="text-base font-bold text-foreground underline underline-offset-4 hover:text-gold-ink">
            How the programme works
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ icon: Icon, title, desc }, i) => (
            <div key={title} className="flex flex-col gap-3 bg-white p-7">
              <div className="flex items-center justify-between">
                <span className="font-bebas text-4xl leading-none text-gold-ink">0{i + 1}</span>
                <Icon className="size-6 text-gold-ink" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-foreground">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground md:text-base">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
