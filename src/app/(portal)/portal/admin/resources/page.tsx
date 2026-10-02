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
import { ResourceTypeField } from "@/components/portal/resource-type-field";
import { ResourceAudienceFields } from "@/components/portal/resource-audience-fields";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { SUBJECTS, LEVELS } from "@/lib/assessments";
import {
  RESOURCE_ACCESS_OPTIONS,
  RESOURCE_AUDIENCE_LABEL,
  RESOURCE_COLUMNS,
  RESOURCE_DOC_ACCEPT,
  RESOURCE_TYPES,
  RESOURCE_TYPE_LABEL,
  mapResource,
  type ResourceRow,
} from "@/lib/resources";
import { ACCESS_LABEL, accessRank, type ResourceAccess } from "@/lib/resource-access";
import { resourceStorage } from "@/lib/storage";
import { createResource, deleteResource, setResourcePublished } from "./actions";
import { Select } from "@/components/ui/select";

export const metadata = pageMetadata("Resources", "Upload and manage the study library — no Sanity needed.");
export const dynamic = "force-dynamic";

const inputCls =
  "rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary";

export default async function AdminResources() {
  await requireModuleView("content");
  const canManage = await canManageModule("content");
  const supabase = await createClient();
  // Admins read all rows (published + drafts) via RLS.
  const { data } = await supabase
    .from("resources")
    .select(RESOURCE_COLUMNS)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as ResourceRow[];
  const resources = rows.map(mapResource);

  const downloadable = resources.filter((r) => r.hasFile).length;
  const external = resources.filter((r) => !r.hasFile && r.externalUrl).length;
  const drafts = resources.filter((r) => !r.published).length;

  // Custom types admins have typed before (beyond the built-in list) — offered
  // as suggestions alongside the defaults so they stay reusable.
  const knownTypes = new Set<string>(RESOURCE_TYPES.map((t) => t.value));
  const customTypes = [
    ...new Set(resources.map((r) => r.type).filter((t): t is string => Boolean(t))),
  ]
    .filter((t) => !knownTypes.has(t))
    .sort();

  const storageReady = resourceStorage.configured;

  return (
    <>
      <PortalHeader
        title="Resources"
        subtitle="Upload and manage study packs, guides & links — right here in the portal"
      />
      <PortalBody>
        {!canManage ? (
          <div>
            <ReadOnlyBadge />
          </div>
        ) : null}

        {canManage && !storageReady ? (
          <Card className="p-4 border-l-4 border-l-red-500">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
              File storage not configured
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Set <span className="font-mono">RESOURCE_S3_REGION</span>,{" "}
              <span className="font-mono">RESOURCE_S3_BUCKET</span>,{" "}
              <span className="font-mono">RESOURCE_S3_ACCESS_KEY_ID</span> and{" "}
              <span className="font-mono">RESOURCE_S3_SECRET_ACCESS_KEY</span> to enable
              file uploads. You can still add external-link resources without it.
            </p>
          </Card>
        ) : null}

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total" value={resources.length} />
          <StatTile label="Downloadable" value={downloadable} />
          <StatTile label="External links" value={external} />
          <StatTile label="Drafts" value={drafts} />
        </div>

        {/* Add a resource — file OR external link, with metadata + access tier. */}
        {canManage ? (
        <div>
          <SectionHeading>Add a resource</SectionHeading>
          <Card className="p-5 md:p-6">
            <form action={createResource} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2 space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Title</span>
                  <input name="title" required placeholder="e.g. 2024 Mathematics past questions" className={`w-full ${inputCls}`} />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Type</span>
                  <ResourceTypeField presets={[...RESOURCE_TYPES]} custom={customTypes} />
                  <span className="text-[11px] text-muted-foreground">
                    The type is a label shown on the card. Upload a file to make it
                    a download, or paste a URL for a link.
                  </span>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Who can access</span>
                  <Select name="access" defaultValue="public" className="w-full">
                    {RESOURCE_ACCESS_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </Select>
                </label>

                {/* Audience + Subject/Level — Subject/Level hide for coordinator-only resources. */}
                <ResourceAudienceFields subjects={[...SUBJECTS]} levels={[...LEVELS]} />

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Edition year (optional)</span>
                  <input name="edition_year" inputMode="numeric" placeholder="2026" className={`w-full ${inputCls}`} />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Document file (PDF, Word, PowerPoint, Excel)</span>
                  <input type="file" name="file" accept={RESOURCE_DOC_ACCEPT} disabled={!storageReady} className={`w-full ${inputCls} disabled:opacity-60`} />
                </label>

                <label className="sm:col-span-2 space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">External URL (instead of a file)</span>
                  <input name="external_url" type="url" placeholder="https://…" className={`w-full ${inputCls}`} />
                </label>

                <label className="sm:col-span-2 space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Description (optional)</span>
                  <textarea name="body" rows={2} className={`w-full ${inputCls}`} />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="published" defaultChecked className="size-4 accent-primary" />
                Publish now (uncheck to save as a draft)
              </label>

              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="downloadable" defaultChecked className="mt-0.5 size-4 accent-primary" />
                <span>
                  Allow download (uncheck for preview-only — PDFs open in an in-app
                  reader with no download; other document types open in the browser)
                </span>
              </label>

              <SubmitButton size="sm" pendingText="Uploading…">Add resource</SubmitButton>
            </form>
          </Card>
        </div>
        ) : null}

        <div>
          <SectionHeading action={{ href: "/portal/student/resources", label: "View as student →" }}>
            Library
          </SectionHeading>
          {resources.length === 0 ? (
            <EmptyState title="Nothing yet">
              Add your first study pack or past questions above — it appears for
              students and educators immediately.
            </EmptyState>
          ) : (
            <Card className="divide-y divide-foreground/5">
              {resources.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {r.title}
                      {!r.published ? (
                        <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">· draft</span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        r.type ? RESOURCE_TYPE_LABEL[r.type] ?? r.type : null,
                        r.subject,
                        r.level,
                        r.editionYear,
                        RESOURCE_AUDIENCE_LABEL[r.audience] ?? r.audience,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Untyped"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {accessRank(r.access) > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide bg-primary/[0.14] text-gold-ink">
                        🔒 {ACCESS_LABEL[r.access as Exclude<ResourceAccess, "public">] ?? r.access}
                      </span>
                    ) : null}
                    <span
                      className={`inline-flex items-center px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                        r.hasFile
                          ? "bg-green-100 text-green-800"
                          : r.externalUrl
                            ? "bg-primary/[0.14] text-gold-ink"
                            : "bg-foreground/5 text-muted-foreground"
                      }`}
                    >
                      {r.hasFile ? "File" : r.externalUrl ? "Link" : "Page only"}
                    </span>
                    {/* Admins can open their own upload — the download route
                        bypasses the tier gate for admins. */}
                    {r.hasFile ? (
                      <a
                        href={`/api/resources/${r.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs uppercase tracking-[0.15em] text-primary hover:underline px-1"
                      >
                        View ↓
                      </a>
                    ) : r.externalUrl ? (
                      <a
                        href={r.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs uppercase tracking-[0.15em] text-primary hover:underline px-1"
                      >
                        Open ↗
                      </a>
                    ) : null}
                    {canManage ? (
                      <>
                        <form action={setResourcePublished.bind(null, r.id, !r.published)}>
                          <SubmitButton size="sm" variant="outline">
                            {r.published ? "Unpublish" : "Publish"}
                          </SubmitButton>
                        </form>
                        <form action={deleteResource.bind(null, r.id)}>
                          <ConfirmSubmitButton
                            size="sm"
                            variant="outline"
                            destructive
                            title="Delete this resource?"
                            description="Removes the file from storage and the entry from the library. This can't be undone."
                            confirmLabel="Yes, delete"
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </Card>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Files are stored privately in{" "}
            <Link href="/portal/admin/settings" className="text-primary hover:underline">object storage</Link>{" "}
            and served through short-lived download links. Locked tiers are listed
            but their files are withheld until a school reaches that stage.
          </p>
        </div>
      </PortalBody>
    </>
  );
}
