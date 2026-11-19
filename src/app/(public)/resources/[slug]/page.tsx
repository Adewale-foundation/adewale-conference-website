import { notFound } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/layout/page-header";
import ResourceCard, { TYPE_LABEL } from "@/features/resources/resource-card";
import { pageMetadata } from "@/lib/seo";
import {
  getPublicResourceBySlug,
  listPublicResources,
  listPublicResourceSlugs,
} from "@/lib/public-resources";
import { accessRank, lockHint } from "@/lib/resource-access";

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await listPublicResourceSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const resource = await getPublicResourceBySlug(slug);
  if (!resource) return pageMetadata("Resource", "Study resource");
  return pageMetadata(resource.title, `${resource.subject ?? "STEM"} study resource.`);
}

export default async function ResourcePage({ params }: Params) {
  const { slug } = await params;
  const resource = await getPublicResourceBySlug(slug);
  if (!resource) notFound();

  const meta = [
    resource.subject,
    resource.level,
    resource.editionYear ? `Edition ${resource.editionYear}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Competition-gated resources never expose their file on the public site —
  // schools open them through the portal once their tier unlocks.
  const gated = accessRank(resource.access) > 0;
  const downloadHref = gated
    ? null
    : resource.hasFile
      ? `/api/resources/${resource.id}/download`
      : resource.externalUrl;

  const typeLabel = resource.type ? (TYPE_LABEL[resource.type] ?? resource.type) : null;
  const candidates: [string, string | null][] = [
    ["Type", typeLabel],
    ["Subject", resource.subject],
    ["Level", resource.level],
    ["Edition", resource.editionYear ? String(resource.editionYear) : null],
    ["File", gated ? null : resource.fileName],
  ];
  const facts = candidates.filter((fact): fact is [string, string] => Boolean(fact[1]));
  const more = (await listPublicResources()).filter((r) => r.id !== resource.id).slice(0, 3);

  return (
    <>
      <PageHeader
        kicker={resource.type ? (TYPE_LABEL[resource.type] ?? resource.type) : "Resource"}
        title={resource.title}
        subtitle={meta || undefined}
      />
      <section className="px-6 md:px-12 py-12 md:py-16">
        <div className="max-w-7xl mx-auto grid gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Link href="/resources" className="text-sm font-bold underline underline-offset-4 hover:text-gold-ink">
              All resources
            </Link>

            {gated ? (
              <div className="mt-6 border border-dashed border-foreground/20 p-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-ink">
                  Competition material
                </p>
                <p className="font-bebas text-2xl text-foreground mt-1">
                  This resource is for participating schools
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {lockHint(resource.access)}. Students and educators of participating
                  schools can access it from the portal.
                </p>
                <Link
                  href="/portal"
                  className="mt-5 inline-flex min-h-11 items-center bg-[#0A0F1E] px-5 text-xs font-bold uppercase tracking-[0.2em] text-white hover:bg-secondary"
                >
                  Go to the portal
                </Link>
              </div>
            ) : resource.body ? (
              <div className="prose-resource serif-display mt-6 space-y-4 text-lg leading-relaxed text-foreground">
                {resource.body.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : (
              <p className="serif-display mt-6 text-lg leading-relaxed text-muted-foreground">
                {resource.hasFile
                  ? "This resource is a file. Read it online or download it to keep."
                  : "This resource opens on another site."}
              </p>
            )}
          </div>

          <aside className="self-start bg-white p-6 md:p-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-ink">About this resource</p>
            <dl className="mt-4 divide-y divide-[rgba(10,15,30,0.1)] text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-semibold text-foreground break-words min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
            {downloadHref ? (
              <div className="mt-6 flex flex-col gap-3">
                <a
                  href={downloadHref}
                  target={resource.hasFile ? undefined : "_blank"}
                  rel={resource.hasFile ? undefined : "noopener noreferrer"}
                  className="inline-flex min-h-12 items-center justify-center bg-[#E8A020] px-6 text-xs font-bold uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-[#F5C55A]"
                >
                  {!resource.hasFile ? "Open resource" : resource.downloadable ? "Download" : "Read online"}
                </a>
                {resource.hasFile && resource.downloadable && resource.isPdf ? (
                  <a
                    href={`/api/resources/${resource.id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-12 items-center justify-center border border-foreground/25 px-6 text-xs font-bold uppercase tracking-[0.2em] text-foreground transition-colors hover:border-foreground"
                  >
                    Read online
                  </a>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>

        {more.length ? (
          <div className="max-w-7xl mx-auto mt-16">
            <h2 className="mb-5 border-b-2 border-foreground pb-3 font-bebas text-4xl leading-none text-foreground">
              More resources
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((r) => (
                <ResourceCard key={r.id} resource={r} />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
