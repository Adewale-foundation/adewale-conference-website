import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { loadSitting } from "@/lib/attendance-data";
import { campRegister, campRegisterEntries, formatCampDay } from "@/lib/camp-attendance";
import { loadCampMarks, loadCampPeople } from "@/lib/camp-attendance-data";
import { createAdminClient } from "@/supabase/admin";
import { currentLead, markCampPerson, markCampRemainingAbsent } from "../actions";
import AttendanceRegister from "@/components/centre/attendance-register";

export const metadata = pageMetadata("Register", "Mark attendance at your centre.");
export const dynamic = "force-dynamic";

export default async function CentreRoster() {
  const session = await currentLead();
  if (!session) redirect("/attendance");

  if (session.kind === "camp") {
    const { lead, camp, day, days } = session;
    const supabase = createAdminClient();
    if (!supabase) throw new Error("Attendance needs SUPABASE_SECRET_KEY to be set.");
    const [{ people, error }, marks] = await Promise.all([
      loadCampPeople(supabase, camp.edition_year),
      loadCampMarks(supabase, camp.edition_year, day),
    ]);
    if (error) throw new Error(error);
    return (
      <AttendanceRegister
        key={day}
        variant="camp"
        centreName={`${lead.centre.name}, ${lead.centre.town}`}
        leadName={lead.name}
        examTitle={`${camp.title} · ${formatCampDay(day, days)}`}
        roster={campRegisterEntries(campRegister(people, marks))}
        walkIns={[]}
        mark={markCampPerson.bind(null, day)}
        sweepAction={markCampRemainingAbsent.bind(null, day)}
      />
    );
  }

  const { lead, exam } = session;

  // Registration ids are for admin links; centre staff have no use for them in the browser.
  const entries = (await loadSitting(exam)).entries.map(({ registrationId: _, ...e }) => e);

  const mine = entries.filter((e) => e.centreId === lead.centre_id);
  // Nobody allocated these, so no lead's register shows them by default and any
  // lead may take them as a walk-in. They are searched, never listed — a
  // scrollable list of every unallocated candidate invites marking the wrong one.
  const walkIns = entries.filter((e) => e.centreId === null);

  return (
    <AttendanceRegister
      centreName={`${lead.centre.name}, ${lead.centre.town}`}
      leadName={lead.name}
      examTitle={exam.title}
      roster={mine}
      walkIns={walkIns}
    />
  );
}
