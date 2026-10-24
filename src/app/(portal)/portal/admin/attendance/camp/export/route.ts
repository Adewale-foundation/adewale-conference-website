import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/supabase/server";
import { canViewModule } from "@/supabase/auth";
import { toCsv } from "@/lib/csv";
import { campAttendanceMatrix, campDays } from "@/lib/camp-attendance";
import { loadCampMarks, loadCampPeople } from "@/lib/camp-attendance-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await canViewModule("participants"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const year = Number(request.nextUrl.searchParams.get("edition"));
  if (!Number.isInteger(year)) return new NextResponse("Choose an edition.", { status: 400 });

  const supabase = await createClient();
  const { settings, people, error } = await loadCampPeople(supabase, year);
  // A half-built sheet is worse than no download: it looks complete.
  if (error) return new NextResponse(`Could not build the export: ${error}`, { status: 500 });
  let marks;
  try {
    marks = await loadCampMarks(supabase, year);
  } catch (e) {
    return new NextResponse(`Could not build the export: ${(e as Error).message}`, { status: 500 });
  }

  const days = campDays(settings?.arrival_at, settings?.departure_at);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(campAttendanceMatrix(people, days, marks), { bom: true }), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="camp-${year}-attendance-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
