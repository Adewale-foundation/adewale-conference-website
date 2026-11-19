import Link from "next/link";

const whyCards = [
  {
    icon: "📍",
    title: "Unmatched Grassroots Reach",
    desc: "5,000+ students reached across Sagamu, Ikenne, and Remo North over five years. No other programme in Ogun State offers this depth of community penetration with this level of credibility and consistency.",
  },
  {
    icon: "🏛️",
    title: "Institutional Credibility",
    desc: "ASC is now anchored under the Ogun Economic & Innovation Council a formally registered policy and development body. Your partnership is not a donation; it is an institutional investment with governance backing.",
  },
  {
    icon: "📸",
    title: "Premium Brand Visibility",
    desc: "Your brand is placed in front of 1,000+ students, teachers, parents, and community leaders at the Grand Finale alone plus months of school-level engagement during the zonal stage.",
  },
  {
    icon: "📊",
    title: "Measurable CSR Impact",
    desc: "We provide sponsors with a full impact report after every edition attendance figures, scholarship recipients, school participation, media coverage, and community reach data.",
  },
  {
    icon: "🤝",
    title: "Talent Pipeline Access",
    desc: "The brightest SS2 students in Ogun State compete at ASC. Sponsors at the Gold tier and above receive early access to top performers a pipeline of future engineers and innovators.",
  },
  {
    icon: "🌍",
    title: "Legacy, Not Just a Logo",
    desc: "As ASC institutionalises, founding sponsors become part of the programme's permanent story. Year 6 partners will be recognised in perpetuity as the organisations that helped ASC become an institution.",
  },
];

/** `limit` is the home page's teaser; /sponsors shows every reason. */
export default function WhyPartnerSection({ limit }: { limit?: number } = {}) {
  return (
    <section id="why" className="bg-white py-14 md:py-16 px-6 md:px-12">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 md:mb-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="block w-6 h-px bg-[#E8A020]" />
            <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary">
              Why It Matters
            </span>
          </div>
          <h2 className="font-bebas text-5xl md:text-6xl lg:text-7xl leading-[0.95] text-foreground">
            Why Partner With ASC?
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10 mt-16">
          {whyCards.slice(0, limit).map((card, idx) => (
            <div
              key={idx}
              className="border-t-4 border-[#E8A020] pt-7 space-y-4"
            >
              <div className="text-3xl md:text-4xl">{card.icon}</div>
              <h3 className="serif-display text-lg md:text-xl text-foreground">
                {card.title}
              </h3>
              <p className="text-sm md:text-base text-[#555870] leading-relaxed">
                {card.desc}
              </p>
            </div>
          ))}
        </div>

        {limit ? (
          <Link
            href="/sponsors"
            className="mt-12 inline-flex min-h-12 items-center bg-[#0A0F1E] px-6 text-xs font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-secondary"
          >
            See sponsorship packages
          </Link>
        ) : null}
      </div>
    </section>
  );
}
