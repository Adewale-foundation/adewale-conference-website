import SocialIcon from "@/components/ui/social-icon";
import { SOCIAL_LINKS, type SocialName } from "@/lib/site";

const WHY: Record<SocialName, string> = {
  YouTube: "The Grand Finale streams, camp days and champions films.",
  Instagram: "Photos and moments from camp, the finale and the schools.",
};

export default function FollowSection() {
  return (
    <section id="follow" className="bg-white px-6 py-14 md:px-12 md:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 md:mb-10">
          <div className="mb-6 flex items-center gap-3">
            <span className="block h-px w-6 bg-[#E8A020]" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold-ink">Stay close</span>
          </div>
          <h2 className="font-bebas text-5xl leading-[0.95] text-foreground md:text-6xl">Follow the conference.</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {SOCIAL_LINKS.map((s) => (
            <a
              key={s.name}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-5 bg-[#FAF7F0] p-6 transition-colors hover:bg-[#0A0F1E] md:p-8"
            >
              <span className="flex size-14 shrink-0 items-center justify-center bg-primary text-primary-foreground">
                <SocialIcon name={s.name} className="size-7" />
              </span>
              <span className="min-w-0">
                <span className="block font-bebas text-3xl leading-none text-foreground transition-colors group-hover:text-white">
                  {s.name}
                </span>
                <span className="mt-1 block text-sm font-bold text-gold-ink transition-colors group-hover:text-primary">{s.handle}</span>
                <span className="mt-2 block text-sm leading-relaxed text-muted-foreground transition-colors group-hover:text-white/75">
                  {WHY[s.name]}
                </span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
