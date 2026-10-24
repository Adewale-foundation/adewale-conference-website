import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/supabase/server";
import { canViewModule } from "@/supabase/auth";
import { toCsv } from "@/lib/csv";
import { buildXlsx } from "@/lib/xlsx";
import { latestEventByStudent, markerName, type AttendanceEvent } from "@/lib/attendance";
import { loadSitting, registerExam } from "@/lib/attendance-data";

export const dynamic = "force-dynamic";

// The register as a sheet — one row per candidate, with who marked them and
// when. `?format=xlsx` selects Excel, otherwise CSV. Gated on participants VIEW,
// since exporting is a read. No access codes: the code is a code-login student's
// auth password and never belongs in a file that leaves the portal.

export async function GET(request: NextRequest) {
  if (!(await canViewModule("participants"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const exam = await registerExam(request.nextUrl.searchParams.get("exam"));
  if (!exam) return new NextResponse("No sitting has a register yet.", { status: 404 });

  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const supabase = await createClient();

  const { centres, entries } = await loadSitting(exam);

  const { data: eventRows, error } = await supabase
    .from("paper_exam_attendance_events")
    .select("student_id, at, centre_leads(name), profiles(full_name, email)")
    .eq("exam_id", exam.id)
    .order("at", { ascending: false });
  // A half-built sheet is worse than no download: it looks complete.
  if (error) {
    return new NextResponse(`Could not build the export: ${error.message}`, { status: 500 });
  }

  const latest = latestEventByStudent((eventRows ?? []) as unknown as AttendanceEvent[]);
  const centreLabel = new Map(centres.map((c) => [c.id, `${c.name}, ${c.town}`]));

  const matrix: (string | number)[][] = [
    ["Candidate number", "Name", "School", "Class", "Centre", "Status", "Marked by", "Marked at"],
    ...entries.map((e) => {
      const event = latest.get(e.studentId);
      return [
        e.examNo,
        e.name,
        e.schoolName,
        e.level ?? "",
        e.centreId ? (centreLabel.get(e.centreId) ?? "") : "Not allocated",
        e.state === "unmarked" ? "Not marked" : e.state,
        markerName(event),
        event?.at ?? "",
      ];
    }),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `attendance-${exam.edition_year}-${stamp}.${format}`;

  if (format === "xlsx") {
    return new NextResponse(buildXlsx(matrix, "Attendance"), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return new NextResponse(toCsv(matrix), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
