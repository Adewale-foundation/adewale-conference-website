# The Finale Fan Vote Is Phone-Keyed, Shows Then Moderates, And Takes Pledges Off-Site

Anyone with the link can back one of the four Grand Finale teams at `/finale`. They don't need an account. They pick a bracket (both semi-final winners and the champion) and may leave a short cheer. Each phone number joins once per edition. A signed cookie brings the person back to their badge. The top predictors win non-cash prizes. Optional pledges are paid on a Paystack Payment Page, so the site stores and handles no payment data. The feature has its own tables (`finale_teams`, `finale_settings`, `finale_supporters`) and no anon access. The public pages write on the service role from server actions that validate first, and admins read and moderate under the `participants` module.

## Considered options

- **A phone number with no code (chosen).** It gives one entry per number and a way to reach prize winners, with no SMS cost or delivery delay on the day. The cost is that someone determined can enter numbers that aren't theirs. Because of that, a second join with the same number is refused and does **not** hand over the existing badge: without a code, that would let anyone claim someone else's entry. The refusal does reveal that a number has joined. That is the price of deduping without a code.
- **A phone number with an SMS code.** Rejected for this edition: provider setup and per-message cost, and codes that arrive late on the busiest day.
- **Name and device only.** Rejected: clearing cookies stuffs the vote, and there is no way to contact winners.
- **Show cheers first, moderate after (chosen).** A cheer or name holding a link, a phone number, an email address or a blocked word is stored as `held` and appears as "Anonymous supporter" until an admin looks. The supporter isn't told, so there is nothing to probe. Anything the filter misses is hidden from the admin page. Pre-approval was rejected as too slow for a live event.
- **A Paystack Payment Page (chosen).** The badge links to a page the foundation sets up in Paystack; payers type their school's name in a Team field, as the badge tells them. No secret key, webhook or payment record exists in this public codebase, so none can leak or be forged. Paystack's dashboard is the ledger, and an admin types the fund total into settings for display. A server-side checkout with webhook settlement was built and then dropped: it gave live totals, but meant holding a secret key and trusting a verify-then-settle path in a public repo for a few weeks of use.
- **Results entered on the fan-vote page, not read from `tournament_matches` (chosen for now).** Each finalist is one school, and `finale_teams.registration_id` points at it, so knockout matches could feed the bracket later. They don't yet, because recording a knockout result also marks official stage outcomes. A public game shouldn't depend on that path days before the final. The cost is entering each semi-final and final result in two places.

## Notes

- **Scoring lives in two places:** `bracketScore()` in `src/lib/finale.ts` and `finale_leaders()` in SQL (1 point per semi-final, 2 for the champion, ties to the earlier join). Change one, change both. The supporters export ranks with the TS copy.
- **Counts are SQL.** `finale_tally()` and `finale_leaders()` exist because a PostgREST select stops at the max-rows setting. Only the service role may call them.
- **Moderation can change `public_status` and nothing else.** That is enforced by a column grant, not just by the action.
- **A team can't change semi-final once anyone has joined**, because that would silently invalidate every bracket already picked. Its link name, generated from the display name, is frozen at the same moment, so links already shared keep working.
- **`FINALE_COOKIE_SECRET`** signs the badge cookie through `src/lib/signed-cookie.ts`, the same signer as the centre-lead cookie, with a different purpose string so the two can never be swapped.
