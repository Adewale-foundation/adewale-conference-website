# The Grand Finale Podium Is Derived from the Final Match

`/results` and the home-page notice name an edition's champion and runner-up from its Finals match in `tournament_matches`: the winner is the champion, the other finalist the runner-up. Until that match is recorded, the champion set on the fan-vote page (`finale_settings.champion_team_id`) stands in, alone. ADR 0012 left this open: its podium is `state_rank`, which only a paper-exam cut writes.

## Considered options

- **Derive from the Finals match, fall back to the fan-vote champion (chosen).** No schema change and no third place to enter a result. The bracket is the official record and already drives the school and student results pages; the fallback exists because on the day the fan-vote page is the one an admin is sure to have filled in. Costs a second source that can disagree with the first — the bracket wins whenever it has an answer.
- **A `final_position` column on `registration_stage_results`.** Would also hold a third place. Rejected: it is a third place to type the same result, and ADR 0015 already records the cost of two.
- **Write `state_rank` from `recordMatchResult`.** Reuses the existing podium untouched. Rejected: `state_rank` means rank in a statewide paper cut, and the runner-up's row is `eliminated`, which the page never reads.

## Notes

- **The runner-up is named although their Finals row is `eliminated`.** This is the one exception to ADR 0012's rule that a school that did not get through is never named: a finalist stood on the stage and is already public on `/finale`. Semi-final losers stay unnamed.
- **A face-off outranks the match it settles**, so a tied final resolved by a face-off names the face-off's winner.
- **There is no third place**, because no match decides one.
- **Reps come from the latest stage a school has a roster for.** The runner-up has no advanced Reps at the Finals, so theirs are the Semi Finals roster.
- **The rule lives in `src/lib/finale-podium.ts`**; `finale-podium-data.ts` only fetches, on the service role with a short `select`, as ADR 0012 describes.
