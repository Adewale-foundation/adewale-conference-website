import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readSession, sessionExpiry, signSession } from "./centre-lead-session";
import { readSignedValue, signValue } from "./signed-cookie";

const SECRET = "test-secret-not-a-real-one";
const OTHER = "a-different-secret";
const LEAD = "6f1b9c4e-0000-4000-8000-000000000001";
const NOW = 1_758_400_000_000;

describe("signSession / readSession", () => {
  it("round-trips a live session", () => {
    const cookie = signSession(LEAD, NOW + 60_000, SECRET);
    assert.equal(readSession(cookie, SECRET, NOW), LEAD);
  });

  it("refuses a cookie signed with another secret", () => {
    const cookie = signSession(LEAD, NOW + 60_000, OTHER);
    assert.equal(readSession(cookie, SECRET, NOW), null);
  });

  it("refuses a cookie whose lead id was swapped for another", () => {
    const cookie = signSession(LEAD, NOW + 60_000, SECRET);
    const [, expiry, signature] = cookie.split(".");
    const forged = `6f1b9c4e-0000-4000-8000-000000000002.${expiry}.${signature}`;
    assert.equal(readSession(forged, SECRET, NOW), null);
  });

  it("refuses a cookie whose expiry was pushed out", () => {
    const cookie = signSession(LEAD, NOW - 1, SECRET);
    const [leadId, , signature] = cookie.split(".");
    assert.equal(readSession(`${leadId}.${NOW + 999_999}.${signature}`, SECRET, NOW), null);
  });

  it("refuses an expired session", () => {
    const cookie = signSession(LEAD, NOW - 1, SECRET);
    assert.equal(readSession(cookie, SECRET, NOW), null);
  });

  it("treats the expiry moment itself as expired", () => {
    const cookie = signSession(LEAD, NOW, SECRET);
    assert.equal(readSession(cookie, SECRET, NOW), null);
  });

  it("refuses malformed, empty and missing cookies", () => {
    for (const value of ["", "junk", "a.b", "a.b.c.d", undefined, null]) {
      assert.equal(readSession(value, SECRET, NOW), null);
    }
  });

  it("refuses everything when no secret is configured", () => {
    const cookie = signSession(LEAD, NOW + 60_000, SECRET);
    assert.equal(readSession(cookie, "", NOW), null);
  });

  it("will not mint a session without a secret", () => {
    assert.throws(() => signSession(LEAD, NOW + 60_000, ""), /FELLOWS_SHEET_SECRET/);
  });

  // The secret is also a bearer token sent to the Fellows sheet webhook, so the
  // signing key is derived from it rather than being it.
  it("does not sign with the raw secret", () => {
    const [, , signature] = signSession(LEAD, NOW + 60_000, SECRET).split(".");
    const raw = createHmac("sha256", SECRET).update(`${LEAD}.${NOW + 60_000}`).digest("base64url");
    assert.notEqual(signature, raw);
  });
});

describe("signed-cookie purposes", () => {
  // Pins the derivation the centre cookie used before it moved to signed-cookie.ts,
  // so leads signed in on the day of a deploy stay signed in.
  it("still signs exactly as the original centre-lead cookie did", () => {
    const key = createHmac("sha256", SECRET).update("centre-lead-session-v1").digest();
    const payload = `${LEAD}.${NOW + 60_000}`;
    const expected = createHmac("sha256", key).update(payload).digest("base64url");
    assert.equal(signSession(LEAD, NOW + 60_000, SECRET), `${payload}.${expected}`);
  });

  it("never accepts a value minted for another purpose", () => {
    const finale = signValue(LEAD, NOW + 60_000, SECRET, "finale-supporter-v1");
    assert.equal(readSession(finale, SECRET, NOW), null);
    const centre = signSession(LEAD, NOW + 60_000, SECRET);
    assert.equal(readSignedValue(centre, SECRET, "finale-supporter-v1", NOW), null);
    assert.equal(readSignedValue(finale, SECRET, "finale-supporter-v1", NOW), LEAD);
  });

  it("refuses an id that would break the format", () => {
    assert.throws(() => signValue("a.b", NOW + 60_000, SECRET, "x"), /dot/);
    assert.throws(() => signValue("", NOW + 60_000, SECRET, "x"), /empty/);
  });
});

describe("sessionExpiry", () => {
  it("covers a full exam day from early setup", () => {
    assert.equal(sessionExpiry(NOW), NOW + 16 * 60 * 60 * 1000);
  });
});
