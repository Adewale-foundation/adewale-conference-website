import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Dock, Eyebrow, NotReady, Panel, Shell, Title, TopBar, ctaClass, teamStyle } from "@/components/finale/ui";
import { FINALE_BASE, naira, votingState } from "@/lib/finale";
import { FINALE_YEAR, finaleDb, loadCheers, loadFinale } from "@/lib/finale-data";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 30;

async function load(slug: string) {
  const db = finaleDb();
  if (!db) return null;
  const finale = await loadFinale(db, FINALE_YEAR);
  if (finale.error) {
    console.error("finale: team page could not load", finale.error);
    return null;
  }
  return { db, ...finale, team: finale.teams.find((t) => t.slug === slug) ?? null };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  return data?.team
    ? pageMetadata(`Support ${data.team.name}`, `Back ${data.team.name} at the ASC Grand Finale and predict the champion.`, `${FINALE_BASE}/${slug}`)
    : pageMetadata("Grand Finale fan vote", "Pick your team for the ASC Grand Finale.", FINALE_BASE);
}

export default async function FinaleTeam({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return <NotReady title="The fan vote opens soon" detail="Check back closer to the Grand Finale." />;
  const { db, settings, teams, team } = data;
  if (!team) notFound();

  const { cheers, error } = await loadCheers(db, team.id);
  if (error) console.error("finale: cheers could not load", error);
  const total = teams.reduce((s, t) => s + t.supporters, 0);
  const pickPct = total ? Math.round((team.championPicks / total) * 100) : 0;
  const open = votingState(settings) === "open";

  return (
    <Shell style={teamStyle(team.color)}>
      <div className="-mx-4 grid gap-1.5 bg-[color-mix(in_srgb,var(--team)_12%,var(--color-background))] px-4 pb-5 md:mx-0 md:rounded-2xl md:px-6 md:pb-6">
        <TopBar back={FINALE_BASE} />
        <Eyebrow className="text-(--team)">{[team.label, `Semi-final ${team.semi}`].filter(Boolean).join(" · ")}</Eyebrow>
        <Title>{team.name}</Title>
        {team.schoolName && team.schoolName !== team.name ? <p className="text-sm text-muted-foreground">{team.schoolName}</p> : null}
      </div>

      <div className={`mt-4 grid gap-3 ${team.pledged ? "grid-cols-3" : "grid-cols-2"}`}>
        <Panel>
          <Eyebrow>Supporters</Eyebrow>
          <b className="block text-xl tabular-nums">{team.supporters.toLocaleString("en-NG")}</b>
        </Panel>
        <Panel>
          <Eyebrow>Picked to win</Eyebrow>
          <b className="block text-xl tabular-nums">{pickPct}%</b>
        </Panel>
        {team.pledged ? (
          <Panel>
            <Eyebrow>Pledged</Eyebrow>
            <b className="block text-xl tabular-nums">{naira(team.pledged)}</b>
          </Panel>
        ) : null}
      </div>

      <div className="mt-5 grid gap-2">
        <Eyebrow>Cheers from supporters</Eyebrow>
        {cheers.length ? (
          cheers.map((c, i) => (
            <Panel key={i} className="py-3">
              <div className="text-[13px] font-bold">{c.name ?? "Anonymous supporter"}</div>
              <p className="text-sm">{c.cheer}</p>
            </Panel>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No cheers yet. Be the first.</p>
        )}
      </div>

      <Dock>
        {open ? (
          <>
            <Link href={`${FINALE_BASE}/${team.slug}/join`} className={`${ctaClass} bg-(--team) text-white`}>
              Support {team.name}
            </Link>
            <p className="mt-2 text-center text-xs text-muted-foreground">Free. Takes ten seconds.</p>
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Joining has closed for this finale.</p>
        )}
      </Dock>
    </Shell>
  );
}
