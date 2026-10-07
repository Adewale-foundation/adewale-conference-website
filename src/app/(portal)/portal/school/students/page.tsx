import { redirect } from "next/navigation";
import { Card, SectionHeading } from "@/components/portal/ui";
import ProvisionRepButton from "@/components/portal/provision-rep-button";
import ReplaceRepButton from "@/components/portal/replace-rep-button";
import { pageMetadata } from "@/lib/seo";
import { personNameKey } from "@/lib/person-identity";
import { createClient } from "@/supabase/server";
import { loadActingEntry } from "@/lib/acting-school-data";
import { getSessionUser } from "@/supabase/auth";
import { isSupabaseConfigured } from "@/supabase/env";
import type { Rep, RegistrationWithRelations } from "@/supabase/types";

export const metadata = pageMetadata("Students", "Provision access codes for your representatives.");
export const dynamic = "force-dynamic";

export default async function SchoolStudents() {
  if (!isSupabaseConfigured) redirect("/portal/login");
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");

  const { entry: acting, error: actingError } = await loadActingEntry();
  if (actingError) throw new Error(`Could not load your school: ${actingError}`);
  // Scoped to the school being acted for, so a rep's code is never matched by
  // name against a sister school's student.
  let studentQuery = supabase.from("students").select("name, level, access_code").is("deactivated_at", null);
  if (acting?.school_id) studentQuery = studentQuery.eq("school_id", acting.school_id);
  const [{ data: regData, error: regError }, { data: studentData, error: studentError }, { data: pendingData, error: pendingError }] = await Promise.all([
    supabase
      .from("registrations")
      .select("id, school_id, edition_year, reps")
      .order("edition_year", { ascending: false }),
    studentQuery,
    supabase
      .from("student_replacements")
      .select("registration_id, old_name")
      .eq("status", "pending"),
  ]);
  const loadError = regError ?? studentError ?? pendingError;
  if (loadError) throw new Error(`Could not load your students: ${loadError.message}`);
  const registrations = ((regData ?? []) as unknown as (RegistrationWithRelations & { school_id: string | null })[])
    .filter((r) => !acting || r.school_id === acting.school_id);
  const students = (studentData ?? []) as {
    name: string;
    level: string | null;
    access_code: string;
  }[];
  // Keyed the same way provisionStudent matches, so a rep whose row is spelled
  // differently shows its existing code instead of offering to provision a
  // second one.
  const studentByName = new Map(students.map((s) => [personNameKey(s.name), s]));
  const pending = (pendingData ?? []) as {
    registration_id: string;
    old_name: string;
  }[];
  const pendingKeys = new Set(
    pending.map((p) => `${p.registration_id}|${personNameKey(p.old_name)}`),
  );

  return (
    <div>
      <SectionHeading>Students</SectionHeading>
      <p className="serif-display italic text-muted-foreground mb-5">
        When you register, each representative is automatically given an access
        code — hand each student their code to sign in (no email needed). Use
        “Provision” to issue a code for any rep that doesn&apos;t have one yet. If
        a student is leaving and another is taking their place, use “Replace” —
        an admin reviews it, then the old code stops working and the new student
        gets a fresh one.
      </p>

      {students.length > 0 ? (
        <Card className="p-5 md:p-6 mb-6">
          <p className="font-bebas text-xl text-foreground mb-3">
            Your students ({students.length})
          </p>
          <div className="divide-y divide-foreground/5 border border-foreground/10">
            {students.map((s) => (
              <div key={s.access_code} className="flex items-center justify-between gap-4 p-3">
                <span className="text-foreground">
                  {s.name}
                  {s.level ? <span className="text-muted-foreground"> · {s.level}</span> : null}
                </span>
                <span className="text-xs font-mono bg-foreground/5 px-2 py-1 rounded text-muted-foreground">
                  code: {s.access_code}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {registrations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No registrations yet — register for an edition to add representatives.
        </p>
      ) : (
        <div className="space-y-6">
          {registrations.map((r) => {
            const reps = Array.isArray(r.reps) ? (r.reps as Rep[]) : [];
            return (
              <Card key={r.id} className="p-5 md:p-6">
                <p className="font-bebas text-xl text-foreground mb-3">
                  {r.edition_year} edition
                </p>
                {reps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No representatives on this registration.
                  </p>
                ) : (
                  <div className="divide-y divide-foreground/5 border border-foreground/10">
                    {reps.map((rep, i) => {
                      const student = studentByName.get(personNameKey(rep.name));
                      const isPending = pendingKeys.has(
                        `${r.id}|${personNameKey(rep.name)}`,
                      );
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-4 p-3"
                        >
                          <span className="text-foreground">
                            {rep.name}
                            {rep.level ? (
                              <span className="text-muted-foreground"> · {rep.level}</span>
                            ) : null}
                          </span>
                          {isPending ? (
                            <span className="text-xs italic text-muted-foreground">
                              Replacement pending review
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <ProvisionRepButton
                                name={rep.name}
                                level={rep.level ?? null}
                                existingCode={student?.access_code}
                              />
                              <ReplaceRepButton
                                registrationId={r.id}
                                name={rep.name}
                                level={rep.level ?? null}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
