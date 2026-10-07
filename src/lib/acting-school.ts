import { tierRank } from "@/lib/resource-access";

// An educator can own entries for several schools in one edition (sister
// schools under one proprietor), so the school portal acts for one at a time.
export const ACTING_SCHOOL_COOKIE = "asc_acting_school";

export type EntryLike = {
  id: string;
  school_id: string | null;
  edition_year: number;
  status: string | null;
  schoolName: string | null;
  stageResults?: { stage: string; outcome: string | null }[] | null;
};

/**
 * The entry the portal acts for, and the schools to switch between: every
 * school entered in the newest edition, furthest-advanced first. The stored
 * choice wins when it is still one of them.
 */
export function actingEntry<T extends EntryLike>(
  entries: T[],
  chosenSchoolId?: string | null,
): { entry: T | null; choices: T[] } {
  const withSchool = entries.filter((e) => e.school_id);
  if (!withSchool.length) return { entry: null, choices: [] };
  const newest = Math.max(...withSchool.map((e) => e.edition_year));
  const choices = withSchool
    .filter((e) => e.edition_year === newest)
    .sort(
      (a, b) =>
        tierRank(b.status, b.stageResults) - tierRank(a.status, a.stageResults) ||
        (a.schoolName ?? "").localeCompare(b.schoolName ?? ""),
    );
  const entry = choices.find((e) => e.school_id === chosenSchoolId) ?? choices[0];
  return { entry, choices };
}
