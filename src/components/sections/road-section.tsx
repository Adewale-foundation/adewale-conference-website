import Link from "next/link";
import CountUp from "@/components/ui/count-up";
import type { Road } from "@/lib/road-to-title-data";

const BLURBS: Record<string, string> = {
  Qualifications: "Schools sat the qualifying paper across Ogun State.",
  "Grand Finale Group Stage": "Qualified schools met at the Grand Finale camp.",
  "Round of 16": "The knockouts began.",
  "Quarter Finals": "Eight schools left standing.",
  "Semi Finals": "Two matches for a place in the final.",
  Finals: "One match for the title.",
};

/** The edition as a funnel: how many schools were still in at each stage, ending on the champion. */
export default function RoadSection({ year, road, champion }: { year: number; road: Road; champion: string }) {
  const start = road.registered || road.steps[0]?.schools;
  return (
    <section id="road" className="bg-[#0A0F1E] px-6 py-14 md:px-12 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 md:mb-12">
          <div className="mb-6 flex items-center gap-3">
            <span className="block h-px w-6 bg-[#E8A020]" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-primary">The road to the title</span>
          </div>
          <h2 className="font-bebas text-5xl leading-[0.95] text-white md:text-6xl lg:text-7xl">
            {start ? <>From <CountUp text={String(start)} /> schools to one.</> : "From a whole state to one."}
          </h2>
        </div>

        <div className="flex flex-wrap gap-0.5">
          {road.steps.map((step) => (
            <div key={step.stage} className="flex flex-1 basis-40 flex-col gap-2 bg-secondary p-5 md:p-6">
              <div className="font-bebas text-4xl leading-none text-primary md:text-5xl">
                <CountUp text={String(step.schools)} />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white">{step.stage}</div>
              {BLURBS[step.stage] ? (
                <p className="text-[13px] leading-relaxed text-[rgba(250,247,240,0.72)]">{BLURBS[step.stage]}</p>
              ) : null}
            </div>
          ))}
          <div className="flex flex-1 basis-40 flex-col gap-2 bg-primary p-5 text-primary-foreground md:p-6">
            <div className="font-bebas text-4xl leading-none md:text-5xl">1</div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em]">Champion</div>
            <p className="text-[13px] font-medium leading-relaxed">{champion}</p>
          </div>
        </div>

        <Link
          href={`/results?year=${year}`}
          className="mt-10 inline-flex min-h-12 items-center border border-[#F0EAD8] px-6 text-xs font-bold uppercase tracking-[0.2em] text-[#F0EAD8] transition-colors hover:border-primary hover:text-primary"
        >
          Open the Hall of Fame
        </Link>
      </div>
    </section>
  );
}
