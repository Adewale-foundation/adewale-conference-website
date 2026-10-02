import { redirect } from "next/navigation";
import { Card, EmptyState, SectionHeading } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import ResourcePreviewButton from "@/components/portal/resource-preview-button";
import { Lock } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { getSessionUser } from "@/supabase/auth";
import { isSupabaseConfigured } from "@/supabase/env";
import { SUBJECTS, LEVELS } from "@/lib/assessments";
import { canAccess, tierRank, lockHint } from "@/lib/resource-access";
import {
  RESOURCE_COLUMNS,
  RESOURCE_TYPES,
  mapResource,
  type ResourceRow,
} from "@/lib/resources";
import { Select } from "@/components/ui/select";

export const metadata = pageMetadata("Resources", "Study packs and guides for your students.");
export const dynamic = "force-dynamic";

// The same library students see (now managed in-portal by the conference team),
// so educators know exactly what their students are working with.
export default async function SchoolResources({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; level?: string; type?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/portal/login");
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");

  const supabase = await createClient();

  let query = supabase
    .from("resources")
    .select(RESOURCE_COLUMNS)
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (sp.subject) query = query.eq("subject", sp.subject);
  if (sp.level) query = query.eq("level", sp.level);
  if (sp.type) query = query.eq("type", sp.type);

  const [{ data }, { data: regData }, { data: campAttending, error: campError }] = await Promise.all([
    query,
    supabase
      .from("registrations")
      .select("status, registration_stage_results(stage, outcome)")
      .order("edition_year", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("my_camp_attending"),
  ]);
  if (campError) console.error("camp access", campError.message);
  // Unlock tier derives from how far the school advanced, not the status flag.
  const tier = tierRank(
    (regData?.status as string | undefined) ?? null,
    (regData?.registration_stage_results as
      | { stage: string; outcome: string | null }[]
      | undefined) ?? null,
  );

  const resources = ((data ?? []) as unknown as ResourceRow[]).map(mapResource);
  const withLock = (r: (typeof resources)[number]) => ({ r, locked: !canAccess(r.access, tier, campAttending === true) });
  // Grouped by delivery (downloadable vs link), not by type — the type shows on
  // each card, so guidelines aren't mislabelled as study packs.
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
        <SectionHeading>Resources</SectionHeading>
        <p className="serif-display italic text-muted-foreground">
          Everything your students see — study packs, past questions, and guides.
          Attach any of these to a learning plan from the plan builder.
        </p>
      </div>

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

      <div>
        <SectionHeading action={{ href: "/resources", label: "Public library →" }}>
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

      {links.length > 0 ? (
        <div>
          <SectionHeading>External resources</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                    {r.subject ? (
                      <p className="text-sm text-muted-foreground mt-1">{r.subject}</p>
                    ) : null}
                  </Card>
                </a>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
