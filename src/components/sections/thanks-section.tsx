import Link from "next/link";

const thanks = [
  {
    title: "Schools and teachers",
    desc: "Every teacher and principal who registered a team, prepared them and travelled with them.",
  },
  {
    title: "Volunteers and Fellows",
    desc: "The people who ran the centres, marked the papers and kept the finale on time.",
  },
  {
    title: "Sponsors and supporters",
    desc: "The partners who funded it and everyone who backed a school in the fan vote.",
  },
];

export default function ThanksSection() {
  return (
    <section id="thanks" className="bg-[#FAF7F0] px-6 py-14 md:px-12 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 md:mb-12">
          <div className="mb-6 flex items-center gap-3">
            <span className="block h-px w-6 bg-[#E8A020]" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold-ink">Thank you</span>
          </div>
          <h2 className="max-w-3xl font-bebas text-5xl leading-[0.95] text-foreground md:text-6xl lg:text-7xl">
            It took a whole state to do this.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {thanks.map((t) => (
            <div key={t.title} className="bg-white p-8">
              <h3 className="mb-3 font-bebas text-3xl text-foreground">{t.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground md:text-base">{t.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-base font-bold">
          <Link href="/news/asc-2026-champions" className="text-foreground underline underline-offset-4 hover:text-gold-ink">
            Read the story of the day in News
          </Link>
          <Link href="/watch?play=ogtv-news" className="text-foreground underline underline-offset-4 hover:text-gold-ink">
            As seen on Ogun State Television
          </Link>
          <Link href="/watch?play=nta-news" className="text-foreground underline underline-offset-4 hover:text-gold-ink">
            As seen on NTA Abeokuta
          </Link>
        </p>
      </div>
    </section>
  );
}
