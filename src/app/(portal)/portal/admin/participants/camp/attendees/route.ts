import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/supabase/server";
import { canViewModule } from "@/supabase/auth";
import { toCsv } from "@/lib/csv";
import { CAMP_ATTENDEE_PHONE_COLUMNS, campAttendeesCsvMatrix } from "@/lib/camp";
import { loadCampAttendees } from "@/lib/camp-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await canViewModule("participants"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const year = Number(request.nextUrl.searchParams.get("edition"));
  if (!Number.isInteger(year)) return new NextResponse("Choose an edition.", { status: 400 });

  const supabase = await createClient();
  const { attendees, error } = await loadCampAttendees(supabase, year);
  if (error) return new NextResponse(`Could not build the export: ${error}`, { status: 500 });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(
    toCsv(campAttendeesCsvMatrix(attendees), { bom: true, formulaGuardColumns: CAMP_ATTENDEE_PHONE_COLUMNS }),
    {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="camp-${year}-attendees-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
