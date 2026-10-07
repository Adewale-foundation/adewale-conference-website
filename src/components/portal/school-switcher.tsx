import { chooseActingSchool } from "@/app/(portal)/portal/school/actions";
import type { ActingEntry } from "@/lib/acting-school-data";

/** Shown only when one account entered several schools this edition. */
export default function SchoolSwitcher({ choices, current }: { choices: ActingEntry[]; current: string | null }) {
  if (choices.length < 2) return null;
  return (
    <form action={chooseActingSchool} className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">You manage {choices.length} schools. Acting for:</span>
      {choices.map((c) => {
        const active = c.school_id === current;
        return (
          <button
            key={c.id}
            name="school_id"
            value={c.school_id ?? ""}
            aria-pressed={active}
            disabled={active}
            className={`border px-3 py-1.5 ${
              active
                ? "border-foreground bg-foreground text-background font-semibold"
                : "border-foreground/20 text-foreground hover:border-foreground"
            }`}
          >
            {c.schoolName ?? "Unnamed school"}
          </button>
        );
      })}
    </form>
  );
}
