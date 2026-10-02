// Tiered resource access: content unlocks as a school progresses through the
// competition. The ladder — accepted → qualified (past zonals) → finalist — is
// now DERIVED from stage advancement rather than a status flag, so one
// advancement action on the participant hub drives both progress and unlocks.
// A resource's `access` names the minimum tier; anyone below it sees the item
// listed but locked, with the file withheld SERVER-side (the URL never reaches
// their browser).

export type ResourceAccess = "public" | "accepted" | "qualified" | "finalist" | "camp";

// "camp" is off the ladder: it needs a confirmed camp place, not just progress.
// Its rank is the qualified floor so callers that only compare ranks still lock it.
const ACCESS_RANK: Record<ResourceAccess, number> = {
  public: 0,
  accepted: 1,
  qualified: 2,
  finalist: 3,
  camp: 2,
};

/** Minimum tier a resource demands (unknown/missing → public). */
export function accessRank(access?: string | null): number {
  return ACCESS_RANK[(access ?? "public") as ResourceAccess] ?? 0;
}

/**
 * Tier a school has unlocked, derived from named milestones. Accepted
 * (verified) schools get tier 1; advancing past Qualifications unlocks
 * Qualified; advancing inside the Grand Finale path unlocks Finalist. Optional
 * stages such as Round of 24 never change the ladder by count alone.
 */
export function tierRank(
  status: string | null | undefined,
  stageResults?: { stage: string; outcome: string | null }[] | null,
): number {
  if (status !== "verified") return 0;
  const advanced = new Set(
    (stageResults ?? []).filter((s) => s?.outcome === "advanced").map((s) => s.stage),
  );
  if (
    [
      "Grand Finale Group Stage",
      "Round of 24",
      "Round of 16",
      "Quarter Finals",
      "Semi Finals",
      "Finals",
    ].some((stage) => advanced.has(stage))
  ) {
    return 3;
  }
  if (advanced.has("Qualifications") || advanced.has("Zonal Stage")) return 2;
  return 1;
}

/** Whether a school at the given unlocked tier can open a resource. */
export function canAccess(
  access: string | null | undefined,
  tier: number,
  campAttending = false,
) {
  if (access === "camp" && !campAttending) return false;
  return accessRank(access) <= tier;
}

export const ACCESS_LABEL: Record<Exclude<ResourceAccess, "public">, string> = {
  accepted: "Accepted schools",
  qualified: "Qualified schools",
  finalist: "Finalists",
  camp: "Camp attendees",
};

export function lockHint(access?: string | null): string {
  switch (access) {
    case "finalist":
      return "Unlocks for finalist schools";
    case "camp":
      return "Unlocks once your school confirms its camp place";
    case "qualified":
      return "Unlocks when your school qualifies past zonals";
    default:
      return "Unlocks once your school's entry is accepted";
  }
}
