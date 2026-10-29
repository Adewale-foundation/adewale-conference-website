import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FINALE_SUPPORTER_PHONE_COLUMNS,
  bracketScore,
  cleanText,
  finaleSupportersCsvMatrix,
  maskPhone,
  normalizeNgPhone,
  pledgeLink,
  pledgedTotal,
  publicName,
  publicStatusFor,
  validPledgeUrl,
  teamSlug,
  validTeamSlug,
  validateResults,
  validateSupport,
  votingState,
  type SupportInput,
} from "./finale";
import type { FinaleSupporter } from "@/supabase/types";

// Fictional fixtures — this is a public repo, no real school or student names.
const T = {
  north: { id: "11111111-1111-4111-8111-111111111111", semi: 1 as const, name: "Northern Lights" },
  river: { id: "22222222-2222-4222-8222-222222222222", semi: 1 as const, name: "Riverbend" },
  hill: { id: "33333333-3333-4333-8333-333333333333", semi: 2 as const, name: "Hilltop" },
  coast: { id: "44444444-4444-4444-8444-444444444444", semi: 2 as const, name: "Coastline Scholars" },
};
const TEAMS = Object.values(T);

function input(over: Partial<SupportInput> = {}): SupportInput {
  return {
    teamId: T.north.id,
    pickSemi1: T.north.id,
    pickSemi2: T.hill.id,
    pickChampion: T.north.id,
    name: "Tunde A.",
    anonymous: false,
    cheer: "Bring it home!",
    phone: "0803 123 4567",
    consent: true,
    ...over,
  };
}

describe("normalizeNgPhone", () => {
  it("accepts the ways Nigerians write a mobile number", () => {
    for (const raw of ["08031234567", "0803 123 4567", "+234 803 123 4567", "234-803-123-4567", "8031234567", "(0803) 123-4567", "+2340803 123 4567"]) {
      assert.equal(normalizeNgPhone(raw), "+2348031234567", raw);
    }
    assert.equal(normalizeNgPhone("0907 000 1111"), "+2349070001111");
    assert.equal(normalizeNgPhone("0701 222 3333"), "+2347012223333");
  });

  it("rejects landlines, short numbers, letters and other countries", () => {
    for (const raw of ["0123456789", "0803123456", "080312345678", "0803abc4567", "+44 7700 900123", "0603 123 4567", "", null, 8031234567]) {
      assert.equal(normalizeNgPhone(raw), null, String(raw));
    }
  });

  it("masks all but the network and the last four digits", () => {
    assert.equal(maskPhone("+2348031234567"), "+234 803 *** 4567");
    assert.equal(maskPhone("garbage"), "***");
  });
});

describe("validateSupport", () => {
  it("accepts a full entry and normalises it", () => {
    const r = validateSupport(input({ name: "  Tunde   A.  " }), TEAMS);
    assert.ok(r.ok);
    assert.deepEqual(r.value, {
      teamId: T.north.id,
      pickSemi1: T.north.id,
      pickSemi2: T.hill.id,
      pickChampion: T.north.id,
      displayName: "Tunde A.",
      phone: "+2348031234567",
      cheer: "Bring it home!",
      publicStatus: "visible",
    });
  });

  it("only accepts ids of this edition's teams", () => {
    const r = validateSupport(input({ teamId: "99999999-9999-4999-8999-999999999999" }), TEAMS);
    assert.deepEqual(r, { ok: false, error: "Choose a team to support." });
  });

  it("needs each semi-final pick from its own semi-final", () => {
    const swapped = validateSupport(input({ pickSemi1: T.hill.id, pickSemi2: T.north.id }), TEAMS);
    assert.equal(swapped.ok, false);
  });

  it("needs the champion to be one of the two semi-final picks", () => {
    const r = validateSupport(input({ pickChampion: T.coast.id }), TEAMS);
    assert.deepEqual(r, { ok: false, error: "Pick your champion from your two semi-final winners." });
  });

  it("lets a supporter stay anonymous and drops any name typed", () => {
    const r = validateSupport(input({ anonymous: true, name: "Tunde" }), TEAMS);
    assert.ok(r.ok);
    assert.equal(r.value.displayName, null);
    assert.equal(validateSupport(input({ name: "  " }), TEAMS).ok, false);
  });

  it("enforces lengths, the phone format and consent", () => {
    assert.equal(validateSupport(input({ name: "x".repeat(41) }), TEAMS).ok, false);
    assert.equal(validateSupport(input({ cheer: "x".repeat(81) }), TEAMS).ok, false);
    assert.equal(validateSupport(input({ phone: "12345" }), TEAMS).ok, false);
    assert.equal(validateSupport(input({ consent: false }), TEAMS).ok, false);
  });

  it("holds a supporter whose name or cheer carries a link, contact or insult", () => {
    const held = (over: Partial<SupportInput>) => {
      const r = validateSupport(input(over), TEAMS);
      assert.ok(r.ok);
      return r.value.publicStatus;
    };
    assert.equal(held({ cheer: "vote at www.example.test" }), "held");
    assert.equal(held({ cheer: "call me 0803 123 4567" }), "held");
    assert.equal(held({ name: "a@b.co" }), "held");
    assert.equal(held({ cheer: "you are all MUMU" }), "held");
    assert.equal(held({ cheer: "Ode-Remo stand up! Class of 2019" }), "visible");
  });
});

describe("text from the public", () => {
  it("strips invisible and direction-flipping characters", () => {
    assert.equal(cleanText("Ade‮olu​\u0007  \n x"), "Adeolu x");
    assert.equal(cleanText("line\nbreak"), "line break");
    assert.equal(cleanText(42), "");
  });

  it("catches simple letter swaps in blocked words", () => {
    assert.equal(publicStatusFor("1d10t"), "held");
    assert.equal(publicStatusFor("SH1T team"), "held");
    assert.equal(publicStatusFor(null, ""), "visible");
  });

  it("shows held, hidden and nameless supporters as anonymous", () => {
    assert.equal(publicName({ display_name: "Tunde", public_status: "visible" }), "Tunde");
    assert.equal(publicName({ display_name: "Tunde", public_status: "held" }), "Anonymous supporter");
    assert.equal(publicName({ display_name: null, public_status: "visible" }), "Anonymous supporter");
  });
});

describe("pledge link", () => {
  it("only takes a Paystack Payment Page or storefront address", () => {
    assert.equal(validPledgeUrl("https://paystack.com/pay/asc-finale"), true);
    assert.equal(validPledgeUrl("https://paystack.shop/asc"), true);
    assert.equal(validPledgeUrl("https://paystack.shop/pay/asc-finale-fund"), true);
    assert.equal(validPledgeUrl("https://paystack.shop/pay/asc/extra"), false);
    for (const bad of [
      "http://paystack.com/pay/asc",
      "https://paystack.com.evil.test/pay/asc",
      "https://evil.test/?u=https://paystack.com/pay/asc",
      "https://paystack.com/pay/asc?next=//evil.test",
      "javascript:alert(1)",
      "",
    ]) {
      assert.equal(validPledgeUrl(bad), false, bad);
    }
  });

  it("shows the link until the champion is known", () => {
    const url = "https://paystack.com/pay/asc-finale";
    assert.equal(pledgeLink({ pledge_url: url, champion_team_id: null }), url);
    assert.equal(pledgeLink({ pledge_url: url, champion_team_id: T.north.id }), null);
    assert.equal(pledgeLink({ pledge_url: null, champion_team_id: null }), null);
    assert.equal(pledgeLink(null), null);
  });
});

describe("pledgedTotal", () => {
  it("adds up each school's pledges, counting a school with none entered as zero", () => {
    assert.equal(pledgedTotal([{ pledged: 85_000 }, { pledged: null }, { pledged: 15_500 }]), 100_500);
    assert.equal(pledgedTotal([]), 0);
  });
});

describe("teamSlug", () => {
  it("makes a valid link name from any display name", () => {
    assert.equal(teamSlug("The Hilltop Int’l School"), "the-hilltop-intl-school");
    assert.equal(teamSlug("  Adéwálé  Comp. College!! "), "adewale-comp-college");
    assert.equal(teamSlug("Me"), "me-school");
    assert.equal(teamSlug("!!!"), "team");
    for (const name of ["A".repeat(80), "Coastline Scholars Sec. School, Riverbend", "x - y"]) {
      assert.equal(validTeamSlug(teamSlug(name)), true, name);
    }
  });
});

describe("validTeamSlug", () => {
  it("takes lowercase link names that no static page uses", () => {
    assert.equal(validTeamSlug("advanced-breed"), true);
    for (const bad of ["Riverbend", "me", "leaders", "a--b", "-a", "a b", "x".repeat(41)]) {
      assert.equal(validTeamSlug(bad), false, bad);
    }
  });
});

describe("votingState", () => {
  const base = { is_open: true, closes_at: "2026-11-19T09:00:00.000Z", champion_team_id: null };
  it("is open until closes_at, then closed", () => {
    assert.equal(votingState(base, new Date("2026-11-19T08:59:59Z")), "open");
    assert.equal(votingState(base, new Date("2026-11-19T09:00:00Z")), "closed");
  });
  it("is closed when switched off or not set up, and decided once there is a champion", () => {
    assert.equal(votingState({ ...base, is_open: false }), "closed");
    assert.equal(votingState(null), "closed");
    assert.equal(votingState({ ...base, champion_team_id: T.north.id }), "decided");
  });
});

describe("results and scoring", () => {
  const picks = { pick_semi1: T.north.id, pick_semi2: T.hill.id, pick_champion: T.north.id };
  const results = { semi1_winner_id: T.north.id, semi2_winner_id: T.coast.id, champion_team_id: T.north.id };

  it("scores 1 per semi-final and 2 for the champion", () => {
    assert.equal(bracketScore(picks, results), 3);
    assert.equal(bracketScore(picks, { ...results, semi2_winner_id: T.hill.id }), 4);
    assert.equal(bracketScore(picks, { semi1_winner_id: null, semi2_winner_id: null, champion_team_id: null }), 0);
    assert.equal(bracketScore(picks, null), 0);
  });

  it("only accepts results that fit the bracket", () => {
    assert.deepEqual(validateResults(results, TEAMS), { ok: true });
    assert.equal(validateResults({ ...results, semi1_winner_id: T.hill.id }, TEAMS).ok, false);
    assert.equal(validateResults({ ...results, champion_team_id: T.river.id }, TEAMS).ok, false);
    assert.equal(validateResults({ semi1_winner_id: T.north.id, semi2_winner_id: null, champion_team_id: T.north.id }, TEAMS).ok, false);
  });

  it("exports supporters ranked by score then join time, with formulas defused", () => {
    const row = (id: string, created: string, over: Partial<FinaleSupporter> = {}): FinaleSupporter => ({
      id, edition_year: 2026, team_id: T.north.id, ...picks, display_name: "Ada", phone: "+2348031234567",
      cheer: null, public_status: "visible", created_at: created, ...over,
    });
    const [header, first, second, third] = finaleSupportersCsvMatrix(
      [
        row("c", "2026-11-01T10:00:00Z", { pick_semi2: T.coast.id, display_name: "=HYPERLINK(1)" }),
        row("a", "2026-11-02T10:00:00Z"),
        row("b", "2026-11-03T10:00:00Z", { pick_semi2: T.coast.id }),
      ],
      TEAMS,
      results,
    );
    assert.deepEqual([first[0], first[1], first[2]], [1, 4, "'=HYPERLINK(1)"]);
    assert.deepEqual([second[0], second[1]], [2, 4]);
    assert.deepEqual([third[0], third[1]], [3, 3]);
    assert.equal(header[[...FINALE_SUPPORTER_PHONE_COLUMNS][0]], "Phone");
  });
});
