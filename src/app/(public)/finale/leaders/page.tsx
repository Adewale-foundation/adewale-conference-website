import { Eyebrow, NotReady, Panel, Shell, Title, TopBar } from "@/components/finale/ui";
import { FINALE_BASE, TEAM_COLORS, anyResult } from "@/lib/finale";
import { FINALE_YEAR, finaleDb, loadFinale, loadLeaders } from "@/lib/finale-data";
import { currentSupporterId } from "@/lib/finale-session";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata("Grand Finale leaderboard", "The supporters who called the ASC Grand Finale best.", `${FINALE_BASE}/leaders`);

export default async function FinaleLeaders() {
  const db = finaleDb();
  if (!db) return <NotReady title="The fan vote opens soon" detail="Check back closer to the Grand Finale." />;
  const [finale, me] = await Promise.all([loadFinale(db, FINALE_YEAR), currentSupporterId()]);
  if (finale.error || !finale.settings) {
    if (finale.error) console.error("finale: leaders could not load", finale.error);
    return <NotReady title="The fan vote opens soon" detail="Check back closer to the Grand Finale." />;
  }
  const { settings, teams } = finale;
  const top = settings.reward_count;
  const color = new Map(teams.map((t) => [t.id, TEAM_COLORS[t.color]]));

  const scored = anyResult(settings);
  const { leaders, error } = scored ? await loadLeaders(db, FINALE_YEAR, top, me) : { leaders: [], error: null };
  if (error) console.error("finale: leaders rpc", error);
  const mine = leaders.find((l) => l.supporterId === me && l.rank > top);

  return (
    <Shell>
      <div className="grid gap-4">
      <TopBar back={FINALE_BASE} />
      <Eyebrow>Prediction game</Eyebrow>
      <Title>{settings.champion_team_id ? `Top ${top} predictors` : "Leaderboard"}</Title>

      <Panel className="grid gap-1 bg-secondary text-secondary-foreground shadow-none">
        <Eyebrow className="text-primary">Prizes for the top {top}</Eyebrow>
        <p className="text-sm">{settings.reward_text || "Announced before the Grand Finale."}</p>
        <p className="text-xs text-white/70">
          1 point for each semi-final winner, 2 for the champion. On a tie, whoever joined first ranks higher. No cash prizes.
        </p>
      </Panel>

      {!scored ? (
        <p className="text-sm text-muted-foreground">The leaderboard fills in after the first semi-final is played.</p>
      ) : (
        <ol className="grid gap-1.5">
          {leaders
            .filter((l) => l.rank <= top)
            .map((l) => (
              <li
                key={l.rank}
                className={`grid grid-cols-[2.5rem_10px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-sm shadow-[0_0_0_1px_rgba(10,15,30,0.1)] ${l.supporterId === me ? "ring-2 ring-primary" : ""}`}
              >
                <span className="font-bold tabular-nums text-muted-foreground">#{l.rank}</span>
                <span className="size-2.5 rounded-full" style={{ background: color.get(l.teamId) }} />
                <span className="truncate font-semibold">
                  {l.name ?? "Anonymous supporter"}
                  {l.supporterId === me ? <span className="ml-1 text-xs text-gold-ink">(you)</span> : null}
                </span>
                <b className="tabular-nums">{l.score}/4</b>
              </li>
            ))}
        </ol>
      )}

      {mine ? (
        <p className="rounded-xl bg-card px-3 py-2.5 text-sm shadow-[0_0_0_1px_rgba(10,15,30,0.1)]">
          You&apos;re <b>#{mine.rank.toLocaleString("en-NG")}</b> of {mine.total.toLocaleString("en-NG")} with {mine.score}/4.
        </p>
      ) : null}
      </div>
    </Shell>
  );
}
