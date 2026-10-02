import { notFound } from "next/navigation";
import { Card, PageShell, SectionHeading, StatTile } from "@/components/portal/ui";
import { Markdown } from "@/components/portal/markdown";
import { SubmitButton } from "@/components/portal/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { AnnouncementSendForm } from "@/components/portal/announcement-send-form";
import { AnnouncementAudienceSelect } from "@/components/portal/announcement-audience-select";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { resourceStorage } from "@/lib/storage";
import { resolveEducatorRecipients } from "@/lib/announcement-recipients";
import {
  ANNOUNCEMENT_CHANNEL_LABEL,
  ANNOUNCEMENT_CHANNEL_OPTIONS,
  ANNOUNCEMENT_COLUMNS,
  ANNOUNCEMENT_FILE_ACCEPT,
  ANNOUNCEMENT_TARGET_LABEL,
  ANNOUNCEMENT_TARGET_OPTIONS,
  MAX_ATTACHMENT_BYTES,
  audienceLabel,
  audienceValue,
  formatFileSize,
  mapAnnouncement,
  selectInlineAttachments,
  type AnnouncementRow,
} from "@/lib/announcements";
import {
  addAnnouncementAttachment,
  deleteAnnouncement,
  deleteAnnouncementAttachment,
  updateAnnouncementDraft,
} from "../actions";
import { Select } from "@/components/ui/select";

export const metadata = pageMetadata("Announcement", "Review and send an announcement.");
export const dynamic = "force-dynamic";

const inputCls =
  "rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary";

export default async function AdminAnnouncementDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireModuleView("announcements");
  const canManage = await canManageModule("announcements");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load this announcement: ${error.message}`);
  if (!data) notFound();
  const announcement = mapAnnouncement(data as unknown as AnnouncementRow);

  const isDraft = announcement.status === "draft";
  const channelLabel = ANNOUNCEMENT_CHANNEL_LABEL[announcement.channels];
  const { inline, linkOnly } = selectInlineAttachments(announcement.attachments);

  // A draft shows who it would actually reach, so the effect of narrowing to
  // teachers/principals is visible before anything goes out.
  const preview = isDraft
    ? await resolveEducatorRecipients(supabase, {
        editionYear: announcement.editionYear,
        targetRole: announcement.targetRole,
        audienceStage: announcement.audienceStage,
        audienceOutcome: announcement.audienceOutcome,
      })
    : null;

  const audience = audienceLabel(announcement.audienceStage, announcement.audienceOutcome);

  const { data: editionData } = await supabase
    .from("editions")
    .select("year")
    .order("year", { ascending: false });
  const editionYears = ((editionData ?? []) as { year: number }[]).map((e) => e.year);

  return (
    <PageShell
      title={announcement.title}
      subtitle={
        isDraft
          ? "Draft — nothing has been sent yet"
          : `Sent ${announcement.sentAt ? new Date(announcement.sentAt).toLocaleString() : ""}`
      }
      back={{ href: "/portal/admin/announcements", label: "All announcements" }}
      actions={
        canManage ? (
          <form action={deleteAnnouncement.bind(null, id)}>
            <ConfirmSubmitButton
              size="sm"
              variant="outline"
              destructive
              title="Delete this announcement?"
              description={
                isDraft
                  ? "Removes the draft and any uploaded files. This can't be undone."
                  : "Removes the record, its files, and the portal notifications that link to it. Emails already delivered can't be recalled."
              }
              confirmLabel="Yes, delete"
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        ) : null
      }
    >
      {!canManage ? <ReadOnlyBadge /> : null}

      {isDraft ? (
        <>
          <div>
            <SectionHeading>Recipients</SectionHeading>
            <Card className="p-5 space-y-3">
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                <StatTile label="Will be reached" value={preview?.recipientCount ?? 0} />
                <StatTile label="Schools reached" value={preview?.schoolCount ?? 0} />
                <StatTile label="Get the email" value={preview?.emails.length ?? 0} />
                <StatTile
                  label="Get the portal alert"
                  value={preview?.profileIds.length ?? 0}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {ANNOUNCEMENT_TARGET_LABEL[announcement.targetRole]} · {audience} ·{" "}
                {announcement.editionYear
                  ? `${announcement.editionYear} edition only`
                  : "all editions"}{" "}
                · sent by {channelLabel.toLowerCase()}.
                {announcement.channels === "in_app"
                  ? " No email will be sent."
                  : announcement.channels === "email"
                    ? " No portal notification will be created."
                    : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Educators without a portal account still receive the email; the portal
                alert only reaches those who have signed in at least once.
              </p>
            </Card>
          </div>

          <div>
            <SectionHeading>Edit draft</SectionHeading>
            <Card className="p-5 md:p-6">
              {canManage ? (
                <form
                  action={updateAnnouncementDraft.bind(null, id)}
                  className="space-y-4"
                >
                  <label className="space-y-1 block">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Title
                    </span>
                    <input
                      name="title"
                      required
                      defaultValue={announcement.title}
                      className={`w-full ${inputCls}`}
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Message
                    </span>
                    <textarea
                      name="body"
                      required
                      rows={8}
                      defaultValue={announcement.body}
                      className={`w-full ${inputCls}`}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      Markdown: **bold**, *italic*, # headings, - bullets,
                      [links](https://example.com).
                    </span>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Send by
                      </span>
                      <Select
                        name="channels"
                        defaultValue={announcement.channels}
                        className="w-full"
                      >
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
                      <Select
                        name="target_role"
                        defaultValue={announcement.targetRole}
                        className="w-full"
                      >
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
                        defaultValue={announcement.editionYear ?? ""}
                        className="w-full"
                      >
                        <option value="">All editions</option>
                        {editionYears.map((year) => (
                          <option key={year} value={year}>
                            {year} only
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>

                  <label className="space-y-1 block">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Schools
                    </span>
                    <AnnouncementAudienceSelect
                      defaultValue={audienceValue(
                        announcement.audienceStage,
                        announcement.audienceOutcome,
                      )}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      Save the draft to see the recipient count for a new audience.
                    </span>
                  </label>

                  <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                    Save draft
                  </SubmitButton>
                </form>
              ) : (
                <Markdown source={announcement.body} />
              )}
            </Card>
          </div>
        </>
      ) : (
        <>
          <div>
            <SectionHeading>Send report</SectionHeading>
            <Card className="p-5 space-y-3">
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                <StatTile label="Educators reached" value={announcement.recipientCount} />
                <StatTile label="Emails sent" value={announcement.emailSentCount} />
                <StatTile label="Emails failed" value={announcement.emailFailedCount} />
                <StatTile label="Portal alerts" value={announcement.notifiedCount} />
              </div>
              {announcement.emailFailedCount > 0 ? (
                <p className="text-xs text-destructive">
                  Some emails did not go out. The announcement itself was published and
                  is readable in the portal — do not re-send, as everyone who did
                  receive it would get a duplicate.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {ANNOUNCEMENT_TARGET_LABEL[announcement.targetRole]} · {audience} ·{" "}
                {announcement.editionYear
                  ? `${announcement.editionYear} edition only`
                  : "all editions"}{" "}
                · {channelLabel.toLowerCase()}. A sent announcement is a record and
                cannot be edited or re-sent.
              </p>
            </Card>
          </div>

          <div>
            <SectionHeading>Message</SectionHeading>
            <Card className="p-5 md:p-6">
              <Markdown source={announcement.body} />
            </Card>
          </div>
        </>
      )}

      <div>
        <SectionHeading>Attachments</SectionHeading>
        <Card className="p-5 space-y-4">
          {announcement.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files attached.</p>
          ) : (
            <ul className="divide-y divide-foreground/5">
              {announcement.attachments.map((file) => (
                <li
                  key={file.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {file.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.sizeBytes)} ·{" "}
                      {linkOnly.some((f) => f.id === file.id)
                        ? "portal download only"
                        : "attached to the email"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/api/announcements/${id}/files/${file.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs uppercase tracking-[0.15em] text-primary hover:underline px-1"
                    >
                      Download ↓
                    </a>
                    {canManage && isDraft ? (
                      <form action={deleteAnnouncementAttachment.bind(null, id, file.id)}>
                        <ConfirmSubmitButton
                          size="sm"
                          variant="outline"
                          destructive
                          title="Remove this file?"
                          description="Deletes it from storage. This can't be undone."
                          confirmLabel="Yes, remove"
                        >
                          Remove
                        </ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canManage && isDraft ? (
            resourceStorage.configured ? (
              <form
                action={addAnnouncementAttachment.bind(null, id)}
                className="space-y-2 border-t border-foreground/10 pt-4"
              >
                <label className="space-y-1 block">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Add files
                  </span>
                  <input
                    type="file"
                    name="file"
                    multiple
                    required
                    accept={ANNOUNCEMENT_FILE_ACCEPT}
                    className={`w-full ${inputCls}`}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Documents and images, up to {formatFileSize(MAX_ATTACHMENT_BYTES)}
                    each. Files of 5 MB or less ride along in the email; larger ones are
                    linked for portal download.
                  </span>
                </label>
                <SubmitButton size="sm" variant="outline" pendingText="Uploading…">
                  Upload
                </SubmitButton>
              </form>
            ) : (
              <p className="text-xs text-destructive border-t border-foreground/10 pt-4">
                File storage is not configured, so attachments are unavailable. Set the{" "}
                <span className="font-mono">RESOURCE_S3_*</span> variables to enable them.
              </p>
            )
          ) : null}
        </Card>
      </div>

      {canManage && isDraft ? (
        <div>
          <SectionHeading>Send</SectionHeading>
          <Card className="p-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              This will reach{" "}
              <span className="font-medium text-foreground">
                {preview?.recipientCount ?? 0} educator
                {(preview?.recipientCount ?? 0) === 1 ? "" : "s"} at{" "}
                {preview?.schoolCount ?? 0} school
                {(preview?.schoolCount ?? 0) === 1 ? "" : "s"}
              </span>
              {inline.length
                ? `, with ${inline.length} file${inline.length === 1 ? "" : "s"} attached to the email`
                : ""}
              . Once sent it cannot be edited or recalled.
            </p>
            <AnnouncementSendForm
              announcementId={id}
              recipientCount={preview?.recipientCount ?? 0}
              channelLabel={channelLabel}
              disabled={(preview?.recipientCount ?? 0) === 0}
              disabledReason={
                (preview?.recipientCount ?? 0) === 0
                  ? announcement.audienceStage
                    ? `No school is recorded as ${announcement.audienceOutcome} at ${announcement.audienceStage} yet — mark the stage results, or widen the audience.`
                    : "No educators match this audience yet — widen the edition or recipient filter."
                  : undefined
              }
            />
          </Card>
        </div>
      ) : null}
    </PageShell>
  );
}
