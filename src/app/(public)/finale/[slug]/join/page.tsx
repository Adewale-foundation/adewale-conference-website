import { notFound } from "next/navigation";
import JoinForm from "@/components/finale/join-form";
import { NotReady, Shell, Title, TopBar, teamStyle } from "@/components/finale/ui";
import { FINALE_BASE, possessive, votingState } from "@/lib/finale";
import { FINALE_YEAR, finaleDb, loadFinale } from "@/lib/finale-data";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata("Join the fan vote", "Back your team and predict the ASC Grand Finale.");

export default async function FinaleJoin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = finaleDb();
  if (!db) return <NotReady title="The fan vote opens soon" detail="Check back closer to the Grand Finale." />;
  const { settings, teams, error } = await loadFinale(db, FINALE_YEAR);
  if (error) {
    console.error("finale: join could not load", error);
    return <NotReady title="Something went wrong" detail="Please try again in a moment." />;
  }
  const team = teams.find((t) => t.slug === slug);
  if (!team) notFound();
  if (votingState(settings) !== "open") {
    return <NotReady title="Joining has closed" detail="Results appear on the fan vote page as the games finish." />;
  }

  const total = teams.reduce((s, t) => s + t.supporters, 0);
  return (
    <Shell style={teamStyle(team.color)}>
      <TopBar back={`${FINALE_BASE}/${team.slug}`} />
      <Title>Join {possessive(team.name)} supporters</Title>
      <JoinForm
        team={{ id: team.id, name: team.name, semi: team.semi }}
        teams={teams.map((t) => ({
          id: t.id,
          name: t.name,
          semi: t.semi,
          color: t.color,
          pickPct: total ? Math.round((t.championPicks / total) * 100) : 0,
        }))}
        rewardText={settings?.reward_text ?? null}
        rewardCount={settings?.reward_count ?? 20}
      />
    </Shell>
  );
}
