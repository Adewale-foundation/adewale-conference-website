export const FINAL_STAGE = "Finals";

export interface FinalMatch {
  kind: string;
  status: string;
  superseded_at: string | null;
  team_a_registration_id: string | null;
  team_b_registration_id: string | null;
  team_a_score: number | string | null;
  team_b_score: number | string | null;
  winner_registration_id: string | null;
}

export interface FinalPlacing {
  championId: string;
  championScore: number | null;
  runnerUpId: string | null;
  runnerUpScore: number | null;
}

const score = (value: number | string | null) => (value == null ? null : Number(value));

/** Champion and runner-up from an edition's Finals matches, or null while the final is undecided. */
export function finalPlacing(matches: FinalMatch[]): FinalPlacing | null {
  const decided = matches.filter(
    (m) =>
      m.status === "completed" &&
      !m.superseded_at &&
      m.winner_registration_id &&
      (m.kind === "knockout" || m.kind === "face_off"),
  );
  // A tied final is settled by a face-off, so that result outranks the match it settles.
  const match = decided.find((m) => m.kind === "face_off") ?? decided[0];
  if (!match) return null;

  const championId = match.winner_registration_id as string;
  const aWon = championId === match.team_a_registration_id;
  const bWon = championId === match.team_b_registration_id;
  if (!aWon && !bWon) return { championId, championScore: null, runnerUpId: null, runnerUpScore: null };
  return {
    championId,
    championScore: score(aWon ? match.team_a_score : match.team_b_score),
    runnerUpId: aWon ? match.team_b_registration_id : match.team_a_registration_id,
    runnerUpScore: score(aWon ? match.team_b_score : match.team_a_score),
  };
}

export interface FanVoteChampion {
  registrationId: string | null;
  name: string;
}

export type ChampionSource =
  | ({ source: "bracket" } & FinalPlacing)
  | ({ source: "fan_vote" } & FanVoteChampion);

/** The bracket is the official result; the fan-vote champion only stands in until the final is recorded there. */
export function championSource(
  placing: FinalPlacing | null,
  fanVote: FanVoteChampion | null,
): ChampionSource | null {
  if (placing) return { source: "bracket", ...placing };
  if (fanVote) return { source: "fan_vote", ...fanVote };
  return null;
}

/** A school's roster at the latest stage it has one for: the runner-up has no advanced row at the Finals. */
export function latestRoster<T>(stages: string[], rosterAt: (stage: string) => T[] | undefined): T[] {
  for (let i = stages.length - 1; i >= 0; i--) {
    const roster = rosterAt(stages[i]);
    if (roster?.length) return roster;
  }
  return [];
}
