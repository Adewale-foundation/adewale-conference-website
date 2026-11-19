import { test } from "node:test";
import assert from "node:assert/strict";
import { canAffordImagery } from "./connection";

test("a browser that reports nothing gets the imagery", () => {
  assert.equal(canAffordImagery(undefined), true);
  assert.equal(canAffordImagery({}), true);
});

test("Data Saver wins over a fast link", () => {
  assert.equal(canAffordImagery({ saveData: true, effectiveType: "4g" }), false);
});

test("2G-class links go without, 3G and up do not", () => {
  assert.equal(canAffordImagery({ effectiveType: "slow-2g" }), false);
  assert.equal(canAffordImagery({ effectiveType: "2g" }), false);
  assert.equal(canAffordImagery({ effectiveType: "3g" }), true);
  assert.equal(canAffordImagery({ effectiveType: "4g" }), true);
});
