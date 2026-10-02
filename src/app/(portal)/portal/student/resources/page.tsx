import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { Card, EmptyState, SectionHeading } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import ResourcePreviewButton from "@/components/portal/resource-preview-button";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { getSessionUser } from "@/supabase/auth";
import { isSupabaseConfigured } from "@/supabase/env";
import { SUBJECTS, LEVELS } from "@/lib/assessments";
import { canAccess, tierRank, lockHint } from "@/lib/resource-access";
import {
  RESOURCE_COLUMNS,
  RESOURCE_TYPES,
  STUDENT_VISIBLE_AUDIENCE,
  mapResource,
  type ResourceRow,
} from "@/lib/resources";
import { Select } from "@/components/ui/select";

export const metadata = pageMetadata("Resources", "Study packs, past questions, and tools.");
export const dynamic = "force-dynamic";

// Official state systems — always shown; admins add more as external-link resources.
const OFFICIAL_LINKS = [
  { title: "OgunLEARN", url: "https://learn.ogunstate.gov.ng/", note: "State lesson-notes platform" },
  { title: "DiPER", url: "https://diper.ogunstate.gov.ng/", note: "Learner ID & records" },
];

export default async function StudentResources({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; level?: string; type?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/portal/login");
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");
  const supabase = await createClient();

  // Published resources (RLS shows only published to non-admins), filtered by
  // the chosen facets. Tier gating on the FILE happens at download — locked
  // items are listed to motivate, but their URLs never leave the server.
  let query = supabase
    .from("resources")
    .select(RESOURCE_COLUMNS)
    .eq("published", true)
    // Students see student-facing resources only; coordinator-only material is hidden.
    .in("audience", [...STUDENT_VISIBLE_AUDIENCE])
    .order("created_at", { ascending: false });
  if (sp.subject) query = query.eq("subject", sp.subject);
  if (sp.level) query = query.eq("level", sp.level);
  if (sp.type) query = query.eq("type", sp.type);

  const [{ data }, { data: schoolData }, { data: campAttending, error: campError }] = await Promise.all([
    query,
    supabase.rpc("get_my_school"),
    supabase.rpc("my_camp_attending"),
  ]);
  if (campError) console.error("camp access", campError.message);
  // Unlock tier is derived from competition progress (stage advancement), not a
  // status flag — see tierRank.
  const registration =
    (schoolData as {
      registration?: {
        status?: string;
        stage_results?: { stage: string; outcome: string | null }[];
      } | null;
    } | null)?.registration ?? null;
  const tier = tierRank(registration?.status ?? null, registration?.stage_results);

  const resources = ((data ?? []) as unknown as ResourceRow[]).map(mapResource);
  const withLock = (r: (typeof resources)[number]) => ({ r, locked: !canAccess(r.access, tier, campAttending === true) });
  // Grouped by how you get them — downloadable files vs. links — not by type.
  // The type (guidelines, past questions, study guide…) shows on each card.
  const downloads = resources
    .filter((r) => r.hasFile)
    .map(withLock)
    .sort((a, b) => Number(a.locked) - Number(b.locked));
  const links = resources
    .filter((r) => !r.hasFile && r.externalUrl)
    .map(withLock);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Filter</SectionHeading>
        <Card className="p-4">
          <form method="get" className="flex flex-wrap items-center gap-2">
            <Select name="subject" defaultValue={sp.subject ?? ""}>
              <option value="">Any subject</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select name="level" defaultValue={sp.level ?? ""}>
              <option value="">Any level</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
            <Select name="type" defaultValue={sp.type ?? ""}>
              <option value="">Any type</option>
              {RESOURCE_TYPES.filter((t) => t.value !== "external-link").map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
            <Button type="submit" size="sm" variant="outline">Apply</Button>
          </form>
        </Card>
      </div>

      <div>
        <SectionHeading action={{ href: "/resources", label: "All resources →" }}>
          Downloads
        </SectionHeading>
        {downloads.length === 0 ? (
          <EmptyState title="Downloadable materials will appear here as they're published." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {downloads.map(({ r, locked }) => (
              <Card key={r.id} className={`p-5 h-full flex flex-col ${locked ? "opacity-75" : ""}`}>
                {r.type ? (
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                    {r.type.replace("-", " ")}
                  </span>
                ) : null}
                <h4 className="font-bebas text-xl text-foreground mt-1">{r.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {[r.subject, r.level].filter(Boolean).join(" · ")}
                </p>
                {locked ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="size-3.5 shrink-0 text-gold-ink" />
                    {lockHint(r.access)}
                  </p>
                ) : r.hasFile ? (
                  r.downloadable ? (
                    <a
                      href={`/api/resources/${r.id}/download`}
                      className="mt-3 text-xs uppercase tracking-[0.15em] text-primary hover:underline"
                    >
                      Download ↓
                    </a>
                  ) : (
                    <ResourcePreviewButton id={r.id} title={r.title} isPdf={r.isPdf} />
                  )
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeading>Additional resources</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OFFICIAL_LINKS.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="block group">
              <Card interactive className="p-5 h-full">
                <h4 className="font-bebas text-lg text-foreground">{l.title} ↗</h4>
                <p className="text-sm text-muted-foreground mt-1">{l.note}</p>
              </Card>
            </a>
          ))}
          {links.map(({ r, locked }) =>
            locked ? (
              <Card key={r.id} className="p-5 h-full opacity-75">
                <h4 className="font-bebas text-lg text-foreground">{r.title}</h4>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3.5 shrink-0 text-gold-ink" />
                  {lockHint(r.access)}
                </p>
              </Card>
            ) : (
              <a
                key={r.id}
                href={r.externalUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <Card interactive className="p-5 h-full">
                  <h4 className="font-bebas text-lg text-foreground">{r.title} ↗</h4>
                  {r.subject ? <p className="text-sm text-muted-foreground mt-1">{r.subject}</p> : null}
                </Card>
              </a>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
