import HeroSection from "@/components/sections/hero-section";
import AboutSection from "@/components/sections/about-section";
import ImpactSection from "@/components/sections/impact-section";
import ProgrammeSection from "@/components/sections/programme-section";
import DatesSection from "@/components/sections/dates-section";
import WhyPartnerSection from "@/components/sections/why-partner-section";
import SponsorshipSection from "@/components/sections/sponsorship-section";
import FounderSection from "@/components/sections/founder-section";
import RegistrationSection from "@/components/sections/registration-section";
import FaqSection from "@/components/sections/faq-section";
import FinaleNotice from "@/components/sections/finale-notice";
import { getRegistrationOpen } from "@/lib/edition-state";

// Regenerated every 60s so admin opening/closing registration (Portal →
// Editions) reflects here within a minute while the page stays CDN-static.
export const revalidate = 60;

// Chrome (nav + footer) is provided by the (public) group layout.
export default async function HomePage() {
  const { open } = await getRegistrationOpen();
  return (
    <>
      <FinaleNotice />
      <HeroSection />
      <AboutSection />
      <ImpactSection />
      <ProgrammeSection />
      <DatesSection />
      <WhyPartnerSection />
      <SponsorshipSection />
      <FounderSection />
      <RegistrationSection registrationOpen={open} />
      <FaqSection />
    </>
  );
}
