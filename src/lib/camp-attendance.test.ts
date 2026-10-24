import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  campAttendanceMatrix,
  campDayFor,
  campDays,
  campEducatorFor,
  campEducatorKey,
  campRegister,
  campRegisterPeople,
  campStudentKey,
  formatCampDay,
  groupBySchool,
  lagosDay,
  parseCampPersonKey,
  type CampRegisterSchool,
} from "./camp-attendance";

// Fictional fixtures — this is a public repo, no real school or student names.
const REG = "11111111-1111-4111-8111-111111111111";
const STUDENT = "22222222-2222-4222-8222-222222222222";

function school(over: Partial<CampRegisterSchool> = {}): CampRegisterSchool {
  return {
    registrationId: REG,
    schoolName: "Riverbend Academy",
    educators: [
      { name: "Mr Tunde Bello", phone: "0800", email: null, role: "teacher", going: false },
      { name: "Mrs Ada Nwosu", phone: "0801", email: null, role: "principal", going: true },
    ],
    extra: null,
    students: [
      { id: STUDENT, name: "Zainab Okafor", level: "SS 2" },
      { id: "33333333-3333-4333-8333-333333333333", name: "Bisi Ade", level: "SS 1" },
    ],
    ...over,
  };
}

describe("camp person keys", () => {
  it("round-trips students and educators", () => {
    assert.deepEqual(parseCampPersonKey(campStudentKey(STUDENT)), { kind: "student", studentId: STUDENT });
    assert.deepEqual(parseCampPersonKey(campEducatorKey(REG, "second")), {
      kind: "educator",
      registrationId: REG,
      slot: "second",
    });
  });

  it("rejects anything else", () => {
    assert.equal(parseCampPersonKey(STUDENT), null);
    assert.equal(parseCampPersonKey(`educator:${REG}:third`), null);
    assert.equal(parseCampPersonKey(`student:${STUDENT}x`), null);
  });
});

describe("campDays", () => {
  it("lists every Lagos calendar day from arrival to departure", () => {
    // 2026 camp: arrives Mon 2pm, leaves Wed 3pm.
    assert.deepEqual(campDays("2026-10-26T13:00:00Z", "2026-10-28T14:00:00Z"), [
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
    ]);
  });

  it("reads days in Lagos time, not UTC", () => {
    // 23:30 UTC is already the next day in Lagos.
    assert.deepEqual(campDays("2026-10-25T23:30:00Z", "2026-10-26T10:00:00Z"), ["2026-10-26"]);
  });

  it("is empty without an arrival and capped when the dates are a typo", () => {
    assert.deepEqual(campDays(null, "2026-10-28T14:00:00Z"), []);
    assert.equal(campDays("2026-10-26T13:00:00Z", "2027-10-28T14:00:00Z").length, 14);
  });
});

describe("campDayFor", () => {
  const days = ["2026-10-26", "2026-10-27", "2026-10-28"];
  it("is today while camp runs, else the nearest end", () => {
    assert.equal(campDayFor(days, new Date("2026-10-27T09:00:00Z")), "2026-10-27");
    assert.equal(campDayFor(days, new Date("2026-10-24T09:00:00Z")), "2026-10-26");
    assert.equal(campDayFor(days, new Date("2026-11-02T09:00:00Z")), "2026-10-28");
    assert.equal(campDayFor([], new Date()), null);
  });

  it("rolls over at Lagos midnight", () => {
    assert.equal(lagosDay(new Date("2026-10-26T23:30:00Z")), "2026-10-27");
  });
});

describe("formatCampDay", () => {
  it("numbers the day within camp", () => {
    assert.equal(formatCampDay("2026-10-27", ["2026-10-26", "2026-10-27"]), "Day 2 · Tue 27 Oct");
  });
});

describe("campEducatorFor", () => {
  it("takes the one educator going", () => {
    assert.equal(campEducatorFor(school(), "primary")?.name, "Mrs Ada Nwosu");
    assert.equal(campEducatorFor(school({ educators: [] }), "primary"), null);
  });

  it("includes a second educator unless declined, flagging one still awaiting approval", () => {
    assert.equal(campEducatorFor(school({ extra: { name: "Mr Obi", status: "approved" } }), "second")?.detail, "Second educator");
    assert.match(campEducatorFor(school({ extra: { name: "Mr Obi", status: "pending" } }), "second")!.detail, /awaiting approval/);
    assert.equal(campEducatorFor(school({ extra: { name: "Mr Obi", status: "declined" } }), "second"), null);
  });
});

describe("campRegisterPeople", () => {
  it("lists each school's educators ahead of its students, schools alphabetically", () => {
    const people = campRegisterPeople([
      school({ registrationId: "r-b", schoolName: "Zenith College", students: [] }),
      school(),
    ]);
    assert.deepEqual(
      people.map((p) => [p.schoolName, p.role, p.name]),
      [
        ["Riverbend Academy", "educator", "Mrs Ada Nwosu"],
        ["Riverbend Academy", "student", "Bisi Ade"],
        ["Riverbend Academy", "student", "Zainab Okafor"],
        ["Zenith College", "educator", "Mrs Ada Nwosu"],
      ],
    );
    assert.equal(people[0].key, campEducatorKey(REG, "primary"));
    assert.equal(people[2].studentId, STUDENT);
  });
});

describe("campRegister and campAttendanceMatrix", () => {
  const people = campRegisterPeople([school()]);
  const studentKey = campStudentKey(STUDENT);

  it("treats a person with no mark as unmarked, not absent", () => {
    const reg = campRegister(people, [{ person_key: studentKey, status: "present", marked_at: "t" }]);
    assert.equal(reg.find((p) => p.key === studentKey)?.state, "present");
    assert.equal(reg[0].state, "unmarked");
  });

  it("gives one column per day", () => {
    const days = ["2026-10-26", "2026-10-27"];
    const matrix = campAttendanceMatrix(people, days, [
      { person_key: studentKey, status: "present", marked_at: "t", camp_day: "2026-10-26" },
      { person_key: studentKey, status: "absent", marked_at: "t", camp_day: "2026-10-27" },
    ]);
    assert.deepEqual(matrix[0].slice(4), ["Day 1 · Mon 26 Oct", "Day 2 · Tue 27 Oct"]);
    const row = matrix.find((r) => r[1] === "Zainab Okafor")!;
    assert.deepEqual(row.slice(2), ["Student", "SS 2", "Present", "Absent"]);
    assert.deepEqual(matrix[1].slice(2), ["Educator", "Educator", "Not marked", "Not marked"]);
  });
});

describe("groupBySchool", () => {
  it("keeps each school's people together, in order", () => {
    const groups = groupBySchool([
      { registrationId: "a", schoolName: "Riverbend Academy", name: "1" },
      { registrationId: "b", schoolName: "Zenith College", name: "2" },
      { registrationId: "a", schoolName: "Riverbend Academy", name: "3" },
    ]);
    assert.deepEqual(
      groups.map((g) => [g.schoolName, g.rows.map((r) => r.name)]),
      [["Riverbend Academy", ["1", "3"]], ["Zenith College", ["2"]]],
    );
  });
});
