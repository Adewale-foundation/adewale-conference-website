import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { actingEntry, type EntryLike } from "./acting-school";

// Fictional fixtures — this is a public repo, no real school or educator names.
const qualified = [{ stage: "Qualifications", outcome: "advanced" }];
const eliminated = [{ stage: "Qualifications", outcome: "eliminated" }];
const entry = (id: string, school: string, year: number, name: string, stages: EntryLike["stageResults"] = []): EntryLike => ({
  id,
  school_id: school,
  edition_year: year,
  status: "verified",
  schoolName: name,
  stageResults: stages,
});

const riverbend2026 = entry("r26", "riverbend", 2026, "Riverbend Academy", eliminated);
const unity2026 = entry("u26", "unity", 2026, "Unity College", qualified);
const zenith2026 = entry("z26", "zenith", 2026, "Zenith High", qualified);
const riverbend2024 = entry("r24", "riverbend", 2024, "Riverbend Academy", qualified);

describe("actingEntry", () => {
  it("offers every school entered in the newest edition, qualified first then by name", () => {
    const { choices } = actingEntry([zenith2026, riverbend2026, unity2026]);
    assert.deepEqual(choices.map((c) => c.id), ["u26", "z26", "r26"]);
  });

  it("defaults to a qualified school when one owner entered two", () => {
    assert.equal(actingEntry([riverbend2026, unity2026]).entry?.id, "u26");
  });

  it("acts for the chosen school when it is one of the choices", () => {
    assert.equal(actingEntry([riverbend2026, unity2026, zenith2026], "zenith").entry?.id, "z26");
    assert.equal(actingEntry([riverbend2026, unity2026], "riverbend").entry?.id, "r26");
  });

  it("ignores a stale choice that isn't in the newest edition", () => {
    const { entry: picked, choices } = actingEntry([unity2026, riverbend2024], "riverbend");
    assert.equal(picked?.id, "u26");
    assert.deepEqual(choices.map((c) => c.id), ["u26"]);
  });

  it("is empty without an entry that names a school", () => {
    assert.deepEqual(actingEntry([]), { entry: null, choices: [] });
    assert.deepEqual(actingEntry([{ ...unity2026, school_id: null }]), { entry: null, choices: [] });
  });
});
