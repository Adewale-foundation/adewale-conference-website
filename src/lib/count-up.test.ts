import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countAt, parseCount } from "./count-up";

describe("parseCount", () => {
  it("splits prefix, number and suffix", () => {
    assert.deepEqual(parseCount("₦25M+"), { prefix: "₦", target: 25, suffix: "M+" });
    assert.deepEqual(parseCount("5,000+"), { prefix: "", target: 5000, suffix: "+" });
    assert.deepEqual(parseCount("19 LGAs"), { prefix: "", target: 19, suffix: " LGAs" });
  });

  it("is null for text with no number", () => {
    assert.equal(parseCount("Free entry"), null);
  });
});

describe("countAt", () => {
  it("ends on exactly the original text", () => {
    for (const text of ["₦25M+", "5,000+", "19 LGAs", "1,000", "5"]) {
      assert.equal(countAt(parseCount(text)!, 1), text);
    }
  });

  it("starts at zero and clamps out-of-range progress", () => {
    const parts = parseCount("5,000+")!;
    assert.equal(countAt(parts, 0), "0+");
    assert.equal(countAt(parts, -1), "0+");
    assert.equal(countAt(parts, 2), "5,000+");
  });
});
