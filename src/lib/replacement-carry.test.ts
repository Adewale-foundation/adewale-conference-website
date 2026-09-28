import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  examCarryOver,
  type CarryExam,
  type CarryCandidate,
  type CarryPaper,
} from "./replacement-carry";

const exam2026: CarryExam = {
  id: "e26",
  title: "Qualifying Paper 2026",
  edition_year: 2026,
  item_count: 100,
};
const exam2025: CarryExam = {
  id: "e25",
  title: "Qualifying Paper 2025",
  edition_year: 2025,
  item_count: 100,
};

const candidate = (over: Partial<CarryCandidate> = {}): CarryCandidate => ({
  exam_id: "e26",
  exam_no: "007",
  ...over,
});

const paper = (over: Partial<CarryPaper> = {}): CarryPaper => ({
  exam_id: "e26",
  total: 62,
  name_mismatch: false,
  ...over,
});

describe("examCarryOver", () => {
  it("offers the number and score of this edition's sitting", () => {
    const carry = examCarryOver([exam2026], [candidate()], [paper()], 2026);
    assert.deepEqual(carry, {
      examId: "e26",
      examTitle: "Qualifying Paper 2026",
      examNo: "007",
      total: 62,
      outOf: 100,
      nameMismatch: false,
    });
  });

  it("offers a printed number whose sheet has not been imported yet", () => {
    const carry = examCarryOver([exam2026], [candidate()], [], 2026);
    assert.equal(carry?.examNo, "007");
    assert.equal(carry?.total, null);
  });

  it("has nothing to offer when no sheet was ever printed", () => {
    assert.equal(examCarryOver([exam2026], [], [], 2026), null);
  });

  it("never offers a past edition's result", () => {
    const held = [candidate({ exam_id: "e25" })];
    const marked = [paper({ exam_id: "e25" })];
    assert.equal(examCarryOver([exam2025], held, marked, 2026), null);
  });

  it("ignores a registration with no edition", () => {
    assert.equal(examCarryOver([exam2026], [candidate()], [paper()], null), null);
  });

  it("prefers the sitting that has a captured sheet", () => {
    const second: CarryExam = { ...exam2026, id: "e26b", title: "Resit 2026" };
    const held = [candidate({ exam_id: "e26b", exam_no: "311" }), candidate()];
    const carry = examCarryOver([second, exam2026], held, [paper()], 2026);
    assert.equal(carry?.examId, "e26");
    assert.equal(carry?.examNo, "007");
  });

  it("carries the name mismatch through as the evidence it is", () => {
    const carry = examCarryOver(
      [exam2026],
      [candidate()],
      [paper({ name_mismatch: true })],
      2026,
    );
    assert.equal(carry?.nameMismatch, true);
  });
});
