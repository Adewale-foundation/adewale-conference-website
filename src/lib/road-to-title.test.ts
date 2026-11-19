import { test } from "node:test";
import assert from "node:assert/strict";
import { roadToTitle } from "./road-to-title";

const STAGES = ["Registration", "Qualifications", "Group Stage", "Semi Finals", "Finals", "Completed"];

test("a stage's field is whoever advanced from the one before", () => {
  const road = roadToTitle(STAGES, [
    { stage: "Qualifications", entered: 129, advanced: 60 },
    { stage: "Group Stage", entered: 58, advanced: 4 },
    { stage: "Semi Finals", entered: 4, advanced: 2 },
    { stage: "Finals", entered: 2, advanced: 1 },
  ]);
  assert.deepEqual(road, [
    { stage: "Qualifications", schools: 129 },
    { stage: "Group Stage", schools: 60 },
    { stage: "Semi Finals", schools: 4 },
    { stage: "Finals", schools: 2 },
  ]);
});

test("the champion alone is not a stage", () => {
  const road = roadToTitle(STAGES, [{ stage: "Finals", entered: 2, advanced: 1 }]);
  assert.deepEqual(road, [{ stage: "Finals", schools: 2 }]);
});

test("stops where the results stop", () => {
  const road = roadToTitle(STAGES, [{ stage: "Qualifications", entered: 129, advanced: 60 }]);
  assert.deepEqual(road, [
    { stage: "Qualifications", schools: 129 },
    { stage: "Group Stage", schools: 60 },
  ]);
});

test("follows the edition's order, not the tallies'", () => {
  const road = roadToTitle(STAGES, [
    { stage: "Group Stage", entered: 60, advanced: 4 },
    { stage: "Qualifications", entered: 129, advanced: 60 },
  ]);
  assert.deepEqual(road.map((s) => s.stage), ["Qualifications", "Group Stage", "Semi Finals"]);
});

test("no results, no road", () => {
  assert.deepEqual(roadToTitle(STAGES, []), []);
});
