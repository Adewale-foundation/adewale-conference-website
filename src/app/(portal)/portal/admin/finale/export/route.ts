import { NextResponse } from "next/server";
import { createClient } from "@/supabase/server";
import { canManageModule } from "@/supabase/auth";
import { chunk } from "@/lib/batch";
import { toCsv } from "@/lib/csv";
import { ATTENDEE_PHONE_COLUMNS, attendeesCsvMatrix } from "@/lib/finale-attend";
import { FINALE_YEAR } from "@/lib/finale-data";
import type { FinaleAttendee, FinaleAttendeeStudent } from "@/supabase/types";

export const dynamic = "force-dynamic";

const PAGE = 1000;

// Manage, not view: this file carries every attendee's email and phone.
export async function GET() {
  if (!(await canManageModule("participants"))) return new NextResponse("Forbidden", { status: 403 });
  const supabase = await createClient();
  const year = FINALE_YEAR;

  // Paged, because PostgREST silently stops at its max-rows setting.
  const rows: FinaleAttendee[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("finale_attendees")
      .select("*")
      .eq("edition_year", year)
      .order("created_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return new NextResponse(`Could not build the export: ${error.message}`, { status: 500 });
    rows.push(...((data ?? []) as FinaleAttendee[]));
    if (!data || data.length < PAGE) break;
  }

  const pages = await Promise.all(
    chunk(rows.map((r) => r.id), 100).map((ids) =>
      supabase.from("finale_attendee_students").select("*").in("attendee_id", ids),
    ),
  );
  const failed = pages.find((p) => p.error);
  if (failed?.error) return new NextResponse(`Could not build the export: ${failed.error.message}`, { status: 500 });
  const students = pages.flatMap((p) => (p.data ?? []) as FinaleAttendeeStudent[]);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(attendeesCsvMatrix(rows, students), { bom: true, formulaGuardColumns: ATTENDEE_PHONE_COLUMNS }), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finale-${year}-attendees-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
