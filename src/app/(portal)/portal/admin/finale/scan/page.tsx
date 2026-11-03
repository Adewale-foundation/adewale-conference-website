import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalBody, PortalHeader } from "@/components/portal/ui";
import FinaleDoor from "@/components/centre/finale-door";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, getSessionUser, requireModuleView } from "@/supabase/auth";
import { adminCheckInAtDoor, adminDoorCounts, adminLookupDoorTickets } from "../actions";

export const metadata = pageMetadata("Scan tickets", "Scan Grand Finale tickets and check guests in.");
export const dynamic = "force-dynamic";

export default async function AdminFinaleScan() {
  await requireModuleView("participants");
  if (!(await canManageModule("participants"))) redirect("/portal/admin/finale");
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: profile, error } = user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null, error: null };
  if (error) console.error("finale scan: profile", error.message);

  return (
    <>
      <PortalHeader title="Scan tickets" subtitle="Grand Finale door check-in" />
      <PortalBody>
        <Link href="/portal/admin/finale" className="text-sm text-muted-foreground hover:text-foreground">← Attendees</Link>
        <FinaleDoor
          embedded
          staffName={(profile?.full_name as string | null) ?? user?.email ?? "admin"}
          initialCounts={await adminDoorCounts()}
          lookupDoorTickets={adminLookupDoorTickets}
          checkInAtDoor={adminCheckInAtDoor}
          doorCounts={adminDoorCounts}
        />
      </PortalBody>
    </>
  );
}
