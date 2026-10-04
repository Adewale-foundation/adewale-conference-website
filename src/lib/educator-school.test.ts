import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { educatorConflicts, otherSchoolFor, type Membership } from "./educator-school";

// Fictional fixtures — this is a public repo, no real school or educator names.
const RIVERBEND = "school-riverbend";
const UNITY = "school-unity";
const members: Membership[] = [
  { email: "ada@riverbend.test", school_id: RIVERBEND, school_name: "Riverbend Academy" },
  { email: "Femi@Shared.test", school_id: RIVERBEND, school_name: "Riverbend Academy" },
  { email: "femi@shared.test", school_id: UNITY, school_name: "Unity College" },
];

describe("otherSchoolFor", () => {
  it("finds an email already at a different school, ignoring case", () => {
    assert.deepEqual(otherSchoolFor(members, ["ADA@riverbend.test"], UNITY), {
      email: "ada@riverbend.test",
      schoolName: "Riverbend Academy",
    });
  });

  it("treats every school as other when the school is new", () => {
    assert.equal(otherSchoolFor(members, ["ada@riverbend.test"], null)?.schoolName, "Riverbend Academy");
  });

  it("allows an educator already at this same school, or not yet at any", () => {
    assert.equal(otherSchoolFor(members, ["ada@riverbend.test"], RIVERBEND), null);
    assert.equal(otherSchoolFor(members, ["new@school.test", null, ""], UNITY), null);
  });
});

describe("educatorConflicts", () => {
  it("lists only emails linked to more than one school", () => {
    assert.deepEqual(educatorConflicts(members), [
      {
        email: "femi@shared.test",
        schools: [
          { id: RIVERBEND, name: "Riverbend Academy" },
          { id: UNITY, name: "Unity College" },
        ],
      },
    ]);
  });

  it("is empty when everyone has one school", () => {
    assert.deepEqual(educatorConflicts(members.slice(0, 2)), []);
  });
});
