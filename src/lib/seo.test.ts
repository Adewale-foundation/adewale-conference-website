import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pageMetadata } from "./seo";

describe("pageMetadata", () => {
  it("keeps the site-wide Open Graph fields a page's own openGraph would drop", () => {
    const m = pageMetadata("Fan vote", "Pick your team.", "/finale");
    assert.deepEqual(m.openGraph, {
      title: "Fan vote",
      description: "Pick your team.",
      type: "website",
      siteName: "Adewale Students Conference",
      url: "/finale",
    });
  });

  it("leaves og:url out when no path is given, rather than pointing every page at the home page", () => {
    const og = pageMetadata("About", "About ASC.").openGraph as Record<string, unknown>;
    assert.equal("url" in og, false);
    assert.equal(og.type, "website");
  });
});
