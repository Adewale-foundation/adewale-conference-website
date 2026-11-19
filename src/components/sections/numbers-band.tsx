import CountUp from "@/components/ui/count-up";
import { stats } from "./hero-section";

export default function NumbersBand() {
  return (
    <section aria-label="ASC in numbers" className="bg-primary px-6 py-12 text-primary-foreground md:px-12 md:py-16">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="font-bebas text-5xl leading-none md:text-7xl">
              <CountUp text={s.num} />
            </div>
            <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] md:text-xs">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
