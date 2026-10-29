import Link from "next/link";
import { Eyebrow, MatchCard, NotReady, teamStyle } from "@/components/finale/ui";
import { FINALE_BASE, naira, pledgedTotal, votingState } from "@/lib/finale";
import { FINALE_YEAR, finaleDb, loadFinale, type FinaleTeamView } from "@/lib/finale-data";
import { formatCampDate } from "@/lib/camp";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 30;
export const metadata = pageMetadata(
  "Grand Finale fan vote",
  "Pick your team for the ASC Grand Finale, predict the champion and back the schools.",
  FINALE_BASE,
);

const linkCard = "flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3.5 text-sm shadow-[0_0_0_1px_rgba(10,15,30,0.1)] hover:bg-foreground/[0.02]";

export default async function FinaleHome() {
  const db = finaleDb();
  if (!db) return <NotReady title="The fan vote opens soon" detail="Check back closer to the Grand Finale." />;
  const { settings, teams, error } = await loadFinale(db, FINALE_YEAR);
  if (error) console.error("finale: home could not load", error);
  const semi = (n: 1 | 2) => teams.filter((t) => t.semi === n);
  if (error || !settings || semi(1).length !== 2 || semi(2).length !== 2) {
    return <NotReady title="The fan vote opens soon" detail="Check back closer to the Grand Finale." />;
  }

  const state = votingState(settings);
  const supporters = teams.reduce((s, t) => s + t.supporters, 0);
  const pledged = pledgedTotal(teams);
  const byId = (id: string | null) => teams.find((t) => t.id === id) ?? null;
  const champion = byId(settings.champion_team_id);
  const finalists = [byId(settings.semi1_winner_id), byId(settings.semi2_winner_id)];

  return (
    <>
      <header className="relative overflow-hidden bg-[#0A0F1E] px-6 py-12 md:px-12 md:py-16">
        <div aria-hidden className="pointer-events-none absolute -top-6 right-0 select-none text-[11rem] leading-none text-[rgba(232,160,32,0.06)] md:text-[16rem]">
          ★
        </div>
        <div className="relative mx-auto grid max-w-5xl gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-end">
          <div>
            <span className="mb-5 inline-block border border-primary bg-[rgba(232,160,32,0.08)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-primary md:text-xs">
              ASC {FINALE_YEAR} · Grand Finale fan vote
            </span>
            <h1 className="text-5xl font-black leading-[0.95] tracking-tight text-white md:text-7xl">
              {champion ? `${champion.name}: champions` : "Who takes the crown?"}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
              {state === "open"
                ? "Back your school, predict the semi-finals and the champion, and share your badge. It's free. The best predictors win prizes."
                : state === "decided"
                  ? "Thank you to every supporter. See who called it on the leaderboard."
                  : "Joining has closed. Results appear here as the games finish."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px border border-white/10 bg-white/10">
            <div className="bg-[#0A0F1E] p-5">
              <Eyebrow className="text-white/50">Supporters</Eyebrow>
              <div className="mt-1 text-4xl font-extrabold tabular-nums text-white">{supporters.toLocaleString("en-NG")}</div>
            </div>
            <div className="bg-[#0A0F1E] p-5">
              <Eyebrow className="text-white/50">{champion ? "Called it" : state === "open" ? "Joining closes" : "Joining"}</Eyebrow>
              <div className="mt-1 text-lg font-bold text-white">
                {champion
                  ? `${supporters ? Math.round((champion.championPicks / supporters) * 100) : 0}%`
                  : state === "open"
                    ? settings.closes_at ? formatCampDate(settings.closes_at) : "Open now"
                    : "Closed"}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="px-4 py-10 md:px-12 md:py-14">
        <div className="mx-auto grid max-w-5xl gap-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Eyebrow>Semi-finals and Final</Eyebrow>
              <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">Pick a school to back</h2>
            </div>
            <Link href={`${FINALE_BASE}/me`} className="text-sm font-bold text-gold-ink hover:underline">Already joined? Your badge ›</Link>
          </div>

          <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(13rem,0.65fr)_minmax(0,1fr)] md:gap-6">
            <MatchCard label="Semi-final 1" a={semi(1)[0]} b={semi(1)[1]} winnerSlug={finalists[0]?.slug} />
            <FinalBox champion={champion} finalists={finalists} />
            <MatchCard label="Semi-final 2" a={semi(2)[0]} b={semi(2)[1]} winnerSlug={finalists[1]?.slug} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Link href={`${FINALE_BASE}/leaders`} className={linkCard}>
              <span>
                <b className="block">Leaderboard</b>
                <span className="text-muted-foreground">The top {settings.reward_count} predictors win prizes.</span>
              </span>
              <span className="text-lg text-muted-foreground">›</span>
            </Link>
            <Link href={`${FINALE_BASE}/about`} className={linkCard}>
              <span>
                <b className="block">
                  Champions&apos; Fund{" "}
                  <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 align-middle text-[10px] font-bold text-gold-ink">OPTIONAL</span>
                </b>
                <span className="text-muted-foreground">
                  {pledged ? `${naira(pledged)} pledged to the schools so far.` : "How optional pledges reach the schools."}
                </span>
              </span>
              <span className="text-lg text-muted-foreground">›</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function FinalBox({ champion, finalists }: { champion: FinaleTeamView | null; finalists: (FinaleTeamView | null)[] }) {
  return (
    <div
      style={champion ? teamStyle(champion.color) : undefined}
      className={`grid gap-2 rounded-2xl p-6 text-center shadow-[0_18px_50px_-20px_rgba(232,160,32,0.55)] ${champion ? "bg-(--team) text-white" : "bg-primary text-[#0A0F1E]"}`}
    >
      <span className="text-3xl font-black tracking-tight">THE FINAL</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">ASC {FINALE_YEAR} Champion</span>
      <span className="mt-1 text-sm font-semibold">
        {champion
          ? champion.name
          : finalists[0] && finalists[1]
            ? `${finalists[0].name} v ${finalists[1].name}`
            : "The two semi-final winners meet here"}
      </span>
    </div>
  );
}
