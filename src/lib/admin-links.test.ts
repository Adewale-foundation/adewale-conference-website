import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REGISTRATION_BASE, registrationForEdition, registrationHref, safeBack } from "./admin-links";

describe("registrationHref", () => {
  it("links to the registration, carrying where the admin came from", () => {
    assert.equal(registrationHref("reg-1"), "/portal/admin/registrations/reg-1");
    assert.equal(
      registrationHref("reg-1", "/portal/admin/participants/camp?edition=2026&status=attending"),
      "/portal/admin/registrations/reg-1?from=%2Fportal%2Fadmin%2Fparticipants%2Fcamp%3Fedition%3D2026%26status%3Dattending",
    );
  });
});

describe("safeBack", () => {
  it("returns to the admin page the link came from, named after it", () => {
    assert.deepEqual(safeBack("/portal/admin/participants/camp?edition=2026"), {
      href: "/portal/admin/participants/camp?edition=2026",
      label: "Camp",
    });
    assert.equal(safeBack("/portal/admin/participants?view=groups").label, "Participants");
    assert.equal(safeBack("/portal/admin/schools/duplicates").label, "Duplicate schools");
    assert.equal(safeBack("/portal/admin/attendance/centre-abk").label, "Attendance");
  });

  it("keeps a filtered registrations list", () => {
    assert.deepEqual(safeBack("/portal/admin/registrations?q=riverbend"), {
      href: "/portal/admin/registrations?q=riverbend",
      label: "Registrations",
    });
  });

  it("falls back to the registrations list for anything outside the admin portal", () => {
    const fallback = { href: REGISTRATION_BASE, label: "Registrations" };
    for (const bad of [
      undefined,
      "",
      "https://example.com",
      "//example.com/portal/admin/",
      "/portal/admin//example.com",
      "/portal/admin/\\example.com",
      "/portal/school/camp",
      "/portal/administrator",
      "javascript:alert(1)",
    ]) {
      assert.deepEqual(safeBack(bad), fallback, String(bad));
    }
  });

  it("doesn't chain one registration's page back to another", () => {
    assert.deepEqual(safeBack("/portal/admin/registrations/reg-2?from=/portal/admin/schools"), {
      href: REGISTRATION_BASE,
      label: "Registrations",
    });
  });

  it("labels an admin page it doesn't know generically", () => {
    assert.deepEqual(safeBack("/portal/admin/labs"), { href: "/portal/admin/labs", label: "Back" });
  });
});

describe("registrationForEdition", () => {
  const regs = [
    { id: "r2025", edition_year: 2025 },
    { id: "r2026", edition_year: 2026 },
    { id: "rnull", edition_year: null },
  ];

  it("picks the edition asked for", () => {
    assert.equal(registrationForEdition(regs, 2025)?.id, "r2025");
    assert.equal(registrationForEdition(regs, 2024), null);
  });

  it("picks the newest when no edition is given", () => {
    assert.equal(registrationForEdition(regs)?.id, "r2026");
    assert.equal(registrationForEdition([{ id: "rnull", edition_year: null }])?.id, "rnull");
  });

  it("is null for a school that never registered", () => {
    assert.equal(registrationForEdition([]), null);
    assert.equal(registrationForEdition(null), null);
  });
});
