import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CAMP_ATTENDEE_PHONE_COLUMNS,
  campAttendees,
  campAttendeesCsvMatrix,
  campCandidates,
  matchRepSlots,
  campCounts,
  campCsvMatrix,
  campRosterRows,
  campWindow,
  educatorKey,
  educatorsOnRecord,
  formatCampDate,
  goingSummary,
  mergeSavedEducators,
  OTHER_EDUCATOR,
  primaryEducator,
  nameKey,
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
    primary: educatorKey(TEACHER),
    other: { name: "", phone: "" },
    extra: null,
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
    extra_educator: null,
    extra_reason: null,
    extra_status: null,
    extra_admin_note: null,
    extra_decided_at: null,
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
  it("marks exactly the chosen educator as going and keeps the rest on record", () => {
    const r = validateCampResponse(input({ primary: educatorKey(PRINCIPAL), notes: " Nut allergy " }));
    assert.ok(r.ok);
    assert.deepEqual(
      r.value.educators.map((e) => [e.name, e.going]),
      [
        ["Mrs Ada Nwosu", false],
        ["Dr Femi Testa", true],
      ],
    );
    assert.equal(primaryEducator(r.value.educators)?.name, "Dr Femi Testa");
    assert.equal(r.value.extra, null);
    assert.equal(r.value.notes, "Nut allergy");
  });

  it("ignores going flags sent by the form; only the chosen one goes", () => {
    const r = validateCampResponse(input({ educators: [TEACHER, { ...PRINCIPAL, going: true }] }));
    assert.ok(r.ok);
    assert.equal(r.value.educators.filter((e) => e.going).length, 1);
  });

  it("accepts someone not on record as the one educator", () => {
    const r = validateCampResponse(
      input({ primary: OTHER_EDUCATOR, other: { name: " Ms Zainab Quill ", phone: "0803 111 2222" } }),
    );
    assert.ok(r.ok);
    assert.deepEqual(
      r.value.educators.filter((e) => e.going).map((e) => [e.name, e.role]),
      [["Ms Zainab Quill", "extra"]],
    );
  });

  it("needs a chosen educator with a valid phone", () => {
    assert.deepEqual(validateCampResponse(input({ primary: "" })), {
      ok: false,
      error: "Choose the one educator who will accompany your students.",
    });
    assert.equal(validateCampResponse(input({ primary: "someone@else.test" })).ok, false);
    assert.equal(validateCampResponse(input({ educators: [{ ...TEACHER, phone: null }] })).ok, false);
    assert.equal(validateCampResponse(input({ primary: OTHER_EDUCATOR, other: { name: "Ms Zainab Quill", phone: "call me" } })).ok, false);
    assert.ok(validateCampResponse(input({ educators: [TEACHER, { ...PRINCIPAL, phone: null }] })).ok);
  });

  it("takes a second educator as a request with a reason", () => {
    const r = validateCampResponse(
      input({ extra: { name: "Ms Zainab Quill", phone: "0803 111 2222", reason: " Two female contestants " } }),
    );
    assert.ok(r.ok);
    assert.equal(r.value.extra?.name, "Ms Zainab Quill");
    assert.equal(r.value.extra?.going, false);
    assert.equal(r.value.extraReason, "Two female contestants");
    assert.equal(r.value.educators.filter((e) => e.going).length, 1);
  });

  it("rejects a second educator without a reason, a phone, or who is the first one again", () => {
    assert.equal(validateCampResponse(input({ extra: { name: "Ms Zainab Quill", phone: "08031112222", reason: "" } })).ok, false);
    assert.equal(validateCampResponse(input({ extra: { name: "Ms Zainab Quill", phone: "", reason: "girls" } })).ok, false);
    assert.deepEqual(
      validateCampResponse(input({ extra: { name: "MRS. ADA NWOSU", phone: "08030000000", reason: "girls" } })),
      { ok: false, error: "The second educator must be a different person." },
    );
    assert.equal(
      validateCampResponse(input({ extra: { name: "Someone Else", phone: "0803-123-4567", reason: "girls" } })).ok,
      false,
    );
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
    assert.equal(r.value.extra, null);
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
      confirmation({
        extra_educator: { name: "Mr Bisi Marlowe", phone: "08035550000", email: null, role: "extra" },
        extra_reason: "Two female contestants",
        extra_status: "pending",
      }),
      confirmation({ id: "c2", registration_id: "reg-2", status: "not_attending", decline_reason: "Exams clash" }),
    ]);
    assert.deepEqual(campCounts(rows), {
      eligible: 2,
      attending: 1,
      not_attending: 1,
      no_response: 0,
      released: 0,
      manual: 0,
      extraPending: 1,
    });
    const [header, ...body] = campCsvMatrix(rows);
    assert.equal(body.length, 2);
    const col = (row: string[], name: string) => row[header.indexOf(name)];
    const riverbend = body.find((row) => row[0] === "Riverbend Academy")!;
    assert.equal(col(riverbend, "Educator"), "Ms Zainab Quill (08031234567)");
    assert.equal(col(riverbend, "Second educator"), "Mr Bisi Marlowe (08035550000)");
    assert.equal(col(riverbend, "Second educator status"), "Awaiting approval");
    assert.equal(col(riverbend, "Second educator reason"), "Two female contestants");
    const unity = body.find((row) => row[0] === "Unity College")!;
    assert.equal(col(unity, "Invited as"), "Qualified");
    assert.equal(col(unity, "Status"), "Not attending");
    assert.equal(col(unity, "Reason not attending"), "Exams clash");
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
  it("restores the saved choice and phone, and a saved educator not on record", () => {
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
    assert.equal(merged.other?.name, "Ms Zainab Quill");
    assert.equal(educatorKey(merged.record[0]), "ada@riverbend.test");
  });
});

describe("nameKey", () => {
  it("ignores titles, punctuation, case, repeats and word order", () => {
    assert.equal(nameKey("MR. ADA NWOSU"), nameKey("Ada Nwosu Nwosu"));
    assert.equal(nameKey("Mr. Femi Testa"), nameKey("Mr. Testa Femi"));
    assert.equal(nameKey("Dr Femi Testa"), "femi testa");
  });

  it("still tells different people apart", () => {
    assert.notEqual(nameKey("Mrs Ada Nwosu"), nameKey("Mrs Ada Okafor"));
  });
});

describe("educatorsOnRecord duplicate matching", () => {
  it("lists a teacher once when their portal account has another email and spelling", () => {
    const list = educatorsOnRecord(
      {
        "Teacher Full Name": "Ada Nwosu Nwosu",
        "Teacher Number": "0803 123 4567",
        "Teacher Email Address": "ada@riverbend.test",
        "Principal Full Name": "Mr. Femi Testa",
        "Principal Email Address": "femi@riverbend.test",
      },
      [
        { full_name: "MR. ADA NWOSU", email: "ada.nwosu@mail.test" },
        { full_name: "Mr. Testa Femi", email: "testa@mail.test" },
      ],
    );
    assert.deepEqual(
      list.map((e) => [e.name, e.role]),
      [
        ["Ada Nwosu Nwosu", "teacher"],
        ["Mr. Femi Testa", "principal"],
      ],
    );
  });
});

describe("campAttendees", () => {
  const DETAILS = {
    "Student Rep 1 Full Name": "Tobi Adeyemi",
    "Student Rep 1 Gender": "Male",
    "Student Rep 1 Class": "SS2",
    "Student Rep 1 DOB": "2010-11-02",
    "Student Rep 1 Guardian Name": "Mr Adeyemi",
    "Student Rep 1 Guardian Number": "08031112222",
    "Student Rep 2 Full Name": "Kemi Bello",
    "Student Rep 2 Gender": "Female",
    "Student Rep 2 Class": "SS1",
    "Student Rep 3 Full Name": "Ifeoma Okafor",
    "Student Rep 3 Gender": "Female",
  };
  const school = (students: { name: string; level: string | null }[]) => ({
    schoolName: "Riverbend Academy",
    lga: "Ikenne",
    educators: [TEACHER],
    details: DETAILS,
    students,
  });
  const ARRIVAL = new Date("2026-10-26T14:00:00+01:00");

  it("takes gender, age and guardian from the entry form, matched by name not slot", () => {
    const [ade] = campAttendees([school([{ name: "ADEYEMI, Tobi", level: "SS2" }])], ARRIVAL);
    assert.equal(ade.gender, "Male");
    assert.equal(ade.age, 15);
    assert.equal(ade.guardianNumber, "08031112222");
    assert.equal(ade.lga, "Ikenne");
    assert.equal(ade.educator, "Mrs Ada Nwosu (0803 123 4567)");
  });

  it("lists the roster's students, so a rep swapped out on the form isn't listed", () => {
    const rows = campAttendees([school([{ name: "Kemi Bello", level: null }, { name: "Zainab Musa", level: "SS3" }])]);
    assert.deepEqual(
      rows.map((r) => [r.name, r.gender, r.level]),
      [
        ["Kemi Bello", "Female", "SS1"],
        ["Zainab Musa", "", "SS3"],
      ],
    );
  });

  it("falls back to the form's reps when no students are provisioned", () => {
    const rows = campAttendees([school([])]);
    assert.deepEqual(rows.map((r) => r.name), ["Ifeoma Okafor", "Kemi Bello", "Tobi Adeyemi"]);
  });

  it("guards the guardian number column so its leading zero survives", () => {
    const [header, row] = campAttendeesCsvMatrix(campAttendees([school([{ name: "Tobi Adeyemi", level: null }])]));
    const col = [...CAMP_ATTENDEE_PHONE_COLUMNS][0];
    assert.equal(header[col], "Guardian number");
    assert.equal(row[col], "08031112222");
  });
});

describe("matchRepSlots", () => {
  const FORM = ["OKAFOR CHIDI", "ADEYEMI TOLULOPE KEMI", "BELLO ADA"];

  it("matches a roster name that adds a middle name or respells one", () => {
    assert.deepEqual(
      matchRepSlots(["Okafor Chidi Emeka", "Adeyemi Tolulopa Kemi", "Ada Bello"], FORM),
      [0, 1, 2],
    );
  });

  it("does not pair siblings who share only a surname", () => {
    assert.deepEqual(matchRepSlots(["Okafor Ngozi"], FORM), [null]);
  });

  it("lets an exact name claim its slot before a near match can", () => {
    assert.deepEqual(matchRepSlots(["Bello Ada Grace", "Bello Ada"], FORM), [null, 2]);
  });
});
