import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { Card, SectionHeading, StatusBadge } from "@/components/portal/ui";
import RequestInfoChangeButton from "@/components/portal/request-info-change-button";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { loadActingEntry } from "@/lib/acting-school-data";
import { getSessionUser } from "@/supabase/auth";
import { isSupabaseConfigured } from "@/supabase/env";
import type { Rep, RegistrationWithRelations } from "@/supabase/types";

export const metadata = pageMetadata("Registrations", "Your school's registrations and representatives.");
export const dynamic = "force-dynamic";

export default async function SchoolRegistrations() {
  if (!isSupabaseConfigured) redirect("/portal/login");
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");

  const [{ data, error }, { entry: acting, error: actingError }] = await Promise.all([
    supabase
      .from("registrations")
      .select("id, school_id, edition_year, status, decline_reason, reps, schools(name)")
      .order("edition_year", { ascending: false }),
    loadActingEntry(),
  ]);
  if (error || actingError) throw new Error(`Could not load your registrations: ${error?.message ?? actingError}`);
  const registrations = ((data ?? []) as unknown as (RegistrationWithRelations & { school_id: string | null })[])
    .filter((r) => !acting || r.school_id === acting.school_id);

  return (
    <div>
      <SectionHeading>Registrations &amp; representatives</SectionHeading>
      {registrations.length === 0 ? (
        <>
          <EmptyState title="No registration yet">
            Your school&apos;s registrations across editions will appear here.
          </EmptyState>
          <div className="mt-4">
            <Button asChild>
              <Link href="/#register">Register a school</Link>
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {registrations.map((r) => {
            const reps = Array.isArray(r.reps) ? (r.reps as Rep[]) : [];
            return (
              <Card key={r.id} className="p-5 md:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bebas text-2xl text-foreground">
                    {r.edition_year} edition
                  </span>
                  <StatusBadge status={r.status} />
                </div>

                {r.status === "declined" && r.decline_reason ? (
                  <div className="border-l-4 border-l-red-600 bg-red-600/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">
                      Reason from the reviewers
                    </p>
                    <p className="text-sm text-foreground mt-1">{r.decline_reason}</p>
                  </div>
                ) : null}

                {reps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No representatives on this registration.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Representatives
                    </p>
                    <div className="divide-y divide-foreground/5 border border-foreground/10">
                      {reps.map((rep, i) => (
                        <div key={i} className="p-3 text-sm text-foreground">
                          {rep.name}
                          {rep.level ? (
                            <span className="text-muted-foreground"> · {rep.level}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Representatives are locked in once registered. If a student is
                  leaving and another is taking their place, use{" "}
                  <Link
                    href="/portal/school/students"
                    className="text-primary hover:underline font-medium"
                  >
                    Students → Replace
                  </Link>{" "}
                  — an admin reviews the swap, then the old access code stops
                  working and the new student gets a fresh one.
                </p>

                <div className="flex flex-wrap items-center gap-2 border-t border-foreground/5 pt-3">
                  <p className="text-xs text-muted-foreground flex-1 min-w-40">
                    Educator or principal name or phone wrong? Ask the team to fix it.
                  </p>
                  <RequestInfoChangeButton registrationId={r.id} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
