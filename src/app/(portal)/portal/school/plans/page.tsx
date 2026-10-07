import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, SectionHeading } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/submit-button";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { loadActingEntry } from "@/lib/acting-school-data";
import { getSessionUser } from "@/supabase/auth";
import { isSupabaseConfigured } from "@/supabase/env";
import { SUBJECTS, LEVELS } from "@/lib/assessments";
import { createPlan } from "./actions";
import { Select } from "@/components/ui/select";

export const metadata = pageMetadata("Learning plans", "Build and assign study plans.");
export const dynamic = "force-dynamic";

const inputCls =
  "rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary";

export default async function SchoolPlans() {
  if (!isSupabaseConfigured) redirect("/portal/login");
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");

  // A plan is only visible to students when published AND assigned to someone.
  // Assignments are fetched unfiltered (RLS scopes them to this school) so both
  // queries run concurrently.
  const [{ data }, { data: asgData }, { entry: acting }] = await Promise.all([
    supabase
      .from("learning_plans")
      .select("id, title, subject, level, published, school_id")
      .order("created_at", { ascending: false }),
    supabase.from("plan_assignments").select("plan_id"),
    loadActingEntry(),
  ]);
  // A sister school's plans stay out; plans with no school (templates) stay in.
  const plans = (
    (data ?? []) as {
      id: string;
      title: string;
      subject: string | null;
      level: string | null;
      published: boolean;
      school_id: string | null;
    }[]
  ).filter((p) => !acting?.school_id || !p.school_id || p.school_id === acting.school_id);
  const assignedIds = new Set(((asgData ?? []) as { plan_id: string }[]).map((a) => a.plan_id));
  const planState = (p: { id: string; published: boolean }) =>
    !p.published ? "draft" : assignedIds.has(p.id) ? "live" : "unassigned";
  const STATE_BADGE: Record<string, string> = {
    live: "bg-green-100 text-green-800",
    unassigned: "bg-primary/15 text-gold-ink",
    draft: "bg-foreground/5 text-muted-foreground",
  };
  const STATE_LABEL: Record<string, string> = {
    live: "Live",
    unassigned: "Not assigned",
    draft: "Draft",
  };

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>New learning plan</SectionHeading>
        <Card className="p-5 md:p-6">
          <form action={createPlan} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input name="title" required placeholder="Plan title" className={`sm:col-span-2 ${inputCls}`} />
            <Select name="subject" defaultValue="">
              <option value="">Subject (optional)</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select name="level" defaultValue="">
              <option value="">Level (optional)</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
            <SubmitButton size="sm" className="lg:w-40" pendingText="Creating…">Create &amp; build</SubmitButton>
          </form>
        </Card>
      </div>

      <div>
        <SectionHeading>Your plans</SectionHeading>
        {plans.length === 0 ? (
          <p className="serif-display italic text-muted-foreground">
            No plans yet — create one above to sequence study for your students.
          </p>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <Card key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/portal/school/plans/${p.id}`} className="font-bebas text-xl text-foreground hover:text-primary">
                      {p.title}
                    </Link>
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATE_BADGE[planState(p)]}`}>
                      {STATE_LABEL[planState(p)]}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[p.subject, p.level].filter(Boolean).join(" · ") || "All subjects"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/portal/school/plans/${p.id}/progress`}>Progress</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/portal/school/plans/${p.id}`}>Build</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
