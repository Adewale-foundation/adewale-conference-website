import PageHeader from "@/components/layout/page-header";
import WhyPartnerSection from "@/components/sections/why-partner-section";
import SponsorshipSection from "@/components/sections/sponsorship-section";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Our Sponsors",
  "Partner with the Adewale Students Conference to power STEM opportunity for students.",
);

// There is no sponsor list to show: enquiries go through the form below to the ASC team.
export default function SponsorsPage() {
  return (
    <>
      <PageHeader
        kicker="Partners"
        title="Partner with ASC"
        subtitle="Every edition is made possible by organisations that believe in Ogun State's young innovators."
      />
      <WhyPartnerSection />
      <SponsorshipSection />
    </>
  );
}
