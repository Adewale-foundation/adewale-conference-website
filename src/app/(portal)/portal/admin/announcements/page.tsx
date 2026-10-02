import Link from "next/link";
import EmptyState from "@/components/ui/empty-state";
import {
  Card,
  PortalBody,
  PortalHeader,
  SectionHeading,
  StatTile,
} from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/submit-button";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { AnnouncementAudienceSelect } from "@/components/portal/announcement-audience-select";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { resourceStorage } from "@/lib/storage";
import {
  ANNOUNCEMENT_CHANNEL_LABEL,
  ANNOUNCEMENT_CHANNEL_OPTIONS,
  ANNOUNCEMENT_COLUMNS,
  ANNOUNCEMENT_FILE_ACCEPT,
  ANNOUNCEMENT_TARGET_LABEL,
  ANNOUNCEMENT_TARGET_OPTIONS,
  MAX_ATTACHMENT_BYTES,
  audienceLabel,
  formatFileSize,
  mapAnnouncement,
  type AnnouncementRow,
} from "@/lib/announcements";
import { createAnnouncementDraft } from "./actions";
import { Select } from "@/components/ui/select";

export const metadata = pageMetadata(
  "Announcements",
  "Compose and send announcements to educators by email and in-portal.",
);
export const dynamic = "force-dynamic";

const inputCls =
  "rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary";

export default async function AdminAnnouncements() {
  await requireModuleView("announcements");
  const canManage = await canManageModule("announcements");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load announcements: ${error.message}`);
  const announcements = ((data ?? []) as unknown as AnnouncementRow[]).map(mapAnnouncement);

  const drafts = announcements.filter((a) => a.status === "draft").length;
  const sent = announcements.filter((a) => a.status === "sent").length;
  const reached = announcements.reduce((total, a) => total + a.recipientCount, 0);

  // Offer the edition years that actually exist, newest first. The newest is
  // the current edition — the default, since almost every announcement is about
  // the edition under way.
  const { data: editionData } = await supabase
    .from("editions")
    .select("year")
    .order("year", { ascending: false });
  const editionYears = ((editionData ?? []) as { year: number }[]).map((e) => e.year);
  const currentEdition = editionYears[0] ?? null;

  const storageReady = resourceStorage.configured;

  return (
    <>
      <PortalHeader
        title="Announcements"
        subtitle="Write once, reach every educator — by email, in the portal, or both"
      />
      <PortalBody>
        {!canManage ? (
          <div>
            <ReadOnlyBadge />
          </div>
        ) : null}

        <div className="grid gap-4 grid-cols-3">
          <StatTile label="Drafts" value={drafts} />
          <StatTile label="Sent" value={sent} />
          <StatTile label="Educators reached" value={reached} />
        </div>

        {canManage ? (
          <div>
            <SectionHeading>New announcement</SectionHeading>
            <Card className="p-5 md:p-6">
              <form
                action={createAnnouncementDraft}
                className="space-y-4"
              >
                <label className="space-y-1 block">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Title
                  </span>
                  <input
                    name="title"
                    required
                    placeholder="e.g. Zonal finals venue has changed"
                    className={`w-full ${inputCls}`}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Doubles as the email subject line and the notification headline.
                  </span>
                </label>

                <label className="space-y-1 block">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Message
                  </span>
                  <textarea
                    name="body"
                    required
                    rows={6}
                    placeholder={"Write the announcement here.\n\nMarkdown works: **bold**, *italic*, # headings, - bullets and [links](https://example.com)."}
                    className={`w-full ${inputCls}`}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Send by
                    </span>
                    <Select name="channels" defaultValue="both" className="w-full">
                      {ANNOUNCEMENT_CHANNEL_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Send to
                    </span>
                    <Select name="target_role" defaultValue="all" className="w-full">
                      {ANNOUNCEMENT_TARGET_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Edition
                    </span>
                    <Select
                      name="edition_year"
                      defaultValue={currentEdition ?? ""}
                      className="w-full"
                    >
                      {editionYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                          {year === currentEdition ? " (current)" : " only"}
                        </option>
                      ))}
                      <option value="">All editions</option>
                    </Select>
                  </label>
                </div>

                <label className="space-y-1 block">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Schools
                  </span>
                  <AnnouncementAudienceSelect defaultValue="" />
                  <span className="text-[11px] text-muted-foreground">
                    Narrowing by stage uses the results recorded on the participant
                    hub, and also hides the announcement from schools outside the
                    audience in their portal. With &ldquo;All editions&rdquo; a school
                    counts if it reached that stage in <em>any</em> year — pick a
                    year to mean this season&rsquo;s.
                  </span>
                </label>

                <label className="space-y-1 block">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Attachments (optional)
                  </span>
                  <input
                    type="file"
                    name="files"
                    multiple
                    accept={ANNOUNCEMENT_FILE_ACCEPT}
                    disabled={!storageReady}
                    className={`w-full ${inputCls} disabled:opacity-60`}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {storageReady ? (
                      <>
                        Documents and images, up to {formatFileSize(MAX_ATTACHMENT_BYTES)} each.
                        Files of 5 MB or less are attached to the email; larger ones are linked
                        for download in the portal. You can add or remove files on the next
                        screen too.
                      </>
                    ) : (
                      <>
                        File storage isn&rsquo;t configured, so attachments are unavailable. Set
                        the <span className="font-mono">RESOURCE_S3_*</span> variables to enable
                        them.
                      </>
                    )}
                  </span>
                </label>

                <p className="text-[11px] text-muted-foreground">
                  Narrowing to coordinating teachers or principals uses the addresses on
                  each school&rsquo;s registration entry. An educator who joined later
                  isn&rsquo;t recorded as either, so a narrowed send skips them — the next
                  screen shows exactly how many people will be reached before you send.
                </p>

                <SubmitButton size="sm" pendingText="Creating…">
                  Create draft
                </SubmitButton>
              </form>
            </Card>
          </div>
        ) : null}

        <div>
          <SectionHeading
            action={{ href: "/portal/announcements", label: "View as educator →" }}
          >
            All announcements
          </SectionHeading>
          {announcements.length === 0 ? (
            <EmptyState title="Nothing yet">
              Draft your first announcement above. Nothing goes out until you review
              the recipients and press send.
            </EmptyState>
          ) : (
            <Card className="divide-y divide-foreground/5">
              {announcements.map((a) => (
                <Link
                  key={a.id}
                  href={`/portal/admin/announcements/${a.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-foreground/2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {a.title}
                      {a.status === "draft" ? (
                        <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          · draft
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        ANNOUNCEMENT_CHANNEL_LABEL[a.channels],
                        ANNOUNCEMENT_TARGET_LABEL[a.targetRole],
                        // Only when narrowed — "all registered schools" is the
                        // assumption already, and every row would carry it.
                        a.audienceStage
                          ? audienceLabel(a.audienceStage, a.audienceOutcome)
                          : null,
                        a.editionYear ? `${a.editionYear} only` : "All editions",
                        a.attachments.length
                          ? `${a.attachments.length} file${a.attachments.length === 1 ? "" : "s"}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.status === "sent" ? (
                      <>
                        <span className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide bg-green-100 text-green-800">
                          {a.recipientCount} reached
                        </span>
                        {a.emailFailedCount > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide bg-red-50 text-red-700">
                            {a.emailFailedCount} failed
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide bg-foreground/5 text-muted-foreground">
                        Not sent
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </Card>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Announcements reach educators only. Students sign in with an access code
            and have no email address on file, so they are never included.
          </p>
        </div>
      </PortalBody>
    </>
  );
}
