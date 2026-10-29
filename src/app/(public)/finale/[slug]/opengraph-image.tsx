import { SHARE_CARD_SIZE, shareCard, supportersLabel } from "@/components/finale/share-card";
import { TEAM_COLORS } from "@/lib/finale";
import { FINALE_YEAR, finaleDb, loadFinale } from "@/lib/finale-data";

export const revalidate = 300;
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";
export const alt = "Back a school at the ASC Grand Finale";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = finaleDb();
  const finale = db ? await loadFinale(db, FINALE_YEAR) : null;
  if (finale?.error) console.error("finale: team share card could not load", finale.error);
  const team = finale?.teams.find((t) => t.slug === slug);

  if (!team) {
    return shareCard({
      eyebrow: `ASC ${FINALE_YEAR} · Grand Finale fan vote`,
      headline: "Who takes the crown?",
      footer: "Pick your team · Predict the champion · Win prizes",
    });
  }
  return shareCard({
    eyebrow: `ASC ${FINALE_YEAR} · Semi-final ${team.semi}`,
    kicker: "Back",
    headline: team.name,
    accent: TEAM_COLORS[team.color],
    footer: "Join free · Predict the champion · Win prizes",
    stat: team.supporters ? supportersLabel(team.supporters) : undefined,
  });
}
