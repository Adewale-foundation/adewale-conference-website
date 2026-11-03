import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PortalBody, PortalHeader } from "@/components/portal/ui";
import { createClient } from "@/supabase/server";
import { getSessionUser } from "@/supabase/auth";
import { isSupabaseConfigured } from "@/supabase/env";
import { extractYouTubeId, youTubeEmbedUrl } from "@/lib/youtube";
import FinaleInviteCard from "@/components/portal/finale-invite-card";
import { loadActingEntry } from "@/lib/acting-school-data";

export const dynamic = "force-dynamic";

const AREAS = {
  student: {
    href: "/portal/student",
    label: "Student dashboard",
    desc: "Your status, schedule, resources, and certificate.",
    links: [
      { href: "/portal/student/practice", label: "Practice drills", desc: "Offline speed practice" },
      { href: "/portal/student/exams", label: "Exams", desc: "Graded CBT" },
      { href: "/portal/student/resources", label: "Study packs", desc: "Past questions & guides" },
      { href: "/portal/student/results", label: "My results", desc: "Scores & conference results" },
    ],
  },
  coordinator: {
    href: "/portal/school",
    label: "School dashboard",
    desc: "Manage your reps, registration status, and materials.",
    links: [
      { href: "/portal/school/students", label: "My students", desc: "Reps & student codes" },
      { href: "/portal/school/registrations", label: "Registrations", desc: "Status & submissions" },
      { href: "/portal/school/results", label: "Results", desc: "Scores & conference results" },
      { href: "/portal/school/plans", label: "Study plans", desc: "Assigned study paths" },
    ],
  },
  admin: {
    href: "/portal/admin",
    label: "Admin console",
    desc: "Verify registrations, issue certificates, manage content.",
    links: [
      { href: "/portal/admin/registrations", label: "Registrations", desc: "Verify & qualify schools" },
      { href: "/portal/admin/schools", label: "Schools", desc: "Directory & memberships" },
      { href: "/portal/admin/assessments", label: "Assessments", desc: "Exams & practice drills" },
      { href: "/portal/admin/editions", label: "Editions", desc: "Stages & schedules" },
    ],
  },
} as const;

type Role = keyof typeof AREAS;

export default async function PortalHome() {
  if (!isSupabaseConfigured) redirect("/portal/login");

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");

  let role: Role = "student";
  const [{ data: profile }, { data: videoSetting }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "home_video_url")
      .maybeSingle(),
  ]);
  if (profile?.role && profile.role in AREAS) role = profile.role as Role;

  const area = AREAS[role];
  // Educators get the school's Grand Finale invitation here too, not only on the school dashboard.
  const { entry: schoolEntry, error: schoolError } = role === "coordinator" ? await loadActingEntry() : { entry: null, error: null };
  if (schoolError) console.error("portal home: acting school", schoolError);
  const videoId = videoSetting?.value ? extractYouTubeId(videoSetting.value as string) : null;

  return (
    <>
      <PortalHeader
        title={profile?.full_name ? `Welcome, ${profile.full_name}` : "Welcome"}
        subtitle={user.email ?? undefined}
      />
      <PortalBody>
        {schoolEntry?.school_id ? <FinaleInviteCard schoolId={schoolEntry.school_id} editionYear={schoolEntry.edition_year} /> : null}
        <Link href={area.href} className="block group">
          <Card interactive className="p-7 md:p-8">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
              {role}
            </span>
            <h2 className="font-bebas text-4xl text-foreground mt-2">
              {area.label}
            </h2>
            <p className="serif-display italic text-muted-foreground mt-1">
              {area.desc}
            </p>
            <span className="inline-block mt-4 text-xs uppercase tracking-[0.2em] text-primary">
              Open →
            </span>
          </Card>
        </Link>

        {videoId ? (
          <Card className="p-2 overflow-hidden">
            <div className="aspect-video w-full overflow-hidden rounded">
              <iframe
                src={youTubeEmbedUrl(videoId)}
                title="From the conference team"
                className="w-full h-full"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {area.links.map((l) => (
            <Link key={l.href} href={l.href} className="block group">
              <Card interactive className="p-5 h-full">
                <h3 className="font-bebas text-xl text-foreground">{l.label}</h3>
                <p className="text-sm text-muted-foreground mt-1">{l.desc}</p>
                <span className="inline-block mt-3 text-[10px] uppercase tracking-[0.2em] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Open →
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </PortalBody>
    </>
  );
}
