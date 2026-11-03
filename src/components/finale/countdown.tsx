"use client";

import { Fragment, useEffect, useState } from "react";

const UNITS = ["Days", "Hrs", "Min", "Sec"] as const;

function parts(target: number, now: number): number[] {
  const ms = Math.max(0, target - now);
  return [Math.floor(ms / 864e5), Math.floor(ms / 36e5) % 24, Math.floor(ms / 6e4) % 60, Math.floor(ms / 1e3) % 60];
}

/** A digit tile that rolls the old value out as the new one rolls in, so a change never jumps. */
function Tile({ value, compact }: { value: string; compact: boolean }) {
  const [shown, setShown] = useState(value);
  const [leaving, setLeaving] = useState<string | null>(null);
  // Set during render, not in an effect: otherwise the new value paints for a frame before it animates.
  if (value !== shown) {
    setLeaving(shown);
    setShown(value);
  }
  useEffect(() => {
    if (leaving == null) return;
    const id = setTimeout(() => setLeaving(null), 500);
    return () => clearTimeout(id);
  }, [leaving, shown]);

  return (
    <span
      className={`relative grid place-items-center overflow-hidden rounded-md bg-gradient-to-b from-[#26304f] to-[#141B2E] font-mono font-bold tabular-nums text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_6px_rgba(0,0,0,0.35)] ${
        compact ? "h-10 min-w-10 px-1.5 text-xl" : "h-12 min-w-12 px-1.5 text-2xl sm:h-14 sm:min-w-14 sm:px-2 sm:text-3xl"
      }`}
    >
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-black/40" />
      {leaving != null ? (
        <span key={`out-${leaving}`} aria-hidden className="absolute motion-safe:animate-[roll-out_0.45s_cubic-bezier(0.4,0,0.2,1)_forwards] motion-reduce:hidden">
          {leaving}
        </span>
      ) : null}
      <span key={`in-${value}`} className={leaving != null ? "motion-safe:animate-[roll-in_0.45s_cubic-bezier(0.4,0,0.2,1)]" : ""}>
        {value}
      </span>
    </span>
  );
}

export default function Countdown({ to, compact = false }: { to: string; compact?: boolean }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Aligned to the second boundary so every tile turns on the same beat.
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      id = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
    return () => clearTimeout(id);
  }, []);
  // Placeholders on the server and first paint, so the strip doesn't shift when the clock starts.
  const values = now == null ? null : parts(target, now);

  return (
    <div role="timer" aria-label="Time until the Grand Finale" className={`flex flex-nowrap items-start ${compact ? "gap-1" : "mt-2 gap-1 sm:gap-1.5"}`}>
      {UNITS.map((label, i) => (
        <Fragment key={label}>
          {i > 0 ? (
            <span aria-hidden className={`font-mono font-bold text-primary/70 motion-safe:animate-[colon_2s_ease-in-out_infinite] ${compact ? "pt-1.5 text-lg" : "pt-2.5 text-xl sm:pt-3 sm:text-2xl"}`}>
              :
            </span>
          ) : null}
          <span className="grid justify-items-center gap-1">
            <Tile compact={compact} value={values == null ? "--" : i === 0 ? String(values[i]) : String(values[i]).padStart(2, "0")} />
            <small className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/50">{label}</small>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
