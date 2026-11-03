const dateSteps = [
  {
    num: "01",
    when: "May 25 - July, 2026",
    title: "School Registration",
    desc: "Schools submit their entries for the STEM Contest and Innovation Pitch. Registration is free. All public and private secondary schools in Ogun State are eligible. Deadline is strict don't wait.",
  },
  {
    num: "02",
    when: "September 2026",
    title: "Zonal & Preliminary Stage",
    desc: "Qualifying competitions are held across zones in Ogun State. Top teams from each zone advance to the Grand Finale. Zonal events are open to parents and community members.",
  },
  {
    num: "03",
    when: "19 November 2026",
    title: "Grand Finale",
    desc: "The main event. 300 selected students and teachers. 700 participants on the final day. Keynote address, STEM finals, Innovation Pitch, panel, and scholarship awards.",
  },
];

export default function DatesSection() {
  return (
    <section id="dates" className="bg-[#0A0F1E] py-14 md:py-16 px-6 md:px-12">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 md:mb-14">
          <div className="text-xs md:text-sm font-bold tracking-widest uppercase mb-4 text-primary">
            2026 Calendar
          </div>
          <h2 className="font-bebas text-3xl md:text-4xl lg:text-5xl leading-tight text-white">
            Mark Your<br />Calendar.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-0 relative">

          <div className="hidden md:block absolute top-7 left-0 right-0 h-0.5 bg-gradient-to-r from-[#E8A020] via-[#F5C55A] to-[#E8A020] opacity-30 z-0"></div>

          {dateSteps.map((step) => (
            <div key={step.num} className="relative z-10 md:pr-12 group">
              <div className="w-14 h-14 rounded-full bg-[#E8A020] text-foreground font-bebas text-xl flex items-center justify-center mb-8 shadow-lg shadow-[rgba(232,160,32,0.2)] group-hover:scale-110 transition-transform duration-300">
                {step.num}
              </div>

              <div className="text-xs font-bold tracking-widest uppercase text-primary mb-3">
                {step.when}
              </div>

              <h3 className="font-bebas text-2xl md:text-2xl text-white mb-4 tracking-wide font-bold">
                {step.title}
              </h3>

              <p className="text-sm md:text-base text-[rgba(250,247,240,0.7)] leading-relaxed max-w-sm">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
