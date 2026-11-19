interface PageHeaderProps {
  kicker?: string;
  title: string;
  subtitle?: string;
}

/** Brand-styled hero for inner platform pages (navy band, gold kicker). */
export default function PageHeader({ kicker, title, subtitle }: PageHeaderProps) {
  return (
    <header className="bg-[#0A0F1E] px-6 md:px-12 py-12 md:py-16">
      <div className="max-w-7xl mx-auto">
        {kicker ? (
          <span className="block mb-4 text-xs font-bold tracking-[0.3em] uppercase text-primary">
            {kicker}
          </span>
        ) : null}
        <h1 className="hero-in font-bebas text-5xl md:text-7xl lg:text-8xl leading-[0.92] text-white text-balance max-w-5xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="serif-display text-base md:text-lg italic text-[rgba(250,247,240,0.7)] max-w-2xl mt-5 leading-relaxed">
            {subtitle}
          </p>
        ) : null}
      </div>
    </header>
  );
}
