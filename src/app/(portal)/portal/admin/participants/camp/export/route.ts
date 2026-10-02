import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/supabase/server";
import { canViewModule } from "@/supabase/auth";
import { toCsv } from "@/lib/csv";
import { campCsvMatrix } from "@/lib/camp";
import { loadCampRoster } from "@/lib/camp-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await canViewModule("participants"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const year = Number(request.nextUrl.searchParams.get("edition"));
  if (!Number.isInteger(year)) return new NextResponse("Choose an edition.", { status: 400 });

  const supabase = await createClient();
  const { rows, error } = await loadCampRoster(supabase, year);
  // A half-built sheet is worse than no download: it looks complete.
  if (error) return new NextResponse(`Could not build the export: ${error}`, { status: 500 });

  const stamp = new Date().toISOString().slice(0, 10);
  // Phones sit inside the "Educators attending" text, so they keep their leading zero.
  return new NextResponse(toCsv(campCsvMatrix(rows), { bom: true }), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="camp-${year}-${stamp}.csv"`,
    },
  });
}
