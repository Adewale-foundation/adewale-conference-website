import CountUp from "@/components/ui/count-up";

const stats = [
  { num: "5,000+", label: "Students Reached Directly" },
  { num: "₦25M+", label: "Scholarship Support Awarded" },
  { num: "1,000", label: "Grand Finale Participants" },
  { num: "19 LGAs", label: "Ogun Communities Served" },
];

const photos = [
  {
    src: "/assets/impact-image1.jpg",
    caption: "Hundreds of young minds. One room. Infinite potential.",
  },
  {
    src: "/assets/impact-image2.jpg",
    caption: "Michael Adesanya at ASC 2024.",
  },
];

const timeline = [
  {
    year: "2021",
    edition: "Edition I",
    desc: "First edition launches in Sagamu. The Adewale STEM Contest is born.",
  },
  {
    year: "2022",
    edition: "Edition II",
    desc: "Expanded across Ogun State. Innovation pitch category introduced.",
  },
  {
    year: "2023",
    edition: "Edition III",
    desc: "Grand Finale camping format debuts. 300 students, 700 day-visitors.",
  },
  {
    year: "2024",
    edition: "Edition IV",
    desc: "Cumulative scholarship support crosses ₦25 million. 5,000 students reached.",
  },
  {
    year: "2025",
    edition: "Edition V",
    desc: "Fifth consecutive edition. Programme announces institutionalisation under OEIC.",
  },
];

const gallery = [
  { src: "/assets/gallery1.jpg", alt: "Scholarship winner with award certificate" },
  { src: "/assets/gallery2.jpg", alt: "Grand prize cheque presentation" },
  { src: "/assets/gallery3.jpg", alt: "Students at the registration desk" },
  { src: "/assets/gallery4.jpg", alt: "Keynote session on stage" },
  { src: "/assets/gallery5.jpg", alt: "Adewale Students Conference venue" },
  { src: "/assets/gallery6.jpg", alt: "Audience at the Grand Finale" },
  { src: "/assets/gallery7.jpg", alt: "Students celebrating at the Grand Finale" },
  { src: "/assets/gallery8.jpg", alt: "Innovation pitch in progress" },
  { src: "/assets/gallery9.JPG", alt: "Award ceremony moment" },
  { src: "/assets/gallery10.JPG", alt: "Group photo with finalists" },
  { src: "/assets/gallery11.JPG", alt: "Students engaged in the STEM contest" },
  { src: "/assets/gallery12.JPG", alt: "Teacher and students at registration" },
  { src: "/assets/gallery13.JPG", alt: "Adewale Students Conference highlights" },
  { src: "/assets/gallery14.jpg", alt: "Community gathered at the Grand Finale" },
];

export default function ImpactSection() {
  return (
    <section id="impact" className="bg-[#0A0F1E] pt-14 md:pt-16 md:pt-28">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 mb-14 md:mb-16">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span className="block w-6 h-px bg-[#E8A020]" />
              <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary">
                By The Numbers
              </span>
            </div>
            <h2 className="font-bebas text-5xl md:text-6xl lg:text-7xl leading-[0.95] text-white">
              <span className="block">Five Years.</span>
              <span className="block">Undeniable</span>
              <span className="block">Impact.</span>
            </h2>
          </div>
          <div className="md:pt-20 lg:pt-24">
            <p className="text-base md:text-lg leading-relaxed text-[rgba(250,247,240,0.7)] max-w-md">
              From a single community event to a statewide institution every number here represents a student who was seen, challenged, and invested in. This is what five years of unwavering commitment looks like.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0.5 mb-14 md:mb-16">
          {stats.map((s) => (
            <div
              key={s.label}
              tabIndex={0}
              className="bg-secondary p-7 md:p-8 border-t-2 border-transparent outline-none transition-colors duration-200 hover:bg-[#222B4A] hover:border-[#E8A020] focus:bg-[#222B4A] focus:border-[#E8A020]"
            >
              <div className="font-bebas text-5xl md:text-6xl text-primary leading-none mb-4">
                <CountUp text={s.num} />
              </div>
              <div className="text-[11px] md:text-xs font-bold tracking-[0.2em] uppercase text-[rgba(250,247,240,0.55)] leading-snug">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mb-14 md:mb-16">
          {photos.map((p) => (
            <figure
              key={p.caption}
              className="relative aspect-video overflow-hidden"
            >
              <img
                src={p.src}
                alt={p.caption}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-[#0A0F1E]/90 to-transparent pointer-events-none" />
              <figcaption className="absolute bottom-4 left-5 right-5 md:bottom-5 md:left-6 md:right-6 serif-display italic text-sm md:text-base text-white">
                {p.caption}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px mb-14 md:mb-16">
          {timeline.map((t) => (
            <div key={t.year} className="bg-[#1C2540] p-5 md:p-6">
              <div className="font-bebas text-2xl md:text-3xl text-primary leading-none mb-2">
                {t.year}
              </div>
              <div className="text-[8px] font-bold tracking-[0.25em] uppercase text-[rgba(250,247,240,0.5)] mb-4">
                {t.edition}
              </div>
              <p className="text-xs md:text-xs leading-relaxed text-[rgba(250,247,240,0.7)]">
                {t.desc}
              </p>
            </div>
          ))}
        </div>

      </div>

      <div className="group relative overflow-hidden">
        <div className="flex w-max animate-marquee [animation-duration:30s] group-hover:[animation-play-state:paused]">
          {[0, 1].map((loop) => (
            <ul
              key={loop}
              aria-hidden={loop === 1}
              className="flex shrink-0 list-none p-0 m-0"
            >
              {gallery.map((g, idx) => (
                <li
                  key={`${loop}-${idx}`}
                  className="relative shrink-0 w-[70vw] sm:w-[45vw] md:w-[32vw] lg:w-[22vw] aspect-square overflow-hidden"
                >
                  <img
                    src={g.src}
                    alt={g.alt}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 sm:w-16 md:w-24 bg-linear-to-r from-[#0A0F1E] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 sm:w-16 md:w-24 bg-linear-to-l from-[#0A0F1E] to-transparent" />
      </div>
    </section>
  );
}
