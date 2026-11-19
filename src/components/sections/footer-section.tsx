import SocialIcon from "@/components/ui/social-icon";
import { SOCIAL_LINKS } from "@/lib/site";

export default function FooterSection() {
  return (
    <footer className="bg-[#0A0F1E] text-[rgba(250,247,240,0.7)] py-12 md:py-16 px-6 md:px-12">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 md:gap-8 mb-12 pb-12 border-b border-[rgba(232,160,32,0.2)]">
          <div className="col-span-2 md:col-span-1">
            <div className="font-bebas text-2xl text-white tracking-widest mb-4">
              ASC <span className="text-primary">2026</span>
            </div>
            <p className="text-sm leading-relaxed text-[rgba(250,247,240,0.5)]">
              Ogun State's most ambitious student innovation platform. Building tomorrow's geniuses one edition at a time.
            </p>
            <ul className="mt-6 flex gap-3">
              {SOCIAL_LINKS.map((s) => (
                <li key={s.name}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`ASC on ${s.name}`}
                    className="flex size-11 items-center justify-center border border-[rgba(232,160,32,0.35)] text-[#F0EAD8] transition-colors hover:border-primary hover:text-primary"
                  >
                    <SocialIcon name={s.name} className="size-5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-white mb-6 text-sm tracking-widest uppercase">
              Navigate
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="/about"
                  className="hover:text-primary transition-colors duration-200"
                >
                  About ASC
                </a>
              </li>
              <li>
                <a
                  href="/about#impact"
                  className="hover:text-primary transition-colors duration-200"
                >
                  Our Impact
                </a>
              </li>
              <li>
                <a
                  href="/about#programme"
                  className="hover:text-primary transition-colors duration-200"
                >
                  Programme
                </a>
              </li>
              <li>
                <a
                  href="/about#founder"
                  className="hover:text-primary transition-colors duration-200"
                >
                  The Founder
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-white mb-6 text-sm tracking-widest uppercase">
              Participate
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="/#register"
                  className="hover:text-primary transition-colors duration-200"
                >
                  School Registration
                </a>
              </li>
              <li>
                <a
                  href="/sponsors"
                  className="hover:text-primary transition-colors duration-200"
                >
                  Partner With Us
                </a>
              </li>
              <li>
                <a
                  href="/faq"
                  className="hover:text-primary transition-colors duration-200"
                >
                  FAQs
                </a>
              </li>
              <li>
                <a
                  href="mailto:hello@asc2026.ng"
                  className="hover:text-primary transition-colors duration-200"
                >
                  Contact Us
                </a>
              </li>
            </ul>
          </div>

          <div className="col-span-2 md:col-span-1">
            <h3 className="font-medium text-white mb-6 text-sm tracking-widest uppercase">
              Contact
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="mailto:adewaleconference@gmail.com"
                  className="hover:text-primary transition-colors duration-200"
                >
                  adewaleconference@gmail.com
                </a>
              </li>
              {/* <li>
                <a
                  href="mailto:partnerships@asc2026.ng"
                  className="hover:text-primary transition-colors duration-200"
                >
                  partnerships@asc2026.ng
                </a>
              </li> */}
              <li>
                <a
                  href="tel:+2348121026489"
                  className="hover:text-primary transition-colors duration-200"
                >
                  +234 812 102 6489
                </a>
              </li>
              <li>Sagamu, Ogun State, Nigeria</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-[rgba(250,247,240,0.4)]">
          <div>© 2026 Adewale Students Conference. All rights reserved.</div>
          <div>An Initiative of The Adewale Foundation</div>
        </div>
      </div>
    </footer>
  );
}
