import { Button } from "../../components/ui/button";
import { Star } from "lucide-react";
import InstallAppButton from "@/components/pwa/install-app-button";

const stats = [
  { num: "5,000+", label: "Students Reached Directly" },
  { num: "₦25M+", label: "Scholarship Support Paid" },
  { num: "5", label: "Consecutive Editions" },
  { num: "1,000+", label: "Grand Finale Attendees" },
];

const tickerItems = [
  "SPONSORSHIP PACKAGES NOW AVAILABLE",
  "₦25M+ in Scholarships Awarded",
  "Registration Opens May 1st",
  "Zonal Stage: June-July 2026",
  "Grand Finale: 19 November 2026, Abeokuta",
  "Open to All Secondary Schools in Ogun State"
];

export default function HeroSection() {
  return (
    <section
      id="home"
      className="relative bg-[#0A0F1E] min-h-screen flex flex-col overflow-hidden pt-4 md:pt-16"
    >
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2">
        <div className="flex flex-col justify-center px-6 sm:px-10 md:px-12 lg:px-16 py-12 md:py-16 relative z-10">
          <div className="inline-flex items-center gap-2 self-start border border-[#E8A020] bg-[rgba(232,160,32,0.08)] px-4 py-2 mb-10">
            <Star className="w-3 h-3 fill-[#E8A020] text-primary" />
            <span className="text-[10px] md:text-xs font-bold tracking-[0.25em] uppercase text-primary">
              Year Six · Ogun State · 2026
            </span>
          </div>

          <h1 className="font-bebas text-5xl sm:text-6xl md:text-6xl lg:text-7xl leading-[0.95] text-white">
            <span className="block">Building</span>
            <span className="block text-primary">Tomorrow's</span>
            <span className="block mt-4 md:mt-5">Geniuses</span>
            <span className="block">Today.</span>
          </h1>

          <p className="serif-display text-base md:text-lg text-[rgba(250,247,240,0.7)] italic leading-relaxed max-w-md mt-8 mb-10">
            Ogun State's most ambitious student innovation platform now entering its sixth year as a permanent institution.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-10">
            <Button
              variant="default"
              className="rounded-none h-12 px-6 text-xs font-bold tracking-[0.2em] uppercase"
              asChild
            >
              <a href="#partner">Become a Partner</a>
            </Button>
            <Button
              variant="outline"
              className="rounded-none h-12 px-6 text-xs font-bold tracking-[0.2em] uppercase !border-[#F0EAD8] text-[#F0EAD8] hover:border-[#E8A020] hover:text-primary"
              asChild
            >
              <a href="#register">Register Your School</a>
            </Button>
            {/* Shows only on install-capable browsers (hidden once installed). */}
            <InstallAppButton />
          </div>

          <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 self-start border border-[rgba(232,160,32,0.35)] px-3 py-2.5 text-[8px] md:text-[10px] tracking-[0.2em]">
            <span className="text-[rgba(250,247,240,0.55)]">An Initiative of <span className="text-primary font-bold"> The Adewale Foundation</span></span>

          </div>
        </div>

        <div className="relative min-h-105 md:min-h-full">
          <img
            src="/assets/hero-image.jpg"
            alt="ASC speaker on stage"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-[#0A0F1E]/85 via-[#0A0F1E]/30 to-transparent pointer-events-none" />

          <div className="absolute bottom-6 left-6 right-6 md:bottom-12 md:right-10 md:left-auto md:max-w-md grid grid-cols-2 gap-px bg-[rgba(232,160,32,0.2)]">
            {stats.map((s) => (
              <div key={s.label} className="bg-[#0A0F1E]/95 backdrop-blur-sm p-5 md:p-6">
                <div className="font-bebas text-3xl md:text-4xl text-primary leading-none mb-2">
                  {s.num}
                </div>
                <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-[rgba(250,247,240,0.55)] leading-snug">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#E8A020] overflow-hidden border-t border-b border-[#0A0F1E]/15">
        <div className="flex animate-marquee whitespace-nowrap py-3.5">
          {[0, 1].map((loop) => (
            <ul
              key={loop}
              aria-hidden={loop === 1}
              className="flex items-center shrink-0"
            >
              {tickerItems.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-6 px-6 text-[11px] md:text-xs font-bold tracking-[0.25em] uppercase text-foreground"
                >
                  <span>{item}</span>
                  <Star className="w-3 h-3 fill-[#0A0F1E] text-foreground" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
