import Link from "next/link";
import type { PastEdition } from "@/lib/editions-archive";
import { REPLAYS } from "@/lib/replays";

export default function EditionCard({ edition }: { edition: PastEdition }) {
  const link = "text-sm font-bold underline underline-offset-4 hover:text-gold-ink";
  return (
    <div className="flex h-full flex-col gap-3 bg-white p-7">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bebas text-6xl leading-none text-foreground">{edition.year}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-ink">{edition.edition}</span>
      </div>
      <p className="text-base leading-relaxed text-muted-foreground">{edition.desc}</p>
      <p className="mt-auto flex flex-wrap gap-x-6 gap-y-2 pt-3">
        <Link href={`/results?year=${edition.year}`} className={link}>Hall of Fame</Link>
        {REPLAYS[edition.year]?.length ? (
          <Link href={`/watch?year=${edition.year}`} className={link}>Watch it back</Link>
        ) : null}
      </p>
    </div>
  );
}
