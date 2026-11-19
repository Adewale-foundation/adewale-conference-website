import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { championSource, finalPlacing, latestRoster, type FinalMatch } from "./finale-podium";

const match = (over: Partial<FinalMatch> = {}): FinalMatch => ({
  kind: "knockout",
  status: "completed",
  superseded_at: null,
  team_a_registration_id: "reg-a",
  team_b_registration_id: "reg-b",
  team_a_score: 40,
  team_b_score: 55,
  winner_registration_id: "reg-b",
  ...over,
});

describe("finalPlacing", () => {
  it("names the winner champion and the other finalist runner-up", () => {
    assert.deepEqual(finalPlacing([match()]), {
      championId: "reg-b",
      championScore: 55,
      runnerUpId: "reg-a",
      runnerUpScore: 40,
    });
  });

  it("is null until a final is completed with a winner", () => {
    assert.equal(finalPlacing([]), null);
    assert.equal(finalPlacing([match({ status: "in_progress" })]), null);
    assert.equal(finalPlacing([match({ winner_registration_id: null })]), null);
  });

  it("ignores a superseded match", () => {
    assert.equal(finalPlacing([match({ superseded_at: "2026-11-19T12:00:00Z" })]), null);
  });

  it("lets a face-off decide a tied final", () => {
    const placing = finalPlacing([
      match({ winner_registration_id: "reg-b" }),
      match({ kind: "face_off", winner_registration_id: "reg-a", team_a_score: 3, team_b_score: 1 }),
    ]);
    assert.equal(placing?.championId, "reg-a");
    assert.equal(placing?.runnerUpId, "reg-b");
  });

  it("coerces numeric scores that arrive as strings", () => {
    assert.equal(finalPlacing([match({ team_b_score: "55.5" })])?.championScore, 55.5);
  });

  it("has no runner-up when the opponent slot is empty", () => {
    assert.equal(finalPlacing([match({ team_a_registration_id: null })])?.runnerUpId, null);
  });
});

describe("championSource", () => {
  const placing = { championId: "reg-b", championScore: 55, runnerUpId: "reg-a", runnerUpScore: 40 };
  const fanVote = { registrationId: "reg-c", name: "Team C" };

  it("prefers the bracket over the fan-vote champion", () => {
    assert.equal(championSource(placing, fanVote)?.source, "bracket");
  });

  it("falls back to the fan-vote champion when the final is not in the bracket", () => {
    assert.deepEqual(championSource(null, fanVote), { source: "fan_vote", ...fanVote });
  });

  it("is null when neither is recorded", () => {
    assert.equal(championSource(null, null), null);
  });
});

describe("latestRoster", () => {
  const stages = ["Qualifications", "Semi Finals", "Finals"];

  it("takes the latest stage that has a roster", () => {
    const rosters: Record<string, string[]> = { Qualifications: ["x", "y"], "Semi Finals": ["x"] };
    assert.deepEqual(latestRoster(stages, (s) => rosters[s]), ["x"]);
  });

  it("is empty when no stage has one", () => {
    assert.deepEqual(latestRoster(stages, () => undefined), []);
  });
});
