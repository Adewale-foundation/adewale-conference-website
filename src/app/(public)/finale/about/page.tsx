import Link from "next/link";
import { Dock, Eyebrow, Panel, Shell, Title, TopBar, ctaClass } from "@/components/finale/ui";
import { FINALE_BASE, FUND_SPLIT, TEAM_SHARE } from "@/lib/finale";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("About the Champions' Fund", "How the optional Grand Finale pledges are shared.");

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export default function FinaleAbout() {
  const steps: [string, string][] = [
    ["Supporting is free", "Pick a team and a bracket. A pledge is only ever offered afterwards, and never required."],
    [`${pct(TEAM_SHARE)} stays with your team`, "It goes to the school you back, win or lose."],
    [`${pct(1 - TEAM_SHARE)} goes to the Champions' Fund`, "It's shared by final placing once the final is played."],
    ["A fund, not a bet", "No one gets money back. Schools receive what pledgers chose, never cash for students."],
  ];
  return (
    <Shell>
      <div className="grid gap-4">
      <TopBar back={FINALE_BASE} />
      <Title>The Champions&apos; Fund</Title>
      <ol className="grid gap-3">
        {steps.map(([title, detail], i) => (
          <li key={title} className="grid grid-cols-[26px_minmax(0,1fr)] gap-3 text-sm">
            <span className="grid size-[26px] place-items-center rounded-full bg-foreground text-xs font-extrabold text-background">{i + 1}</span>
            <span>
              <b className="block">{title}</b>
              <span className="text-muted-foreground">{detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <Panel className="grid gap-1.5 text-sm">
        <Eyebrow>Champions&apos; Fund split</Eyebrow>
        <div className="flex justify-between"><span>Champion</span><b>{pct(FUND_SPLIT.champion)}</b></div>
        <div className="flex justify-between"><span>Runner-up</span><b>{pct(FUND_SPLIT.runnerUp)}</b></div>
        <div className="flex justify-between"><span>Each losing semi-finalist</span><b>{pct(FUND_SPLIT.semi)}</b></div>
      </Panel>
      <p className="text-xs text-muted-foreground">
        Payments are processed by Paystack. The foundation publishes what the fund bought after the Grand Finale.
      </p>
      <Dock>
        <Link href={FINALE_BASE} className={`${ctaClass} bg-foreground text-background`}>Pick a team</Link>
      </Dock>
      </div>
    </Shell>
  );
}
