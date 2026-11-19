import { Trophy, Lightbulb, Mic, PartyPopper } from "lucide-react";

export const pillars = [
  {
    icon: Trophy,
    title: "STEM Contest",
    desc: "Inter-school science and technology competition across Ogun State.",
  },
  {
    icon: Lightbulb,
    title: "Innovation Pitches",
    desc: "Students pitch real solutions to real community challenges.",
  },
  {
    icon: Mic,
    title: "Keynote & Panel",
    desc: "Nigeria's leading voices on education, technology, and the future.",
  },
  {
    icon: PartyPopper,
    title: "Grand Finale",
    desc: "A landmark convergence of Ogun State's brightest students.",
  },
];

export default function AboutSection() {
  return (
    <section id="about" className="bg-[#FAF7F0] py-14 md:py-16 md:py-28 px-6 md:px-12">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 items-start">
        <div className="relative aspect-4/5 md:aspect-auto md:h-full md:min-h-150 overflow-hidden">
          <img
            src="/assets/about-image.jpg"
            alt="ASC Grand Finale group photo"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-[#0A0F1E]/90 via-[#0A0F1E]/40 to-transparent pointer-events-none" />
          <p className="absolute bottom-5 left-5 right-5 md:bottom-6 md:left-6 md:right-6 serif-display italic text-base md:text-lg text-white">
            "Every genius deserves a stage. We built one."
          </p>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <span className="block w-6 h-px bg-[#E8A020]" />
            <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary">
              About ASC
            </span>
          </div>

          <h2 className="font-bebas text-5xl md:text-6xl lg:text-7xl leading-[0.95] text-foreground">
            <span className="block">Five Years.</span>
            <span className="block">One Mission.</span>
          </h2>

          <div className="flex items-center gap-4 mt-8 mb-8">
            <div className="inline-flex items-center bg-[#0A0F1E] px-5 py-2.5">
              <span className="font-bebas text-lg tracking-widest text-primary">
                2021 &mdash; 2026
              </span>
            </div>
            <div className="flex-1 h-px bg-[#0A0F1E]/15" />
          </div>

          <div className="space-y-5 text-sm md:text-base leading-relaxed text-[#3C4150] max-w-prose">
            <p>
              The Adewale Students Conference began in 2021 with a single conviction: that the brightest minds in Ogun State deserved more than a classroom ceiling. Five editions later, we have become the state's most consistent youth innovation platform reaching over 5,000 students, distributing &#8358;25 million in scholarship support, and hosting a grand finale that brings together 1,000 students, teachers, and community leaders.
            </p>
            <p>
              In 2026, we enter a new chapter. ASC is transitioning from a passion-driven initiative into a formally institutionalised programme under the Ogun Economic & Innovation Council building the governance, partnerships, and systems that will carry this work forward for the next decade.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-10">
            {pillars.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-white border-l-2 border-[#E8A020] p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">{title}</h3>
                </div>
                <p className="text-xs leading-relaxed text-[#555870]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
