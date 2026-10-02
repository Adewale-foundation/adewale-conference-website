import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  campCandidates,
  campCounts,
  campCsvMatrix,
  campRosterRows,
  campWindow,
  educatorKey,
  educatorsOnRecord,
  formatCampDate,
  goingSummary,
  mergeSavedEducators,
  MAX_EXTRA_EDUCATORS,
  isoToLagosInput,
  lagosInputToIso,
  isCampEligible,
  validateCampResponse,
  type CampEducator,
  type CampResponseInput,
} from "./camp";
import { canAccess, tierRank } from "./resource-access";
import type { CampConfirmation } from "@/supabase/types";

// Fictional fixtures — this is a public repo, no real school or student names.
const QUALIFIED = [{ stage: "Qualifications", outcome: "advanced" }];
const SETTINGS = { is_open: true, confirm_deadline: "2026-10-07T23:59:59+01:00" };
const BEFORE = new Date("2026-10-05T10:00:00+01:00");
const AFTER = new Date("2026-10-08T09:00:00+01:00");

const TEACHER: CampEducator = {
  name: "Mrs Ada Nwosu",
  phone: "0803 123 4567",
  email: "ada@riverbend.test",
  role: "teacher",
  going: true,
};
const PRINCIPAL: CampEducator = {
  name: "Dr Femi Testa",
  phone: "0805 765 4321",
  email: "femi@riverbend.test",
  role: "principal",
  going: false,
};

function input(over: Partial<CampResponseInput> = {}): CampResponseInput {
  return {
    status: "attending",
    educators: [TEACHER, PRINCIPAL],
    extras: [],
    repsConfirmed: true,
    termsAccepted: true,
    notes: "",
    declineReason: "",
    ...over,
  };
}

function confirmation(over: Partial<CampConfirmation> = {}): CampConfirmation {
  return {
    id: "c1",
    registration_id: "reg-1",
    school_id: "school-1",
    edition_year: 2026,
    status: "attending",
    educators: [{ ...TEACHER, name: "Ms Zainab Quill", phone: "08031234567", email: null }],
    reps_confirmed: true,
    notes: null,
    decline_reason: null,
    respond_by: null,
    admin_note: null,
    invited_manually: false,
    responded_at: "2026-10-03T12:00:00Z",
    updated_at: "2026-10-03T12:00:00Z",
    ...over,
  };
}

describe("isCampEligible", () => {
  it("invites verified schools that advanced past qualifications", () => {
    assert.equal(isCampEligible("verified", QUALIFIED), true);
    assert.equal(isCampEligible("verified", [{ stage: "Zonal Stage", outcome: "advanced" }]), true);
  });

  it("invites any school an admin added by hand, qualified or not", () => {
    assert.equal(isCampEligible("verified", [{ stage: "Qualifications", outcome: "eliminated" }], true), true);
    assert.equal(isCampEligible("submitted", [], true), true);
  });

  it("skips schools that were eliminated, unverified or not yet marked", () => {
    assert.equal(isCampEligible("verified", [{ stage: "Qualifications", outcome: "eliminated" }]), false);
    assert.equal(isCampEligible("submitted", QUALIFIED), false);
    assert.equal(isCampEligible("verified", []), false);
  });
});

describe("campWindow", () => {
  it("is open before the edition deadline", () => {
    assert.deepEqual(campWindow(SETTINGS, null, BEFORE), {
      open: true,
      deadline: SETTINGS.confirm_deadline,
      reason: null,
    });
  });

  it("locks after the deadline", () => {
    assert.equal(campWindow(SETTINGS, null, AFTER).reason, "past_deadline");
  });

  it("lets a replacement school answer late through its own respond_by", () => {
    const c = { status: "pending" as const, respond_by: "2026-10-12T23:59:59+01:00" };
    const w = campWindow(SETTINGS, c, AFTER);
    assert.equal(w.open, true);
    assert.equal(w.deadline, c.respond_by);
  });

  it("is closed when admins close confirmations, whatever the date", () => {
    assert.equal(campWindow({ ...SETTINGS, is_open: false }, null, BEFORE).reason, "closed");
  });

  it("never reopens a released spot", () => {
    const c = { status: "released" as const, respond_by: "2026-12-01T00:00:00Z" };
    assert.equal(campWindow(SETTINGS, c, BEFORE).reason, "released");
  });

  it("stays open with no deadline set", () => {
    assert.equal(campWindow({ is_open: true, confirm_deadline: null }, null, AFTER).open, true);
  });
});

describe("validateCampResponse", () => {
  it("keeps every educator on record, going or not, plus filled-in extras", () => {
    const r = validateCampResponse(
      input({
        notes: " Nut allergy ",
        extras: [
          { name: " Ms Zainab Quill ", phone: "08031112222" },
          { name: "", phone: "" },
        ],
      }),
    );
    assert.ok(r.ok);
    assert.deepEqual(
      r.value.educators.map((e) => [e.name, e.role, e.going]),
      [
        ["Mrs Ada Nwosu", "teacher", true],
        ["Dr Femi Testa", "principal", false],
        ["Ms Zainab Quill", "extra", true],
      ],
    );
    assert.equal(r.value.notes, "Nut allergy");
    assert.equal(goingSummary(r.value.educators), "Mrs Ada Nwosu (0803 123 4567); Ms Zainab Quill (08031112222)");
  });

  it("accepts several educators going, or only extras when no one on record can come", () => {
    assert.ok(validateCampResponse(input({ educators: [TEACHER, { ...PRINCIPAL, going: true }] })).ok);
    const onlyExtra = validateCampResponse(
      input({ educators: [{ ...TEACHER, going: false }], extras: [{ name: "Ms Zainab Quill", phone: "08031112222" }] }),
    );
    assert.ok(onlyExtra.ok);
  });

  it("needs at least one educator going", () => {
    const r = validateCampResponse(input({ educators: [{ ...TEACHER, going: false }, PRINCIPAL] }));
    assert.deepEqual(r, { ok: false, error: "Choose at least one educator who will accompany your students." });
  });

  it("needs a valid phone for everyone going, but not for those staying behind", () => {
    assert.equal(validateCampResponse(input({ educators: [{ ...TEACHER, phone: "call me" }] })).ok, false);
    assert.equal(validateCampResponse(input({ educators: [{ ...TEACHER, phone: null }] })).ok, false);
    assert.ok(validateCampResponse(input({ educators: [TEACHER, { ...PRINCIPAL, phone: null }] })).ok);
  });

  it("rejects half-filled extras and caps how many can be added", () => {
    assert.equal(validateCampResponse(input({ extras: [{ name: "Ms Zainab Quill", phone: "" }] })).ok, false);
    const many = Array.from({ length: MAX_EXTRA_EDUCATORS + 1 }, (_, i) => ({ name: `Teacher ${i}`, phone: "08030000000" }));
    assert.equal(validateCampResponse(input({ extras: many })).ok, false);
  });

  it("still requires the contestants and the terms when attending", () => {
    assert.equal(validateCampResponse(input({ repsConfirmed: false })).ok, false);
    assert.equal(validateCampResponse(input({ termsAccepted: false })).ok, false);
  });

  it("needs a reason to decline, and drops the educators", () => {
    assert.equal(validateCampResponse(input({ status: "not_attending" })).ok, false);
    const r = validateCampResponse(input({ status: "not_attending", declineReason: "Exams clash" }));
    assert.ok(r.ok);
    assert.deepEqual(r.value.educators, []);
    assert.equal(r.value.repsConfirmed, false);
    assert.equal(r.value.declineReason, "Exams clash");
  });

  it("rejects an unknown or missing choice", () => {
    assert.equal(validateCampResponse(input({ status: "" })).ok, false);
    assert.equal(validateCampResponse(input({ status: "released" })).ok, false);
  });
});

describe("campRosterRows", () => {
  const regs = [
    { id: "reg-1", status: "verified", schoolName: "Riverbend Academy", lga: "Ikenne", stageResults: QUALIFIED },
    { id: "reg-2", status: "verified", schoolName: "Unity College", lga: "Ijebu Ode", stageResults: QUALIFIED },
    {
      id: "reg-3",
      status: "verified",
      schoolName: "Lakeside Grammar",
      lga: "Remo North",
      stageResults: [{ stage: "Qualifications", outcome: "eliminated" }],
    },
  ];

  it("lists every invited school, marking those who haven't answered", () => {
    const rows = campRosterRows(regs, [confirmation()]);
    assert.deepEqual(
      rows.map((r) => [r.schoolName, r.status]),
      [
        ["Riverbend Academy", "attending"],
        ["Unity College", "no_response"],
      ],
    );
  });

  it("treats an admin-opened pending row as no response", () => {
    const rows = campRosterRows(regs, [
      confirmation({ registration_id: "reg-2", status: "pending", respond_by: "2026-10-12T00:00:00Z" }),
    ]);
    const unity = rows.find((r) => r.registrationId === "reg-2");
    assert.equal(unity?.status, "no_response");
    assert.equal(unity?.respondBy, "2026-10-12T00:00:00Z");
  });

  it("keeps a school with an answer on file even after it loses eligibility", () => {
    const rows = campRosterRows(regs, [confirmation({ registration_id: "reg-3", status: "released" })]);
    const lakeside = rows.find((r) => r.registrationId === "reg-3");
    assert.equal(lakeside?.status, "released");
    assert.equal(lakeside?.source, "not_qualified");
  });

  it("labels qualified schools and those an admin added by hand", () => {
    const rows = campRosterRows(regs, [
      confirmation({ registration_id: "reg-3", status: "pending", invited_manually: true }),
    ]);
    assert.deepEqual(
      rows.map((r) => [r.schoolName, r.source, r.status]),
      [
        ["Lakeside Grammar", "manual", "no_response"],
        ["Riverbend Academy", "qualified", "no_response"],
        ["Unity College", "qualified", "no_response"],
      ],
    );
    assert.equal(campCounts(rows).manual, 1);
  });

  it("offers only schools not yet on the roster as manual additions", () => {
    const rows = campRosterRows(regs, []);
    assert.deepEqual(campCandidates(regs, rows).map((r) => r.id), ["reg-3"]);
  });

  it("counts by status and exports one row per school", () => {
    const rows = campRosterRows(regs, [
      confirmation(),
      confirmation({ id: "c2", registration_id: "reg-2", status: "not_attending", decline_reason: "Exams clash" }),
    ]);
    assert.deepEqual(campCounts(rows), {
      eligible: 2,
      attending: 1,
      not_attending: 1,
      no_response: 0,
      released: 0,
      manual: 0,
    });
    const csv = campCsvMatrix(rows);
    assert.equal(csv.length, 3);
    const unity = csv.find((row) => row[0] === "Unity College");
    assert.equal(unity?.[2], "Qualified");
    assert.equal(unity?.[3], "Not attending");
    assert.equal(unity?.[8], "Exams clash");
  });
});

describe("camp resource access", () => {
  const tier = tierRank("verified", QUALIFIED);

  it("opens camp material only to schools attending camp", () => {
    assert.equal(canAccess("camp", tier, true), true);
    assert.equal(canAccess("camp", tier, false), false);
    assert.equal(canAccess("camp", tier), false);
  });

  it("leaves the tier ladder unchanged", () => {
    assert.equal(canAccess("qualified", tier), true);
    assert.equal(canAccess("finalist", tier), false);
    assert.equal(canAccess("public", 0), true);
  });
});

describe("formatCampDate", () => {
  it("renders in Lagos time regardless of the server zone", () => {
    assert.match(formatCampDate("2026-10-26T13:00:00Z"), /26 Oct 2026, 2:00\s?pm/i);
    assert.equal(formatCampDate(null), "");
  });
});

describe("Lagos datetime-local conversion", () => {
  it("reads admin input as Lagos time", () => {
    assert.equal(lagosInputToIso("2026-10-07T23:59"), "2026-10-07T22:59:00.000Z");
    assert.equal(lagosInputToIso(""), null);
    assert.equal(lagosInputToIso("7 Oct"), null);
  });

  it("round-trips a stored timestamp back into the input", () => {
    assert.equal(isoToLagosInput("2026-10-07T22:59:00.000Z"), "2026-10-07T23:59");
    assert.equal(isoToLagosInput(lagosInputToIso("2026-10-26T14:00")), "2026-10-26T14:00");
    assert.equal(isoToLagosInput(null), "");
  });
});

describe("educatorsOnRecord", () => {
  const details = {
    "Teacher Full Name": " Mrs Ada Nwosu ",
    "Teacher Number": "0803 123 4567",
    "Teacher Email Address": "Ada@Riverbend.test",
    "Principal Full Name": "Dr Femi Testa",
    "Principal Number": "0805 765 4321",
    "Principal Email Address": "femi@riverbend.test",
  };

  it("lists the teacher and principal from the entry, then other members, once each", () => {
    const list = educatorsOnRecord(details, [
      { full_name: "Ada Nwosu", email: "ada@riverbend.test" },
      { full_name: "Mr Bisi Marlowe", email: "bisi@riverbend.test" },
      { full_name: null, email: "office@riverbend.test" },
    ]);
    assert.deepEqual(
      list.map((e) => [e.name, e.role, e.phone, e.going]),
      [
        ["Mrs Ada Nwosu", "teacher", "0803 123 4567", false],
        ["Dr Femi Testa", "principal", "0805 765 4321", false],
        ["Mr Bisi Marlowe", "educator", null, false],
        ["office@riverbend.test", "educator", null, false],
      ],
    );
  });

  it("copes with an entry that has no contact details", () => {
    assert.deepEqual(educatorsOnRecord(null, []), []);
  });
});

describe("mergeSavedEducators", () => {
  it("restores saved going choices and phones, and returns saved extras", () => {
    const record = educatorsOnRecord(
      { "Teacher Full Name": "Mrs Ada Nwosu", "Teacher Email Address": "ada@riverbend.test" },
      [],
    );
    const saved: CampEducator[] = [
      { name: "Mrs Ada Nwosu", phone: "08031234567", email: "ada@riverbend.test", role: "teacher", going: true },
      { name: "Ms Zainab Quill", phone: "08031112222", email: null, role: "extra", going: true },
    ];
    const merged = mergeSavedEducators(record, saved);
    assert.equal(merged.record[0].going, true);
    assert.equal(merged.record[0].phone, "08031234567");
    assert.deepEqual(merged.extras.map((e) => e.name), ["Ms Zainab Quill"]);
    assert.equal(educatorKey(merged.record[0]), "ada@riverbend.test");
  });
});
