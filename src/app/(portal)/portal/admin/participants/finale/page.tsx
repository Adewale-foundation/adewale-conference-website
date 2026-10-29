import Link from "next/link";
import { Card, PortalBody, PortalHeader, StatTile } from "@/components/portal/ui";
import ActionForm from "@/components/portal/action-form";
import { SubmitButton } from "@/components/portal/submit-button";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { Select } from "@/components/ui/select";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatCampDate, isoToLagosInput } from "@/lib/camp";
import { FINALE_BASE, TEAM_COLORS, maskPhone, naira, pledgedTotal, votingState } from "@/lib/finale";
import { FINALE_YEAR, finaleDb, loadFinale, type FinaleTeamView } from "@/lib/finale-data";
import { loadCampRoster } from "@/lib/camp-data";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import type { FinalePublicStatus, FinaleSupporter, FinaleTeamColor } from "@/supabase/types";
import { removeSupporterEntry, saveFinaleResults, saveFinaleSettings, saveFinaleTeam, setSupporterVisibility } from "./actions";

export const metadata = pageMetadata("Grand Finale fan vote", "Teams, results and moderation for the fan vote.");
export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-foreground/5";
const labelCls = "text-[11px] uppercase tracking-[0.2em] text-muted-foreground";
const chip = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-bold ${active ? "bg-secondary text-secondary-foreground" : "border border-foreground/10 bg-card text-muted-foreground"}`;

const VISIBILITY: { key: FinalePublicStatus; label: string }[] = [
  { key: "held", label: "Held for review" },
  { key: "visible", label: "Showing" },
  { key: "hidden", label: "Hidden" },
];

export default async function AdminFinale({
  searchParams,
}: {
  searchParams: Promise<{ cheers?: string }>;
}) {
  await requireModuleView("participants");
  const canManage = await canManageModule("participants");
  const params = await searchParams;
  const cheerFilter = VISIBILITY.find((v) => v.key === params.cheers)?.key ?? "held";
  const year = FINALE_YEAR;

  // Tallies come from finale_tally(), which only the service role may call; this
  // page has already passed requireModuleView, and renders aggregates only.
  const service = finaleDb();
  if (!service) throw new Error("The fan vote needs SUPABASE_SECRET_KEY to be set.");
  const supabase = await createClient();
  const [finale, roster, heldRes, supportersRes] = await Promise.all([
    loadFinale(service, year),
    loadCampRoster(supabase, year),
    supabase.from("finale_supporters").select("id", { count: "exact", head: true }).eq("edition_year", year).eq("public_status", "held"),
    supabase
      .from("finale_supporters")
      .select("id, team_id, display_name, cheer, phone, public_status, created_at")
      .eq("edition_year", year)
      .eq("public_status", cheerFilter)
      .or(cheerFilter === "visible" ? "cheer.not.is.null,display_name.not.is.null" : "id.not.is.null")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const loadError = finale.error ?? roster.error ?? heldRes.error?.message ?? supportersRes.error?.message;
  if (loadError) throw new Error(`Could not load the fan vote: ${loadError}`);

  const { settings, teams } = finale;
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const supporters = (supportersRes.data ?? []) as Pick<FinaleSupporter, "id" | "team_id" | "display_name" | "cheer" | "phone" | "public_status" | "created_at">[];
  const totalSupporters = teams.reduce((s, t) => s + t.supporters, 0);
  const state = votingState(settings);
  // Finalists come from the schools at camp.
  const attending = roster.rows.filter((r) => r.status === "attending");
  const schoolOptions = (attending.length ? attending : roster.rows).map((r) => ({ id: r.registrationId, name: r.schoolName }));
  const href = (extra: Record<string, string>) =>
    `/portal/admin/participants/finale?${new URLSearchParams({ cheers: cheerFilter, ...extra })}`;

  return (
    <>
      <PortalHeader title="Grand Finale fan vote" subtitle={`ASC ${year}: supporters, brackets and the optional Champions' Fund.`} />
      <PortalBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/portal/admin/participants" className="text-sm text-muted-foreground hover:text-foreground">← Participants</Link>
          <div className="flex items-center gap-3">
            <a href={FINALE_BASE} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-gold-ink hover:underline">
              Open the public page ↗
            </a>
            {!canManage ? <ReadOnlyBadge /> : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatTile label="Supporters" value={totalSupporters.toLocaleString("en-NG")} />
          <StatTile label="Held for review" value={heldRes.count ?? 0} />
          <StatTile label="Champions' Fund (as entered)" value={naira(pledgedTotal(teams))} />
        </div>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-foreground">Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Joining is {state === "open" ? "open" : state === "decided" ? "over: the champion is recorded" : "closed"}. Times are Lagos time.
            Pledges are taken on your Paystack Payment Page, where payers type their school&apos;s name in a &ldquo;Team&rdquo; field. Add up each school&apos;s payments there and enter them under Teams; the public fund total is their sum.
          </p>
          <ActionForm action={saveFinaleSettings.bind(null, year)} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
              <input type="checkbox" name="is_open" defaultChecked={settings?.is_open ?? false} disabled={!canManage} />
              Let supporters join
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Joining closes</span>
              <input name="closes_at" type="datetime-local" defaultValue={isoToLagosInput(settings?.closes_at)} disabled={!canManage} className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Number of prize winners</span>
              <input name="reward_count" type="number" min={1} max={500} defaultValue={settings?.reward_count ?? 20} disabled={!canManage} className={inputCls} />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className={labelCls}>Prizes (shown publicly, no cash)</span>
              <textarea
                name="reward_text"
                rows={2}
                maxLength={500}
                defaultValue={settings?.reward_text ?? ""}
                placeholder="Front-row seats at the final, your name on the big screen and a photo with the champions."
                disabled={!canManage}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelCls}>Paystack Payment Page (optional)</span>
              <input name="pledge_url" type="url" defaultValue={settings?.pledge_url ?? ""} placeholder="https://paystack.shop/pay/…" disabled={!canManage} className={inputCls} />
            </label>
            {canManage ? (
              <div className="sm:col-span-2">
                <SubmitButton size="sm" pendingText="Saving…">{settings ? "Save settings" : "Set up the fan vote"}</SubmitButton>
              </div>
            ) : null}
          </ActionForm>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-foreground">Teams</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the four finalists, two in each semi-final. Each gets its own link, the page people share. The link follows the
            name until the first supporter joins, then stays fixed so shared links keep working.
          </p>
          <div className="mt-4 grid gap-4">
            {teams.map((t) => (
              <TeamForm key={t.id} year={year} team={t} canManage={canManage} schoolOptions={schoolOptions} />
            ))}
            {canManage ? <TeamForm year={year} team={null} canManage schoolOptions={schoolOptions} /> : null}
          </div>
        </Card>

        {settings && teams.length ? (
          <Card className="p-5">
            <h2 className="text-xl font-bold text-foreground">Results</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Record each winner as it happens; badges and the leaderboard update at once. Recording the champion closes joining and hides the pledge link.
            </p>
            <ActionForm action={saveFinaleResults.bind(null, year)} className="mt-4 grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["semi1_winner_id", "Semi-final 1 winner", teams.filter((t) => t.semi === 1), settings.semi1_winner_id],
                  ["semi2_winner_id", "Semi-final 2 winner", teams.filter((t) => t.semi === 2), settings.semi2_winner_id],
                  ["champion_team_id", "Champion", teams, settings.champion_team_id],
                ] as const
              ).map(([name, label, options, value]) => (
                <label key={name} className="block space-y-1">
                  <span className={labelCls}>{label}</span>
                  <Select name={name} defaultValue={value ?? ""} disabled={!canManage} className="w-full">
                    <option value="">Not played yet</option>
                    {options.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                </label>
              ))}
              {canManage ? (
                <div className="sm:col-span-3">
                  <SubmitButton size="sm" pendingText="Saving…">Save results</SubmitButton>
                </div>
              ) : null}
            </ActionForm>
          </Card>
        ) : null}

        {canManage ? (
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <span className="text-sm text-muted-foreground">The export includes phone numbers. Use it to contact the prize winners, and keep it off shared drives.</span>
            <a href="/portal/admin/participants/finale/export" className="text-xs uppercase tracking-[0.2em] text-primary hover:underline">
              Supporters, ranked ↓
            </a>
          </Card>
        ) : null}

        {canManage ? (
          <Card className="p-5">
            <h2 className="text-xl font-bold text-foreground">Fix a mistaken entry</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Someone backed the wrong school? Remove their entry using the phone number they joined with, then ask them to
              join again. Their picks and cheer are removed too.
            </p>
            <ActionForm action={removeSupporterEntry.bind(null, year)} className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-56 flex-1 space-y-1">
                <span className={labelCls}>Phone number</span>
                <input name="phone" type="tel" inputMode="tel" placeholder="0803 123 4567" required className={inputCls} />
              </label>
              <ConfirmSubmitButton
                size="sm"
                variant="outline"
                destructive
                title="Remove this entry?"
                description="Their team, picks and cheer will be deleted. They can join again with the same phone."
                confirmLabel="Yes, remove"
              >
                Remove entry
              </ConfirmSubmitButton>
            </ActionForm>
          </Card>
        ) : null}

        <Card className="p-5">
          <h2 className="text-xl font-bold text-foreground">Names and cheers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cheers show straight away unless the filter holds them. A held or hidden supporter appears as &ldquo;Anonymous supporter&rdquo; everywhere public.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {VISIBILITY.map((v) => (
              <Link key={v.key} href={href({ cheers: v.key })} className={chip(v.key === cheerFilter)}>{v.label}</Link>
            ))}
          </div>
          <ul className="mt-4 divide-y divide-foreground/10">
            {supporters.length === 0 ? <li className="py-3 text-sm text-muted-foreground">Nothing here.</li> : null}
            {supporters.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 text-sm">
                  <div className="font-semibold">
                    {s.display_name ?? <span className="text-muted-foreground">(anonymous)</span>}{" "}
                    <span className="font-normal text-muted-foreground">· {teamName.get(s.team_id)} · {maskPhone(s.phone)} · {formatCampDate(s.created_at)}</span>
                  </div>
                  {s.cheer ? <p className="mt-0.5 wrap-break-word">{s.cheer}</p> : null}
                </div>
                {canManage ? (
                  <ActionForm action={setSupporterVisibility.bind(null, s.id, s.public_status === "visible" ? "hidden" : "visible")}>
                    <SubmitButton size="sm" variant="outline" pendingText="…">{s.public_status === "visible" ? "Hide" : "Show"}</SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

      </PortalBody>
    </>
  );
}

function TeamForm({
  year,
  team,
  canManage,
  schoolOptions,
}: {
  year: number;
  team: FinaleTeamView | null;
  canManage: boolean;
  schoolOptions: { id: string; name: string }[];
}) {
  return (
    <ActionForm
      action={saveFinaleTeam.bind(null, year, team?.id ?? null)}
      className="grid gap-3 rounded-lg border border-foreground/10 p-4 sm:grid-cols-6"
    >
      <label className="block space-y-1 sm:col-span-3">
        <span className={labelCls}>{team ? "School" : "Add a finalist"}</span>
        <Select name="registration_id" defaultValue={team?.registration_id ?? ""} required disabled={!canManage} className="w-full">
          <option value="" disabled>Choose a school…</option>
          {schoolOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </Select>
      </label>
      <label className="block space-y-1 sm:col-span-3">
        <span className={labelCls}>Display name (optional)</span>
        <input
          name="name"
          defaultValue={team && team.name !== team.schoolName ? team.name : ""}
          maxLength={60}
          placeholder="Leave blank to use the school's name"
          disabled={!canManage}
          className={inputCls}
        />
      </label>
      <label className="block space-y-1 sm:col-span-3">
        <span className={labelCls}>Link</span>
        <input
          value={team ? `${FINALE_BASE}/${team.slug}` : "Filled in from the name when you add the team"}
          readOnly
          disabled
          className={inputCls}
        />
      </label>
      <label className="block space-y-1">
        <span className={labelCls}>Semi-final</span>
        <Select name="semi" defaultValue={String(team?.semi ?? 1)} disabled={!canManage} className="w-full">
          <option value="1">1</option>
          <option value="2">2</option>
        </Select>
      </label>
      <label className="block space-y-1">
        <span className={labelCls}>Colour</span>
        <Select name="color" defaultValue={team?.color ?? "teal"} disabled={!canManage} className="w-full">
          {(Object.keys(TEAM_COLORS) as FinaleTeamColor[]).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </label>
      <label className="block space-y-1">
        <span className={labelCls}>Order</span>
        <input name="sort" type="number" defaultValue={team?.sort ?? 0} disabled={!canManage} className={inputCls} />
      </label>
      <label className="block space-y-1 sm:col-span-2">
        <span className={labelCls}>Pledged so far, ₦</span>
        <input
          name="pledged"
          inputMode="numeric"
          defaultValue={team?.pledged ?? ""}
          placeholder="From Paystack"
          disabled={!canManage}
          className={inputCls}
        />
      </label>
      <label className="block space-y-1 sm:col-span-4">
        <span className={labelCls}>Label (optional)</span>
        <input name="label" defaultValue={team?.label ?? ""} maxLength={60} placeholder="Quarter-final 4 winner" disabled={!canManage} className={inputCls} />
      </label>
      {canManage ? (
        <div className="flex items-center gap-3 sm:col-span-6">
          <SubmitButton size="sm" pendingText="Saving…">{team ? "Save team" : "Add team"}</SubmitButton>
          {team ? (
            <span className="text-xs text-muted-foreground">
              <span className="mr-1 inline-block size-2.5 rounded-full align-middle" style={{ background: TEAM_COLORS[team.color] }} />
              {team.supporters.toLocaleString("en-NG")} supporters
              {team.supporters ? " · link name is now fixed" : ""}
            </span>
          ) : null}
        </div>
      ) : null}
    </ActionForm>
  );
}
