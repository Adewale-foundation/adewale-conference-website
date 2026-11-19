import HeroSection from "@/components/sections/hero-section";
import ChampionsHero from "@/components/sections/champions-hero";
import WatchStripSection from "@/components/sections/watch-strip-section";
import ThanksSection from "@/components/sections/thanks-section";
import RoadSection from "@/components/sections/road-section";
import PillarsSection from "@/components/sections/pillars-section";
import NumbersBand from "@/components/sections/numbers-band";
import WhyPartnerSection from "@/components/sections/why-partner-section";
import FollowSection from "@/components/sections/follow-section";
import NextEditionSection from "@/components/sections/next-edition-section";
import FinaleNotice from "@/components/sections/finale-notice";
import ScrollReveals from "@/components/ui/scroll-reveals";
import { getRegistrationOpen } from "@/lib/edition-state";
import { FINALE_YEAR, finaleDb } from "@/lib/finale-data";
import { loadFinalResult } from "@/lib/finale-podium-data";
import { loadRoad } from "@/lib/road-to-title-data";

// Regenerated every 60s so admin opening/closing registration (Portal →
// Editions) reflects here within a minute while the page stays CDN-static.
export const revalidate = 60;

/** A failed read costs the champions sections, never the page. */
async function loadChampions() {
  const db = finaleDb();
  if (!db) return null;
  const [final, road] = await Promise.all([loadFinalResult(db, FINALE_YEAR), loadRoad(db, FINALE_YEAR)]);
  if (final.error) console.error("home: could not read the final placing", final.error);
  if (road.error) console.error("home: could not read the road to the title", road.error);
  return final.result
    ? { champion: final.result.champion.school, runnerUp: final.result.runnerUp?.school ?? null, road: road.road }
    : null;
}

// Chrome (nav + footer) is provided by the (public) group layout.
export default async function HomePage() {
  const [{ open }, champions] = await Promise.all([getRegistrationOpen(), loadChampions()]);
  return (
    <>
      {champions ? (
        <ChampionsHero year={FINALE_YEAR} champion={champions.champion} runnerUp={champions.runnerUp} />
      ) : (
        <>
          <FinaleNotice />
          <HeroSection />
        </>
      )}
      <ScrollReveals>
        <WatchStripSection year={FINALE_YEAR} />
        {champions?.road ? <RoadSection year={FINALE_YEAR} road={champions.road} champion={champions.champion} /> : null}
        <PillarsSection />
        <NumbersBand />
        {champions ? <ThanksSection /> : null}
        <WhyPartnerSection limit={3} />
        <FollowSection />
        <NextEditionSection registrationOpen={open} />
      </ScrollReveals>
    </>
  );
}
