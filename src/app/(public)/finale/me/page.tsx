import Link from "next/link";
import { redirect } from "next/navigation";
import { Eyebrow, NotReady, Panel, Shell, TopBar, ctaClass, teamStyle } from "@/components/finale/ui";
import { FINALE_BASE, anyResult, bracketScore, pledgeLink } from "@/lib/finale";
import { FINALE_YEAR, finaleDb, loadFinale, loadLeaders, loadSupporter } from "@/lib/finale-data";
import { currentSupporterId } from "@/lib/finale-session";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = { ...pageMetadata("Your supporter badge", "Your team and your Grand Finale bracket."), robots: { index: false } };

export default async function FinaleBadge({ searchParams }: { searchParams: Promise<{ joined?: string }> }) {
  const { joined } = await searchParams;
  const id = await currentSupporterId();
  if (!id) redirect(FINALE_BASE);
  const db = finaleDb();
  if (!db) return <NotReady title="Something went wrong" detail="Please try again in a moment." />;

  const [{ supporter, error }, finale] = await Promise.all([loadSupporter(db, id), loadFinale(db, FINALE_YEAR)]);
  if (error || finale.error) {
    console.error("finale: badge could not load", error ?? finale.error);
    return <NotReady title="Something went wrong" detail="Please try again in a moment." />;
  }
  if (!supporter) redirect(FINALE_BASE);

  const { settings, teams } = finale;
  const byId = new Map(teams.map((t) => [t.id, t]));
  const team = byId.get(supporter.team_id);
  if (!team) redirect(FINALE_BASE);

  const { count: before, error: countError } = await db
    .from("finale_supporters")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id)
    .lte("created_at", supporter.created_at);
  if (countError) console.error("finale: supporter number", countError.message);

  const scored = anyResult(settings);
  const { leaders } = scored ? await loadLeaders(db, FINALE_YEAR, settings?.reward_count ?? 20, supporter.id) : { leaders: [] };
  const me = leaders.find((l) => l.supporterId === supporter.id);
  const inTop = !!me && me.rank <= (settings?.reward_count ?? 20);
  const decided = !!settings?.champion_team_id;

  const picks: [string, string, string | null | undefined][] = [
    ["Semi-final 1", supporter.pick_semi1, settings?.semi1_winner_id],
    ["Semi-final 2", supporter.pick_semi2, settings?.semi2_winner_id],
    ["Champion", supporter.pick_champion, settings?.champion_team_id],
  ];
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "";
  const share = encodeURIComponent(
    `I'm backing ${team.name} at the ASC Grand Finale. You can PICK your supported team too: ${site}${FINALE_BASE}`,
  );
  const pledgeUrl = pledgeLink(settings);

  return (
    <Shell style={teamStyle(team.color)}>
      <div className="grid gap-4">
      <TopBar right={<Link href={FINALE_BASE} className="text-sm font-bold text-gold-ink">All teams</Link>} />
      {joined ? <p className="text-sm font-bold">You&apos;re in. Here&apos;s your badge.</p> : null}

      <div className="relative grid gap-1 overflow-hidden rounded-[20px] bg-(--team) p-5 text-white">
        <span aria-hidden="true" className="absolute -top-10 -right-10 size-36 rounded-full border-[18px] border-white/15" />
        <Eyebrow className="text-white/80">ASC {FINALE_YEAR} · Grand Finale</Eyebrow>
        <span className="mt-2 text-[13px] font-semibold text-white/90">
          {supporter.display_name ?? "A supporter"} is with
        </span>
        <span className="text-3xl leading-none font-black">{team.name}</span>
        <div className="mt-3 flex justify-between gap-2 text-[12.5px] font-semibold text-white/90">
          <span>Supporter #{(before ?? 0).toLocaleString("en-NG")}</span>
          <span>Picks {byId.get(supporter.pick_champion)?.name}</span>
        </div>
      </div>

      <a
        href={`https://wa.me/?text=${share}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${ctaClass} bg-[#1E9E52] text-white`}
      >
        Share on WhatsApp
      </a>

      <Panel className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Your bracket</Eyebrow>
          {me ? <span className="text-sm font-bold tabular-nums">{bracketScore(supporter, settings)}/4 · #{me.rank} of {me.total.toLocaleString("en-NG")}</span> : null}
        </div>
        {picks.map(([label, pick, winner]) => (
          <div key={label} className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <b>
              {byId.get(pick)?.name}
              {winner ? <span className={winner === pick ? "text-emerald-700" : "text-destructive"}> {winner === pick ? "✓" : "✗"}</span> : null}
            </b>
          </div>
        ))}
        {inTop && decided ? (
          <p className="mt-1 rounded-lg bg-primary/15 px-3 py-2 text-sm font-bold text-gold-ink">
            You&apos;re in the top {settings?.reward_count}! We&apos;ll call the number you joined with about your prize.
          </p>
        ) : null}
        <Link href={`${FINALE_BASE}/leaders`} className="text-sm font-bold text-gold-ink">Leaderboard ›</Link>
      </Panel>

      {pledgeUrl ? (
        <Panel className="grid gap-2">
          <span className="justify-self-start rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-gold-ink">OPTIONAL</span>
          <b>Put something behind your team?</b>
          <p className="text-sm text-muted-foreground">
            70% goes to {team.name}, win or lose. The rest goes to the Champions&apos; Fund. Enter{" "}
            <b>{team.schoolName ?? team.name}</b> on the Paystack page under Team so it reaches the right school.
          </p>
          <a
            href={pledgeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ctaClass} bg-transparent py-3 shadow-[inset_0_0_0_1px_rgba(10,15,30,0.15)]`}
          >
            Pledge on Paystack ↗
          </a>
        </Panel>
      ) : null}
      </div>
    </Shell>
  );
}
