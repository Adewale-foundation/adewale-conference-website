import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { csvCell, gridToObjects, inertText, parseCsvGrid, stripBom, toCsv } from "./csv";

describe("parseCsvGrid", () => {
  it("parses a plain grid", () => {
    assert.deepEqual(parseCsvGrid("a,b\n1,2"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    assert.deepEqual(parseCsvGrid('name,note\n"Doe, Jane",ok'), [
      ["name", "note"],
      ["Doe, Jane", "ok"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    assert.deepEqual(parseCsvGrid('q\n"she said ""hi"""'), [["q"], ['she said "hi"']]);
  });

  it("keeps newlines inside quoted fields", () => {
    assert.deepEqual(parseCsvGrid('a,b\n"line1\nline2",x'), [
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("handles CRLF line endings", () => {
    assert.deepEqual(parseCsvGrid("a,b\r\n1,2\r\n"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  // The original parser lacked this, so a file exported from our own /export
  // route (which prepends a BOM) came back with a first header of "﻿mode"
  // and that column silently never matched.
  it("strips a leading BOM so the first header still matches", () => {
    const grid = parseCsvGrid("﻿mode,subject\npractice,Maths");
    assert.equal(grid[0][0], "mode");
  });

  it("drops fully blank lines anywhere in the file", () => {
    assert.deepEqual(parseCsvGrid("a\n\n1\n \n2"), [["a"], ["1"], ["2"]]);
  });

  it("returns an empty grid for empty input", () => {
    assert.deepEqual(parseCsvGrid(""), []);
  });

  it("does not lose a final row without a trailing newline", () => {
    assert.equal(parseCsvGrid("a,b\n1,2").length, 2);
  });
});

describe("gridToObjects", () => {
  it("keys cells by header and numbers data rows from 1", () => {
    const rows = gridToObjects([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
    assert.deepEqual(rows[0], { __row: 1, a: "1", b: "2" });
    assert.equal(rows[1].__row, 2);
  });

  it("trims header whitespace", () => {
    const rows = gridToObjects([[" a ", "b"], ["1", "2"]]);
    assert.equal(rows[0].a, "1");
  });

  it("suffixes duplicate headers instead of shadowing them", () => {
    const rows = gridToObjects([
      ["score", "score"],
      ["1", "2"],
    ]);
    assert.equal(rows[0].score, "1");
    assert.equal(rows[0].score__2, "2");
  });

  it("reads missing trailing cells as empty strings", () => {
    const rows = gridToObjects([
      ["a", "b", "c"],
      ["1"],
    ]);
    assert.equal(rows[0].b, "");
    assert.equal(rows[0].c, "");
  });

  it("returns nothing when there are no data rows", () => {
    assert.deepEqual(gridToObjects([["a", "b"]]), []);
    assert.deepEqual(gridToObjects([]), []);
  });
});

describe("csvCell", () => {
  it("leaves a plain value unquoted", () => {
    assert.equal(csvCell("abc"), "abc");
  });

  it("quotes and escapes when the value contains a delimiter or quote", () => {
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  });

  it("renders null and undefined as empty", () => {
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
  });

  it("keeps numbers numeric-looking", () => {
    assert.equal(csvCell(0), "0");
  });

  it("wraps in a formula guard only when asked, and never for an empty cell", () => {
    assert.equal(csvCell("00123", true), '"=""00123"""');
    assert.equal(csvCell("", true), "");
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and no BOM by default", () => {
    assert.equal(
      toCsv([
        ["a", "b"],
        ["1", "2"],
      ]),
      "a,b\r\n1,2",
    );
  });

  it("prepends a BOM when asked", () => {
    assert.equal(toCsv([["a"]], { bom: true }).charCodeAt(0), 0xfeff);
  });

  it("applies the formula guard to data rows only, never the header", () => {
    const out = toCsv(
      [
        ["Phone"],
        ["00123"],
      ],
      { formulaGuardColumns: new Set([0]) },
    );
    assert.equal(out, 'Phone\r\n"=""00123"""');
  });

  it("round-trips through the parser", () => {
    const matrix = [
      ["name", "note"],
      ["Doe, Jane", 'said "hi"'],
    ];
    assert.deepEqual(parseCsvGrid(toCsv(matrix, { bom: true })), matrix);
  });
});

describe("stripBom", () => {
  it("removes one leading BOM and leaves other text alone", () => {
    assert.equal(stripBom("﻿abc"), "abc");
    assert.equal(stripBom("abc"), "abc");
    assert.equal(stripBom(""), "");
  });
});

describe("inertText", () => {
  it("defuses text that a spreadsheet would run as a formula", () => {
    for (const bad of ["=HYPERLINK(\"x\")", "+1+1", "-2+3", "@SUM(A1)", "\tx", "\rx"]) {
      assert.equal(inertText(bad), `'${bad}`);
    }
  });

  it("leaves ordinary text and empties alone", () => {
    assert.equal(inertText("Go Riverbend!"), "Go Riverbend!");
    assert.equal(inertText("a=b"), "a=b");
    assert.equal(inertText(""), "");
    assert.equal(inertText(null), "");
  });
});
