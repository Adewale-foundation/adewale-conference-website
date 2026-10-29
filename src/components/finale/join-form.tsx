"use client";

import { useActionState, useState } from "react";
import { joinFinale, type FinaleFormResult } from "@/app/(public)/finale/actions";
import { Dock, Eyebrow, ctaClass } from "@/components/finale/ui";
import { TEAM_COLORS } from "@/lib/finale";
import type { FinaleTeamColor } from "@/supabase/types";

type PickTeam = { id: string; name: string; semi: 1 | 2; color: FinaleTeamColor; pickPct: number };

const inputClass =
  "w-full rounded-xl bg-card px-3.5 py-3 text-base shadow-[0_0_0_1px_rgba(10,15,30,0.1)] outline-none focus:shadow-[0_0_0_2px_var(--color-foreground)] disabled:opacity-50";

export default function JoinForm({
  team,
  teams,
  rewardText,
  rewardCount,
}: {
  team: { id: string; name: string; semi: 1 | 2 };
  teams: PickTeam[];
  rewardText: string | null;
  rewardCount: number;
}) {
  const [state, action, pending] = useActionState<FinaleFormResult, FormData>(joinFinale, null);
  // Controlled throughout: React resets an uncontrolled form after every action,
  // and a rejected join would otherwise wipe what the supporter typed.
  const [name, setName] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [semi1, setSemi1] = useState(team.semi === 1 ? team.id : "");
  const [semi2, setSemi2] = useState(team.semi === 2 ? team.id : "");
  const [champion, setChampion] = useState(team.id);
  const [cheer, setCheer] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);

  const finalists = teams.filter((t) => t.id === semi1 || t.id === semi2);
  const championValid = finalists.some((t) => t.id === champion);

  const pickGroup = (semi: 1 | 2, value: string, set: (v: string) => void) => (
    <div role="radiogroup" aria-label={`Semi-final ${semi} winner`} className="grid grid-cols-2 gap-2">
      {teams
        .filter((t) => t.semi === semi)
        .map((t) => (
          <label
            key={t.id}
            className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-card px-3 text-sm font-bold shadow-[0_0_0_1px_rgba(10,15,30,0.1)] has-[:checked]:shadow-[0_0_0_2px_var(--pick)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2"
            style={{ "--pick": TEAM_COLORS[t.color] } as React.CSSProperties}
          >
            <input
              type="radio"
              name={`pick_semi${semi}`}
              value={t.id}
              checked={value === t.id}
              onChange={() => set(t.id)}
              className="sr-only"
            />
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: TEAM_COLORS[t.color] }} />
            <span className="min-w-0 leading-tight">{t.name}</span>
          </label>
        ))}
    </div>
  );

  return (
    <form action={action} className="mt-4 grid gap-5">
      {/* Honeypot: hidden from people and assistive tech, filled by bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <input type="hidden" name="team_id" value={team.id} />

      <div className="grid gap-2">
        <label htmlFor="finale-name"><Eyebrow>Your name</Eyebrow></label>
        <input
          id="finale-name"
          name="name"
          maxLength={40}
          autoComplete="name"
          placeholder="e.g. Tunde, class of 2019"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={anonymous}
          className={inputClass}
        />
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Stay anonymous</span>
          <input
            type="checkbox"
            name="anonymous"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="size-5 accent-(--team)"
          />
        </label>
      </div>

      <div className="grid gap-2">
        <Eyebrow>Your bracket</Eyebrow>
        <span className="text-xs text-muted-foreground">Semi-final 1</span>
        {pickGroup(1, semi1, (v) => {
          setSemi1(v);
          if (champion !== v && champion !== semi2) setChampion(v);
        })}
        <span className="text-xs text-muted-foreground">Semi-final 2</span>
        {pickGroup(2, semi2, (v) => {
          setSemi2(v);
          if (champion !== v && champion !== semi1) setChampion(v);
        })}
        <span className="mt-1 text-xs text-muted-foreground">Who lifts the trophy?</span>
        <div role="radiogroup" aria-label="Champion" className="grid gap-2">
          {finalists.length < 2 ? (
            <p className="text-sm text-muted-foreground">Pick both semi-final winners first.</p>
          ) : (
            finalists.map((t) => (
              <label
                key={t.id}
                className="relative flex min-h-12 cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-xl bg-card px-3 text-sm font-bold shadow-[0_0_0_1px_rgba(10,15,30,0.1)] has-[:checked]:shadow-[0_0_0_2px_var(--pick)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2"
                style={{ "--pick": TEAM_COLORS[t.color] } as React.CSSProperties}
              >
                <i
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 opacity-15"
                  style={{ width: `${t.pickPct}%`, background: TEAM_COLORS[t.color] }}
                />
                <input
                  type="radio"
                  name="pick_champion"
                  value={t.id}
                  checked={champion === t.id}
                  onChange={() => setChampion(t.id)}
                  className="sr-only"
                />
                <span className="relative">{t.name}</span>
                <span className="relative text-xs text-muted-foreground tabular-nums">{t.pickPct}% picked</span>
              </label>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {rewardText
            ? `Get all three right early to be in the top ${rewardCount}: ${rewardText}`
            : `The top ${rewardCount} predictors win prizes. Earlier entries rank higher on a tie.`}
        </p>
      </div>

      <div className="grid gap-2">
        <label htmlFor="finale-cheer"><Eyebrow>Cheer · optional</Eyebrow></label>
        <textarea
          id="finale-cheer"
          name="cheer"
          rows={2}
          maxLength={80}
          placeholder="Bring it home to Abeokuta!"
          value={cheer}
          onChange={(e) => setCheer(e.target.value)}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="finale-phone"><Eyebrow>Phone number</Eyebrow></label>
        <input
          id="finale-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0803 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
        <label className="flex items-start gap-3 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-(--team)"
          />
          <span>
            We use your number only to count one entry per person and to contact you if you win. It is never shown
            publicly.
          </span>
        </label>
      </div>

      {state && !state.ok ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      ) : null}

      <Dock>
        <button type="submit" disabled={pending || !championValid} className={`${ctaClass} bg-(--team) text-white`}>
          {pending ? "Joining…" : "I'm in"}
        </button>
      </Dock>
    </form>
  );
}
