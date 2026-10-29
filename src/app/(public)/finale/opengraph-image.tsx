import { SHARE_CARD_SIZE, shareCard, supportersLabel } from "@/components/finale/share-card";
import { FINALE_YEAR, finaleDb, loadFinale } from "@/lib/finale-data";

export const revalidate = 300;
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";
export const alt = "ASC Grand Finale fan vote: who takes the crown?";

export default async function Image() {
  const db = finaleDb();
  const finale = db ? await loadFinale(db, FINALE_YEAR) : null;
  if (finale?.error) console.error("finale: share card could not load", finale.error);
  const teams = finale?.teams ?? [];
  const supporters = teams.reduce((s, t) => s + t.supporters, 0);
  const champion = teams.find((t) => t.id === finale?.settings?.champion_team_id);

  return shareCard({
    eyebrow: `ASC ${FINALE_YEAR} · Grand Finale fan vote`,
    headline: champion ? `${champion.name}: champions` : "Who takes the crown?",
    footer: champion ? "See who called it" : "Pick your team · Predict the champion · Win prizes",
    stat: supporters ? supportersLabel(supporters) : "Free to join",
  });
}
