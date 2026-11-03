import {
  FlaskConical,
  Lightbulb,
  Mic,
  Trophy,
  GraduationCap,
  Landmark,
} from "lucide-react";

const programmeCards = [
  {
    num: "01",
    Icon: FlaskConical,
    title: "The Adewale STEM Contest",
    desc: "An inter-school science and technology competition open to SS2 students across Ogun State. Schools compete through qualifying zones before the top teams advance to the Grand Finale. Past topics have ranged from renewable energy to agricultural technology challenging students to apply curriculum knowledge to real-world problems.",
  },
  {
    num: "02",
    Icon: Lightbulb,
    title: "Innovation Pitch Stage",
    desc: "Student teams identify a problem in their community and pitch a solution in front of a live panel of judges drawn from business, technology, and public service. This is where future entrepreneurs are born. Winners receive scholarship support and mentorship connections. The pitches get sharper every year.",
  },
  {
    num: "03",
    Icon: Mic,
    title: "Keynote & Panel Sessions",
    desc: "Nigeria's leading voices on education, innovation, and youth development address the conference. Past panels have brought together technologists, educators, entrepreneurs, and policymakers. For many students in Remo, this is their first direct encounter with people who look like them and have built extraordinary things.",
  },
  {
    num: "04",
    Icon: Trophy,
    title: "The Grand Finale",
    desc: "A landmark convergence, this year on 19 November at the June 12 Cultural Centre, Abeokuta. 300 selected students and teachers gather for the main event, joined by 700 additional participants on the final day. This is where Ogun State's student community experiences what ambition feels like together, at scale, on a proper stage.",
  },
  {
    num: "05",
    Icon: GraduationCap,
    title: "Scholarship Awards",
    desc: "Over ₦25 million has been distributed in scholarship support across five editions. Winners are selected on merit, with special consideration for students from underserved communities within the Remo axis. Every scholarship is a commitment not just a cheque.",
  },
  {
    num: "06",
    Icon: Landmark,
    title: "Year 6: The Institution",
    desc: "In 2026, ASC takes its most significant step transitioning from a founder-led initiative into a formally governed programme under the Ogun Economic & Innovation Council. This edition marks the beginning of a structure that will outlast any individual and serve Ogun State students for the decade ahead.",
  },
];

export default function ProgrammeSection() {
  return (
    <section id="programme" className="bg-[#FAF7F0] pt-14 md:pt-16 md:py-28 px-6 md:px-12">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 mb-14 md:mb-16">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span className="block w-6 h-px bg-[#E8A020]" />
              <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary">
                What We Do
              </span>
            </div>
            <h2 className="font-bebas text-5xl md:text-6xl lg:text-7xl leading-[0.95] text-foreground">
              <span className="block">Four Pillars.</span>
              <span className="block">One Platform.</span>
            </h2>
          </div>
          <div className="md:pt-16 lg:pt-20">
            <p className="text-sm md:text-base leading-relaxed text-[#3C4150] max-w-md">
              ASC is not a single event it is a structured annual journey that takes students from their classrooms in Ogun State all the way to a national-standard innovation stage.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0.5 bg-[#0A0F1E] border-[#0A0F1E]">
          {programmeCards.map(({ num, Icon, title, desc }) => (
            <div
              key={num}
              className="group relative bg-white p-10 transition-all duration-300 hover:bg-[#0A0F1E] overflow-hidden min-h-80"
            >
              <div className="absolute top-8 right-10 font-bebas text-5xl text-[#F0EAD8] transition-opacity group-hover:opacity-10">
                {num}
              </div>

              <div className="w-12 h-12 bg-[#E8A020] flex items-center justify-center mb-8">
                <Icon className="w-6 h-6 text-foreground" />
              </div>

              <div className="relative z-10">
                <h3 className="font-bebas text-2xl text-foreground mb-4 group-hover:text-white transition-colors tracking-wide">
                  {title}
                </h3>
                <p className="text-sm md:text-base text-[#555870] leading-relaxed group-hover:text-white/80 transition-colors">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
