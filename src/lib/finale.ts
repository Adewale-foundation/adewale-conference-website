import { inertText } from "@/lib/csv";
import type {
  FinalePublicStatus,
  FinaleSettings,
  FinaleSupporter,
  FinaleTeam,
  FinaleTeamColor,
} from "@/supabase/types";

export const FINALE_BASE = "/finale";
export const FINALE_COOKIE = "asc_finale_supporter";
export const FINALE_COOKIE_PURPOSE = "finale-supporter-v1";
export const FINALE_COOKIE_DAYS = 60;

export const TEAM_SHARE = 0.7;
export const FUND_SPLIT = { champion: 0.6, runnerUp: 0.25, semi: 0.075 } as const;

/** Readable on the cream background; the same keys the database checks. */
export const TEAM_COLORS: Record<FinaleTeamColor, string> = {
  teal: "#13968A",
  coral: "#D2553A",
  indigo: "#4F5FD6",
  green: "#4C8A1F",
  plum: "#8E3B8A",
  amber: "#B7791F",
};

// ── Text from the public ────────────────────────────────────────────────────

// Control, zero-width and bidi-override characters: invisible, and the last
// can make a name render as something other than what was stored.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁯﻿]/g;

export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(INVISIBLE, "").replace(/\s+/g, " ").trim() : "";
}

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|xyz|me|link|ly|co|app|site|info)\b)/i;
const EMAIL = /\S+@\S+\.\S+/;
const PHONE_LIKE = /(\d[\s.\-()]*){7,}/;
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", $: "s" };
// Deliberately short: anything it misses is hidden by an admin afterwards.
const BLOCKED = new Set([
  "fuck", "fucking", "shit", "bitch", "bastard", "asshole", "dick", "pussy", "slut", "whore",
  // Not "ode": it is also a town name across Ogun (Ode-Remo, Ode-Lemo).
  "mumu", "olodo", "ashawo", "yeye", "werey", "idiot", "stupid",
]);

function hasBlockedWord(text: string): boolean {
  const folded = text.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] ?? c);
  return folded.split(/[^a-z]+/).some((w) => BLOCKED.has(w));
}

/** Whether public text may show straight away. A held supporter is shown as
 *  anonymous until an admin looks; they are not told, so the filter can't be probed. */
export function publicStatusFor(...texts: (string | null | undefined)[]): FinalePublicStatus {
  const flagged = texts.some(
    (t) => !!t && (LINK.test(t) || EMAIL.test(t) || PHONE_LIKE.test(t) || hasBlockedWord(t)),
  );
  return flagged ? "held" : "visible";
}

/** The name the public may see for a supporter. */
export function publicName(s: Pick<FinaleSupporter, "display_name" | "public_status">): string {
  return s.public_status === "visible" && s.display_name ? s.display_name : "Anonymous supporter";
}

// ── Phones ──────────────────────────────────────────────────────────────────

/** A Nigerian mobile number as +234XXXXXXXXXX, or null. Mirrors the
 *  finale_supporters.phone check in SQL. */
export function normalizeNgPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const compact = raw.replace(/[\s().\-]/g, "");
  if (!/^\+?\d{10,14}$/.test(compact)) return null;
  let n = compact.replace(/^\+/, "");
  if (n.startsWith("234")) n = n.slice(3);
  if (n.startsWith("0")) n = n.slice(1);
  return /^(70|80|81|90|91)\d{8}$/.test(n) ? `+234${n}` : null;
}

/** "+234 803 *** 4567" — enough for an admin to match a caller, not to copy. */
export function maskPhone(e164: string): string {
  const m = /^\+234(\d{3})\d{3}(\d{4})$/.exec(e164);
  return m ? `+234 ${m[1]} *** ${m[2]}` : "***";
}

// ── Joining ─────────────────────────────────────────────────────────────────

export type SupportInput = {
  teamId: unknown;
  pickSemi1: unknown;
  pickSemi2: unknown;
  pickChampion: unknown;
  name: unknown;
  anonymous: boolean;
  cheer: unknown;
  phone: unknown;
  consent: boolean;
};

export type SupportValue = {
  teamId: string;
  pickSemi1: string;
  pickSemi2: string;
  pickChampion: string;
  displayName: string | null;
  phone: string;
  cheer: string | null;
  publicStatus: FinalePublicStatus;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** `teams` must be this edition's teams, so every id the form sends is checked
 *  against them rather than trusted. */
export function validateSupport(input: SupportInput, teams: Pick<FinaleTeam, "id" | "semi">[]): Result<SupportValue> {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const pick = (v: unknown) => (typeof v === "string" ? byId.get(v) : undefined);

  const team = pick(input.teamId);
  if (!team) return { ok: false, error: "Choose a team to support." };
  const semi1 = pick(input.pickSemi1);
  const semi2 = pick(input.pickSemi2);
  if (semi1?.semi !== 1 || semi2?.semi !== 2) {
    return { ok: false, error: "Pick a winner for both semi-finals." };
  }
  const champion = pick(input.pickChampion);
  if (!champion || (champion.id !== semi1.id && champion.id !== semi2.id)) {
    return { ok: false, error: "Pick your champion from your two semi-final winners." };
  }

  const name = cleanText(input.name);
  if (!input.anonymous && !name) return { ok: false, error: "Enter your name, or choose to stay anonymous." };
  if (name.length > 40) return { ok: false, error: "Keep your name to 40 characters." };
  const cheer = cleanText(input.cheer);
  if (cheer.length > 80) return { ok: false, error: "Keep your cheer to 80 characters." };

  const phone = normalizeNgPhone(input.phone);
  if (!phone) return { ok: false, error: "Enter a Nigerian mobile number, like 0803 123 4567." };
  if (!input.consent) return { ok: false, error: "Tick the box to agree to how we use your number." };

  const displayName = input.anonymous ? null : name;
  return {
    ok: true,
    value: {
      teamId: team.id,
      pickSemi1: semi1.id,
      pickSemi2: semi2.id,
      pickChampion: champion.id,
      displayName,
      phone,
      cheer: cheer || null,
      publicStatus: publicStatusFor(displayName, cheer),
    },
  };
}

// ── Pledges ─────────────────────────────────────────────────────────────────
// Taken on a Paystack Payment Page, so this site never sees a card, a key or a
// payment. Only the page's address is stored. Mirrors finale_settings.pledge_url.
const PLEDGE_URL = /^https:\/\/(paystack\.com\/pay|paystack\.shop(\/pay)?)\/[A-Za-z0-9_-]+$/;

export function validPledgeUrl(url: string): boolean {
  return PLEDGE_URL.test(url);
}

/** Static routes under /finale that a team slug would shadow. */
export const RESERVED_SLUGS = new Set(["me", "about", "leaders", "join"]);

export function validTeamSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 40 && !RESERVED_SLUGS.has(slug);
}

/** The team's link name, from its display name: "The Hilltop Int'l School" → "the-hilltop-intl-school". */
export function teamSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  if (!base) return "team";
  return RESERVED_SLUGS.has(base) ? `${base}-school` : base;
}

// ── The game ────────────────────────────────────────────────────────────────

export type VotingState = "open" | "closed" | "decided";

export function votingState(
  settings: Pick<FinaleSettings, "is_open" | "closes_at" | "champion_team_id"> | null,
  now: Date = new Date(),
): VotingState {
  if (!settings) return "closed";
  if (settings.champion_team_id) return "decided";
  if (!settings.is_open) return "closed";
  if (settings.closes_at && now >= new Date(settings.closes_at)) return "closed";
  return "open";
}

/** The pledge link shows until the champion is known, even after joining closes. */
export function pledgeLink(settings: Pick<FinaleSettings, "champion_team_id" | "pledge_url"> | null): string | null {
  return settings?.pledge_url && !settings.champion_team_id && validPledgeUrl(settings.pledge_url) ? settings.pledge_url : null;
}

type Results = Pick<FinaleSettings, "semi1_winner_id" | "semi2_winner_id" | "champion_team_id">;
type Picks = Pick<FinaleSupporter, "pick_semi1" | "pick_semi2" | "pick_champion">;

/** 1 per semi-final, 2 for the champion. Mirrors finale_leaders() in SQL. */
export function bracketScore(p: Picks, r: Results | null): number {
  if (!r) return 0;
  return (
    (r.semi1_winner_id && p.pick_semi1 === r.semi1_winner_id ? 1 : 0) +
    (r.semi2_winner_id && p.pick_semi2 === r.semi2_winner_id ? 1 : 0) +
    (r.champion_team_id && p.pick_champion === r.champion_team_id ? 2 : 0)
  );
}

export function anyResult(r: Results | null): boolean {
  return !!(r?.semi1_winner_id || r?.semi2_winner_id || r?.champion_team_id);
}

/** Every admin-entered result must name a team in the right place: a semi-final
 *  winner from that semi-final, and the champion from the two winners. */
export function validateResults(
  r: Results,
  teams: Pick<FinaleTeam, "id" | "semi">[],
): { ok: true } | { ok: false; error: string } {
  const semi = (id: string | null) => teams.find((t) => t.id === id)?.semi;
  if (r.semi1_winner_id && semi(r.semi1_winner_id) !== 1) return { ok: false, error: "Semi-final 1's winner must be a Semi-final 1 team." };
  if (r.semi2_winner_id && semi(r.semi2_winner_id) !== 2) return { ok: false, error: "Semi-final 2's winner must be a Semi-final 2 team." };
  if (r.champion_team_id) {
    if (!r.semi1_winner_id || !r.semi2_winner_id) return { ok: false, error: "Record both semi-final winners before the champion." };
    if (r.champion_team_id !== r.semi1_winner_id && r.champion_team_id !== r.semi2_winner_id) {
      return { ok: false, error: "The champion must be one of the two semi-final winners." };
    }
  }
  return { ok: true };
}

// ── Display ─────────────────────────────────────────────────────────────────

export const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/** The Champions' Fund as shown publicly: the sum of what each school has been pledged. */
export function pledgedTotal(teams: Pick<FinaleTeam, "pledged">[]): number {
  return teams.reduce((sum, t) => sum + (t.pledged ?? 0), 0);
}
export const possessive = (name: string) => `${name}${name.endsWith("s") ? "'" : "'s"}`;

// ── Exports ─────────────────────────────────────────────────────────────────

const SUPPORTER_HEADERS = [
  "Rank", "Score", "Name", "Phone", "Team", "Semi-final 1 pick", "Semi-final 2 pick", "Champion pick",
  "Cheer", "Public status", "Joined",
];
export const FINALE_SUPPORTER_PHONE_COLUMNS = new Set([SUPPORTER_HEADERS.indexOf("Phone")]);

/** Ranked as finale_leaders() ranks: score, then who joined first. */
export function finaleSupportersCsvMatrix(
  rows: FinaleSupporter[],
  teams: Pick<FinaleTeam, "id" | "name">[],
  results: Results | null,
): (string | number)[][] {
  const name = new Map(teams.map((t) => [t.id, t.name]));
  const ranked = rows
    .map((r) => ({ r, score: bracketScore(r, results) }))
    .sort((a, b) => b.score - a.score || a.r.created_at.localeCompare(b.r.created_at) || a.r.id.localeCompare(b.r.id));
  return [
    SUPPORTER_HEADERS,
    ...ranked.map(({ r, score }, i) => [
      i + 1,
      score,
      inertText(r.display_name ?? "(anonymous)"),
      r.phone,
      name.get(r.team_id) ?? "",
      name.get(r.pick_semi1) ?? "",
      name.get(r.pick_semi2) ?? "",
      name.get(r.pick_champion) ?? "",
      inertText(r.cheer),
      r.public_status,
      r.created_at,
    ]),
  ];
}
