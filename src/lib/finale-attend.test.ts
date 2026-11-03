import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  doorQuery,
  attendState,
  attendeesCsvMatrix,
  normalizeRefCode,
  schoolInviteState,
  schoolSeatDecision,
  seatDecision,
  seatsLeft,
  validateAttendee,
  validateSchoolResponse,
  type AttendeeInput,
} from "./finale-attend";
import type { FinaleAttendee } from "@/supabase/types";

// Fictional fixtures — this is a public repo, no real school or student names.
const teacher: AttendeeInput = {
  firstName: " Ada ",
  lastName: "Okonkwo",
  email: "Ada.Teacher@Lantern-College.ng",
  phone: "0803 123 4567",
  role: "teacher",
  organisation: "Lantern Model College",
  lga: "Abeokuta South",
  studentCount: "3",
  studentNames: ["Tobi Lark", "", "Kemi Wren"],
  studentClasses: ["SS 2", "", ""],
};

describe("validateAttendee", () => {
  it("cleans a teacher's group and drops blank student rows", () => {
    const r = validateAttendee(teacher, { requirePhone: true });
    assert.ok(r.ok);
    assert.equal(r.value.firstName, "Ada");
    assert.equal(r.value.email, "ada.teacher@lantern-college.ng");
    assert.equal(r.value.phone, "+2348031234567");
    assert.equal(r.value.studentCount, 3);
    assert.deepEqual(r.value.students, [
      { name: "Tobi Lark", class: "SS 2" },
      { name: "Kemi Wren", class: "" },
    ]);
  });

  it("refuses more named students than the count", () => {
    const r = validateAttendee({ ...teacher, studentCount: "1" }, { requirePhone: true });
    assert.equal(r.ok, false);
  });

  it("gives a student a single seat whatever the form sends", () => {
    const r = validateAttendee({ ...teacher, role: "student", studentCount: "40" }, { requirePhone: true });
    assert.ok(r.ok);
    assert.equal(r.value.studentCount, 0);
    assert.deepEqual(r.value.students, []);
  });

  it("requires a phone from the public but not from an admin invite", () => {
    assert.equal(validateAttendee({ ...teacher, phone: "" }, { requirePhone: true }).ok, false);
    assert.equal(validateAttendee({ ...teacher, phone: "" }, { requirePhone: false }).ok, true);
    assert.equal(validateAttendee({ ...teacher, phone: "12345" }, { requirePhone: false }).ok, false);
  });

  it("rejects an unknown role, LGA or class", () => {
    assert.equal(validateAttendee({ ...teacher, role: "admin" }, { requirePhone: true }).ok, false);
    assert.equal(validateAttendee({ ...teacher, lga: "Lekki" }, { requirePhone: true }).ok, false);
    assert.equal(validateAttendee({ ...teacher, studentClasses: ["Year 9"] }, { requirePhone: true }).ok, false);
  });

  it("lets a parent leave the organisation blank but not a teacher", () => {
    assert.equal(validateAttendee({ ...teacher, role: "parent", organisation: "" }, { requirePhone: true }).ok, true);
    assert.equal(validateAttendee({ ...teacher, organisation: "" }, { requirePhone: true }).ok, false);
  });
});

describe("seatDecision", () => {
  it("confirms while the whole group fits, then waitlists the whole group", () => {
    assert.equal(seatDecision(10, 5, 5), "confirmed");
    assert.equal(seatDecision(10, 5, 6), "waitlisted");
    assert.equal(seatDecision(null, 5000, 50), "confirmed");
  });
  it("lets an admin go over the cap", () => {
    assert.equal(seatDecision(10, 10, 4, true), "confirmed");
  });
});

describe("attendState", () => {
  const before = new Date("2026-11-10T12:00:00+01:00");
  it("is closed until an admin opens it", () => {
    assert.equal(attendState(null, 0, before), "closed");
    assert.equal(attendState({ attend_open: false, attend_capacity: null }, 0, before), "closed");
  });
  it("turns to the waitlist once seats run out", () => {
    assert.equal(attendState({ attend_open: true, attend_capacity: 100 }, 99, before), "open");
    assert.equal(attendState({ attend_open: true, attend_capacity: 100 }, 100, before), "waitlist");
  });
  it("is over once the event ends", () => {
    assert.equal(attendState({ attend_open: true, attend_capacity: null }, 0, new Date("2026-11-19T15:00:00+01:00")), "over");
  });
  it("counts seats left, never below zero", () => {
    assert.equal(seatsLeft(100, 120), 0);
    assert.equal(seatsLeft(null, 120), null);
  });
});

describe("normalizeRefCode", () => {
  it("accepts what people type at the door", () => {
    assert.equal(normalizeRefCode("gf-7k3qpm"), "GF-7K3QPM");
    assert.equal(normalizeRefCode("7K3 QPM"), "GF-7K3QPM");
  });
  it("rejects ambiguous characters and wrong lengths", () => {
    assert.equal(normalizeRefCode("GF-7K3QP0"), null);
    assert.equal(normalizeRefCode("GF-7K3Q"), null);
    assert.equal(normalizeRefCode(42), null);
  });
});

describe("attendeesCsvMatrix", () => {
  it("lists named students in order on their educator's row", () => {
    const row = {
      id: "a1", ref_code: "GF-ABCDEF", status: "confirmed", source: "open", first_name: "Ada", last_name: "Okonkwo",
      email: "ada@lantern.ng", phone: "+2348031234567", role: "teacher", organisation: "Lantern Model College",
      lga: "Abeokuta South", student_count: 2, seats: 3, checked_in_at: null, created_at: "2026-11-03T10:00:00Z",
    } as FinaleAttendee;
    const m = attendeesCsvMatrix([row], [
      { id: "s2", attendee_id: "a1", student_id: null, full_name: "Kemi Wren", class: null, sort: 2 },
      { id: "s1", attendee_id: "a1", student_id: null, full_name: "Tobi Lark", class: "SS 2", sort: 1 },
    ]);
    assert.equal(m[1][12], "Tobi Lark (SS 2); Kemi Wren");
    assert.equal(m[1][2], "Open registration");
  });
});

describe("schoolInviteState", () => {
  const before = new Date("2026-11-10T12:00:00+01:00");
  it("is open to every school until the reply-by date or the event", () => {
    assert.equal(schoolInviteState(null, before), "open");
    assert.equal(schoolInviteState({ school_respond_by: "2026-11-09T23:59:00+01:00" }, before), "past-deadline");
    assert.equal(schoolInviteState(null, new Date("2026-11-19T15:00:00+01:00")), "over");
  });
});

describe("schoolSeatDecision", () => {
  it("waitlists a new school that doesn't fit but never demotes a confirmed one", () => {
    assert.equal(schoolSeatDecision(100, 90, 10, null), "confirmed");
    assert.equal(schoolSeatDecision(100, 90, 11, null), "waitlisted");
    assert.equal(schoolSeatDecision(100, 90, 11, "waitlisted"), "waitlisted");
    assert.equal(schoolSeatDecision(100, 90, 11, "confirmed"), "refused");
    assert.equal(schoolSeatDecision(null, 900, 50, "confirmed"), "confirmed");
  });
});

describe("validateSchoolResponse", () => {
  const record = {
    educators: [
      { key: "ada@lantern.ng", name: "Ada Okonkwo", phone: "08031234567", email: "ada@lantern.ng" },
      { key: "name:bayo", name: "Bayo Lark", phone: null, email: null },
    ],
    students: [
      { id: "s-1", name: "Tobi Lark", level: "SS 2" },
      { id: "s-2", name: "Kemi Wren", level: "SS 1" },
    ],
  };
  const yes = {
    attending: "yes",
    goingKeys: ["ada@lantern.ng"],
    phones: {},
    otherNames: ["", "Grace Finch"],
    otherPhones: ["", ""],
    studentIds: ["s-1"],
    extraNames: ["Femi Rook", ""],
    extraClasses: ["JSS 3", ""],
    studentCount: "30",
  };

  it("takes educators and students from the record, plus the ones typed in", () => {
    const r = validateSchoolResponse(yes, record);
    assert.ok(r.ok && r.value.attending);
    assert.deepEqual(r.value.educators.map((e) => e.name), ["Ada Okonkwo", "Grace Finch"]);
    assert.equal(r.value.educators[0].phone, "+2348031234567");
    assert.deepEqual(r.value.students, [
      { name: "Tobi Lark", class: "SS 2", studentId: "s-1" },
      { name: "Femi Rook", class: "JSS 3", studentId: null },
    ]);
    assert.equal(r.value.studentCount, 30);
  });

  it("refuses a student id that isn't the school's", () => {
    assert.equal(validateSchoolResponse({ ...yes, studentIds: ["someone-else"] }, record).ok, false);
  });

  it("needs at least one educator, and a count no lower than the names", () => {
    assert.equal(validateSchoolResponse({ ...yes, goingKeys: [], otherNames: [] }, record).ok, false);
    assert.equal(validateSchoolResponse({ ...yes, studentCount: "1" }, record).ok, false);
  });

  it("defaults the count to the named students", () => {
    const r = validateSchoolResponse({ ...yes, studentCount: "" }, record);
    assert.ok(r.ok && r.value.attending);
    assert.equal(r.value.studentCount, 2);
  });

  it("accepts a decline without anything else", () => {
    assert.deepEqual(validateSchoolResponse({ ...yes, attending: "no" }, record), { ok: true, value: { attending: false } });
  });
});

describe("doorQuery", () => {
  it("reduces a scanned ticket link to its code", () => {
    assert.equal(doorQuery("https://www.adewaleconference.org/grand-finale/ticket/GF-7K3QPM"), "GF-7K3QPM");
    assert.equal(doorQuery("http://localhost:3000/grand-finale/ticket/GF-7K3QPM?new=1"), "GF-7K3QPM");
    assert.equal(normalizeRefCode(doorQuery("https://x.org/grand-finale/ticket/gf-7k3qpm")), "GF-7K3QPM");
  });
  it("passes a typed code or name through", () => {
    assert.equal(doorQuery(" GF-7K3QPM "), "GF-7K3QPM");
    assert.equal(doorQuery("Lantern Model"), "Lantern Model");
  });
});
