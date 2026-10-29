import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { FINALE_BASE, TEAM_COLORS } from "@/lib/finale";
import type { FinaleTeamColor } from "@/supabase/types";

export function teamStyle(color: FinaleTeamColor): CSSProperties {
  return { "--team": TEAM_COLORS[color] } as CSSProperties;
}

/** The fan vote inside the site's navbar and footer: a phone-width column that
 *  widens on desktop. The home page uses `wide` for its bracket. */
export function Shell({ children, wide = false, style }: { children: ReactNode; wide?: boolean; style?: CSSProperties }) {
  return (
    <div className="px-4 pt-2 pb-12 md:px-12 md:pt-8 md:pb-20" style={style}>
      <div className={`mx-auto w-full ${wide ? "max-w-5xl" : "max-w-xl"}`}>{children}</div>
    </div>
  );
}

export function TopBar({ back, right }: { back?: string; right?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 pt-3">
      {back ? (
        <Link
          href={back}
          aria-label="Back"
          className="grid size-9 place-items-center rounded-full bg-card text-lg shadow-[0_0_0_1px_rgba(10,15,30,0.1)]"
        >
          ‹
        </Link>
      ) : (
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">ASC Grand Finale</span>
      )}
      {right}
    </div>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground ${className}`}>{children}</span>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-[28px] font-black leading-[1.05] tracking-tight text-balance">{children}</h1>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-card p-4 shadow-[0_0_0_1px_rgba(10,15,30,0.1)] ${className}`}>{children}</div>;
}

export function Dock({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-6 border-t border-foreground/10 bg-background/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:mt-8 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      {children}
    </div>
  );
}

export const ctaClass =
  "flex w-full cursor-pointer items-center justify-center rounded-2xl px-4 py-4 text-[15px] font-extrabold transition-opacity disabled:cursor-not-allowed disabled:opacity-40";

export function NotReady({ title, detail }: { title: string; detail: string }) {
  return (
    <Shell>
      <div className="grid gap-3 py-16 text-center">
        <Eyebrow>ASC Grand Finale</Eyebrow>
        <Title>{title}</Title>
        <p className="text-muted-foreground">{detail}</p>
        <Link href={FINALE_BASE} className="mt-2 font-bold text-gold-ink">Back to the fan vote</Link>
      </div>
    </Shell>
  );
}

export type TeamRow = {
  slug: string;
  name: string;
  schoolName: string | null;
  color: FinaleTeamColor;
  supporters: number;
  pledged: number | null;
};

/** One semi-final: both teams, their fan counts, and the split of the stands. */
export function MatchCard({
  label,
  a,
  b,
  winnerSlug,
}: {
  label: string;
  a: TeamRow;
  b: TeamRow;
  winnerSlug?: string | null;
}) {
  const total = a.supporters + b.supporters;
  const pa = total ? Math.round((a.supporters / total) * 100) : 50;
  const row = (t: TeamRow) => (
    <Link
      href={`${FINALE_BASE}/${t.slug}`}
      style={teamStyle(t.color)}
      className="grid grid-cols-[10px_minmax(0,1fr)_auto_14px] items-center gap-3 px-4 py-3 hover:bg-foreground/[0.03]"
    >
      <span className="size-2.5 rounded-full bg-(--team)" />
      <span className="min-w-0">
        <b className="block text-[15.5px]">{t.name}</b>
        {t.schoolName && t.schoolName !== t.name ? (
          <small className="block truncate text-xs text-muted-foreground">{t.schoolName}</small>
        ) : null}
      </span>
      <span className="text-right text-[13px] font-bold tabular-nums">
        {winnerSlug === t.slug ? (
          <span className="mr-2 rounded-full bg-(--team) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Through</span>
        ) : null}
        {t.supporters.toLocaleString("en-NG")} <span className="text-xs font-semibold text-muted-foreground">fans</span>
        {t.pledged ? (
          <small className="block text-[11px] font-semibold text-muted-foreground">₦{t.pledged.toLocaleString("en-NG")} pledged</small>
        ) : null}
      </span>
      <span className="text-lg text-muted-foreground">›</span>
    </Link>
  );
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-[0_0_0_1px_rgba(10,15,30,0.1)]">
      <div className="flex justify-between px-4 pt-3">
        <Eyebrow>{label}</Eyebrow>
        <Eyebrow className="tabular-nums">{pa}% · {100 - pa}%</Eyebrow>
      </div>
      {row(a)}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 text-[11px] font-bold text-muted-foreground">
        <hr className="border-foreground/10" />
        VS
        <hr className="border-foreground/10" />
      </div>
      {row(b)}
      <div className="flex h-1.5">
        <i className="block h-full" style={{ width: `${pa}%`, background: TEAM_COLORS[a.color] }} />
        <i className="block h-full" style={{ width: `${100 - pa}%`, background: TEAM_COLORS[b.color] }} />
      </div>
    </div>
  );
}
