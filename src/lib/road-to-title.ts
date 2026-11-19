export interface StageTally {
  stage: string;
  /** Schools with any result at the stage. */
  entered: number;
  advanced: number;
}

export interface RoadStep {
  stage: string;
  schools: number;
}

/** How many schools were still in at each stage, in the edition's own order. A stage's field is whoever
 *  advanced from the one before; only the first has to count its own results. A field of one is the
 *  champion, not a stage. */
export function roadToTitle(stages: readonly string[], tallies: readonly StageTally[]): RoadStep[] {
  const byStage = new Map(tallies.map((t) => [t.stage, t]));
  const road: RoadStep[] = [];
  let through = 0;
  for (const stage of stages) {
    const tally = byStage.get(stage);
    const schools = through || tally?.entered || 0;
    through = tally?.advanced ?? 0;
    if (schools > 1) road.push({ stage, schools });
  }
  return road;
}
