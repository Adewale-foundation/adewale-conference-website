import PageHeader from "@/components/layout/page-header";
import AboutSection from "@/components/sections/about-section";
import ProgrammeSection from "@/components/sections/programme-section";
import ImpactSection from "@/components/sections/impact-section";
import FounderSection from "@/components/sections/founder-section";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "About",
  "The mission behind the Adewale Students Conference — Ogun State's most ambitious student STEM platform.",
);

export default function AboutPage() {
  return (
    <>
      <PageHeader
        kicker="The Mission"
        title="About ASC"
        subtitle="Ogun State's most ambitious student STEM platform — building tomorrow's geniuses today."
      />
      <AboutSection />
      <ProgrammeSection />
      <ImpactSection />
      <FounderSection />
    </>
  );
}
