import Link from "next/link";
import { Card, PortalBody, PortalHeader, StatTile } from "@/components/portal/ui";
import ActionForm from "@/components/portal/action-form";
import { SubmitButton } from "@/components/portal/submit-button";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { Select } from "@/components/ui/select";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  CAMP_INVITE_LABEL,
  CAMP_STATUS_LABEL,
  campCounts,
  formatCampDate,
  goingSummary,
  isoToLagosInput,
  type CampRosterStatus,
} from "@/lib/camp";
import { loadCampRoster } from "@/lib/camp-data";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { addCampSchool, removeCampSchool, saveCampConfirmation, saveCampSettings } from "./actions";

export const metadata = pageMetadata("ASC Camp", "Camp confirmations from qualified schools.");
export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-foreground/5";
const labelCls = "text-[11px] uppercase tracking-[0.2em] text-muted-foreground";
const FILTERS: (CampRosterStatus | "all" | "manual")[] = ["all", "no_response", "attending", "not_attending", "released", "manual"];
const ENTRY_LABEL: Record<string, string> = {
  verified: "accepted, not qualified",
  submitted: "entry under review",
  declined: "entry declined",
};
const TONE: Record<CampRosterStatus, string> = {
  attending: "bg-green-600/10 text-green-800",
  not_attending: "bg-red-600/10 text-red-800",
  no_response: "bg-amber-500/15 text-amber-900",
  released: "bg-foreground/10 text-muted-foreground",
};

export default async function AdminCamp({
  searchParams,
}: {
  searchParams: Promise<{ edition?: string; status?: string }>;
}) {
  await requireModuleView("participants");
  const canManage = await canManageModule("participants");
  const { edition, status: statusParam } = await searchParams;
  const supabase = await createClient();

  const { data: editionRows, error: editionError } = await supabase
    .from("editions")
    .select("year")
    .order("year", { ascending: false });
  if (editionError) throw new Error(`Could not load editions: ${editionError.message}`);
  const years = (editionRows ?? []).map((e) => e.year as number);
  const year = (edition ? Number(edition) || null : null) ?? years[0] ?? null;
  const editable = canManage && year != null && year === years[0];

  const { settings, rows, candidates, error } = year
    ? await loadCampRoster(supabase, year)
    : { settings: null, rows: [], candidates: [], error: null };
  if (error) throw new Error(`Could not load the camp roster: ${error}`);

  const counts = campCounts(rows);
  const filter = FILTERS.find((f) => f === statusParam) ?? "all";
  const shown =
    filter === "all"
      ? rows
      : filter === "manual"
        ? rows.filter((r) => r.source === "manual")
        : rows.filter((r) => r.status === filter);
  const href = (extra: Record<string, string>) =>
    `/portal/admin/participants/camp?${new URLSearchParams({ ...(year ? { edition: String(year) } : {}), ...extra })}`;

  return (
    <>
      <PortalHeader title="ASC Camp" subtitle="Who has secured their place, and who still needs a nudge." />
      <PortalBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/portal/admin/participants${year ? `?edition=${year}` : ""}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Participants
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {years.map((y) => (
              <Link
                key={y}
                href={`/portal/admin/participants/camp?edition=${y}`}
                className={`rounded-full px-3 py-1 text-xs font-bold ${y === year ? "bg-secondary text-secondary-foreground" : "border border-foreground/10 text-muted-foreground"}`}
              >
                {y}
              </Link>
            ))}
            {!canManage ? <ReadOnlyBadge /> : null}
          </div>
        </div>

        {year ? (
          <Card className="p-5">
            <h2 className="font-bebas text-2xl text-foreground">Camp settings</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Times are Lagos time. The WhatsApp link is only shown to schools that confirm.
            </p>
            <ActionForm action={saveCampSettings.bind(null, year)} className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className={labelCls}>Title</span>
                <input name="title" defaultValue={settings?.title ?? `ASC Camp ${year}`} disabled={!editable} className={inputCls} />
              </label>
              <label className="block space-y-1">
                <span className={labelCls}>Venue</span>
                <input name="venue" defaultValue={settings?.venue ?? ""} disabled={!editable} className={inputCls} />
              </label>
              <label className="block space-y-1">
                <span className={labelCls}>Arrival</span>
                <input name="arrival_at" type="datetime-local" defaultValue={isoToLagosInput(settings?.arrival_at)} disabled={!editable} className={inputCls} />
              </label>
              <label className="block space-y-1">
                <span className={labelCls}>Departure</span>
                <input name="departure_at" type="datetime-local" defaultValue={isoToLagosInput(settings?.departure_at)} disabled={!editable} className={inputCls} />
              </label>
              <label className="block space-y-1">
                <span className={labelCls}>Confirmation deadline</span>
                <input name="confirm_deadline" type="datetime-local" defaultValue={isoToLagosInput(settings?.confirm_deadline)} disabled={!editable} className={inputCls} />
              </label>
              <label className="block space-y-1">
                <span className={labelCls}>WhatsApp group link</span>
                <input name="whatsapp_url" type="url" placeholder="https://chat.whatsapp.com/…" defaultValue={settings?.whatsapp_url ?? ""} disabled={!editable} className={inputCls} />
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                <input type="checkbox" name="is_open" defaultChecked={settings?.is_open ?? true} disabled={!editable} />
                Accept responses from schools
              </label>
              {editable ? (
                <div className="sm:col-span-2">
                  <SubmitButton size="sm" pendingText="Saving…">{settings ? "Save settings" : "Set up camp"}</SubmitButton>
                </div>
              ) : null}
            </ActionForm>
          </Card>
        ) : null}

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
          <StatTile label="Invited" value={counts.eligible} />
          <StatTile label="Added by admin" value={counts.manual} />
          <StatTile label="Attending" value={counts.attending} />
          <StatTile label="Not attending" value={counts.not_attending} />
          <StatTile label="No response" value={counts.no_response} />
          <StatTile label="Released" value={counts.released} />
        </div>

        {editable && year ? (
          <Card className="p-5">
            <h2 className="font-bebas text-2xl text-foreground">Add a school</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Invite a school that didn&apos;t qualify, for example to fill a released place.
              It shows as &ldquo;Added by admin&rdquo; and gets a portal notification. Set a
              respond-by date if the main deadline has passed.
            </p>
            {candidates.length ? (
              <ActionForm action={addCampSchool.bind(null, year)} className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="block space-y-1">
                  <span className={labelCls}>School</span>
                  <Select name="registration_id" defaultValue="" required className="w-full">
                    <option value="" disabled>Choose a school…</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.schoolName} ({ENTRY_LABEL[c.entryStatus ?? ""] ?? "no entry status"})
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block space-y-1">
                  <span className={labelCls}>Respond by (optional)</span>
                  <input name="respond_by" type="datetime-local" className={inputCls} />
                </label>
                <label className="block space-y-1">
                  <span className={labelCls}>Admin note (optional)</span>
                  <input name="admin_note" placeholder="e.g. Replaces a released place" className={inputCls} />
                </label>
                <div className="sm:col-span-3">
                  <SubmitButton size="sm" pendingText="Adding…">Add to camp</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Every school in this edition is already on the camp list.</p>
            )}
          </Card>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={href(f === "all" ? {} : { status: f })}
                className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-bold ${filter === f ? "bg-secondary text-secondary-foreground" : "border border-foreground/10 bg-card text-muted-foreground hover:text-foreground"}`}
              >
                {f === "all" ? "All" : f === "manual" ? CAMP_INVITE_LABEL.manual : CAMP_STATUS_LABEL[f]}
              </Link>
            ))}
          </div>
          {year ? (
            <a href={`/portal/admin/participants/camp/export?edition=${year}`} className="text-xs uppercase tracking-[0.2em] text-primary hover:underline">
              Export CSV ↓
            </a>
          ) : null}
        </div>

        {shown.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No schools in this view.</Card>
        ) : (
          <div className="space-y-3">
            {shown.map((r) => (
              <Card key={r.registrationId} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{r.schoolName}</p>
                    <p className="text-xs text-muted-foreground">{r.lga ?? "LGA not set"}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                        r.source === "qualified"
                          ? "border-foreground/10 text-muted-foreground"
                          : r.source === "manual"
                            ? "border-primary/40 bg-primary/10 text-gold-ink"
                            : "border-red-600/30 text-red-800"
                      }`}
                    >
                      {CAMP_INVITE_LABEL[r.source]}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${TONE[r.status]}`}>
                      {CAMP_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                </div>
                <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  {r.educators.some((e) => e.going) ? (
                    <p className="sm:col-span-2">
                      Educators going ({r.educators.filter((e) => e.going).length}):{" "}
                      <span className="text-foreground">{goingSummary(r.educators)}</span>
                    </p>
                  ) : null}
                  {r.educators.some((e) => !e.going) ? (
                    <p className="sm:col-span-2">
                      Not going: {r.educators.filter((e) => !e.going).map((e) => e.name).join(", ")}
                    </p>
                  ) : null}
                  {r.status === "attending" ? <p>Contestants confirmed: <span className="text-foreground">{r.repsConfirmed ? "Yes" : "No"}</span></p> : null}
                  {r.notes ? <p className="sm:col-span-2">Notes: <span className="text-foreground">{r.notes}</span></p> : null}
                  {r.declineReason ? <p className="sm:col-span-2">Reason: <span className="text-foreground">{r.declineReason}</span></p> : null}
                  {r.respondedAt ? <p>Responded {formatCampDate(r.respondedAt)}</p> : null}
                  {r.respondBy ? <p>Respond by {formatCampDate(r.respondBy)}</p> : null}
                </div>
                {editable ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.15em] text-primary">Update</summary>
                    <ActionForm action={saveCampConfirmation.bind(null, r.registrationId)} className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="block space-y-1">
                        <span className={labelCls}>Status</span>
                        <Select name="status" defaultValue={r.status === "no_response" ? "pending" : r.status} className="w-full">
                          <option value="pending">No response</option>
                          <option value="attending">Attending</option>
                          <option value="not_attending">Not attending</option>
                          <option value="released">Released (spot reassigned)</option>
                        </Select>
                      </label>
                      <label className="block space-y-1">
                        <span className={labelCls}>Respond by (overrides deadline)</span>
                        <input name="respond_by" type="datetime-local" defaultValue={isoToLagosInput(r.respondBy)} className={inputCls} />
                      </label>
                      <label className="block space-y-1">
                        <span className={labelCls}>Admin note</span>
                        <input name="admin_note" defaultValue={r.adminNote ?? ""} className={inputCls} />
                      </label>
                      <div className="sm:col-span-3">
                        <SubmitButton size="sm" pendingText="Saving…">Save</SubmitButton>
                      </div>
                    </ActionForm>
                    {r.source === "manual" && r.status === "no_response" ? (
                      <ActionForm action={removeCampSchool.bind(null, r.registrationId)} className="mt-3">
                        <ConfirmSubmitButton
                          size="sm"
                          variant="outline"
                          destructive
                          title={`Remove ${r.schoolName} from camp?`}
                          description="The school loses its invitation and the camp page disappears from its portal."
                          confirmLabel="Yes, remove"
                        >
                          Remove from camp
                        </ConfirmSubmitButton>
                      </ActionForm>
                    ) : null}
                  </details>
                ) : r.adminNote ? (
                  <p className="mt-2 text-xs text-muted-foreground">Admin note: {r.adminNote}</p>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </PortalBody>
    </>
  );
}
