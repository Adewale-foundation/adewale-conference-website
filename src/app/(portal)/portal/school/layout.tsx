import { redirect } from "next/navigation";
import SchoolSidebar from "@/components/portal/school-sidebar";
import { createClient } from "@/supabase/server";
import { getSessionUser } from "@/supabase/auth";
import { isSupabaseConfigured } from "@/supabase/env";
import { isCampEligible } from "@/lib/camp";
import { loadActingEntry } from "@/lib/acting-school-data";
import SchoolSwitcher from "@/components/portal/school-switcher";

export default async function SchoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured) redirect("/portal/login");

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");

  // Prefer a registration's school; otherwise fall back to an approved
  // membership — both fetched concurrently since either may win.
  const [{ entry: reg, choices, error: regError }, { data: mem }] = await Promise.all([
    loadActingEntry(),
    supabase
      .from("school_members")
      .select("schools(name)")
      .eq("status", "approved")
      .limit(1)
      .maybeSingle(),
  ]);
  if (regError) throw new Error(`Could not load your school: ${regError}`);
  const schoolName =
    reg?.schoolName ??
    (mem?.schools as unknown as { name: string | null } | null)?.name ??
    null;
  // A school an admin added by hand has no qualifying result, only the flag.
  const { data: manual, error: manualError } = reg
    ? await supabase
        .from("camp_confirmations")
        .select("id")
        .eq("registration_id", reg.id)
        .eq("invited_manually", true)
        .maybeSingle()
    : { data: null, error: null };
  if (manualError) console.error("camp invite", manualError.message);
  const showCamp = isCampEligible(reg?.status ?? null, reg?.stageResults ?? null, Boolean(manual));

  return (
    <div className="px-4 md:px-6 py-6 md:py-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="font-bebas text-3xl md:text-4xl text-foreground leading-[0.95]">
          {schoolName ?? "Your school"}
        </h1>
        <p className="serif-display italic text-muted-foreground mt-0.5 mb-6">
          Manage your representatives and track results
        </p>
        <SchoolSwitcher choices={choices} current={reg?.school_id ?? null} />
        <div className="flex flex-col md:flex-row md:gap-6">
          <aside className="md:w-56 shrink-0">
            <SchoolSidebar showCamp={showCamp} />
          </aside>
          <div className="flex-1 min-w-0 space-y-6 pb-24 md:pb-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
