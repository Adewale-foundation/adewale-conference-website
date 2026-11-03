import { NextResponse } from "next/server";
import { createClient } from "@/supabase/server";
import { canManageModule } from "@/supabase/auth";
import { toCsv } from "@/lib/csv";
import { FINALE_SUPPORTER_PHONE_COLUMNS, finaleSupportersCsvMatrix } from "@/lib/finale";
import { FINALE_YEAR } from "@/lib/finale-data";
import type { FinaleSettings, FinaleSupporter, FinaleTeam } from "@/supabase/types";

export const dynamic = "force-dynamic";

const PAGE = 1000;

// Manage, not view: this file carries every supporter's phone number.
export async function GET() {
  if (!(await canManageModule("participants"))) return new NextResponse("Forbidden", { status: 403 });
  const supabase = await createClient();
  const year = FINALE_YEAR;

  const [settingsRes, teamsRes] = await Promise.all([
    supabase.from("finale_settings").select("semi1_winner_id, semi2_winner_id, champion_team_id").eq("edition_year", year).maybeSingle(),
    supabase.from("finale_teams").select("id, name").eq("edition_year", year),
  ]);
  const error = settingsRes.error ?? teamsRes.error;
  if (error) return new NextResponse(`Could not build the export: ${error.message}`, { status: 500 });

  // Paged, because PostgREST silently stops at its max-rows setting.
  const rows: FinaleSupporter[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error: pageError } = await supabase
      .from("finale_supporters")
      .select("*")
      .eq("edition_year", year)
      .order("created_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (pageError) return new NextResponse(`Could not build the export: ${pageError.message}`, { status: 500 });
    rows.push(...((data ?? []) as FinaleSupporter[]));
    if (!data || data.length < PAGE) break;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(
    toCsv(
      finaleSupportersCsvMatrix(
        rows,
        (teamsRes.data ?? []) as Pick<FinaleTeam, "id" | "name">[],
        (settingsRes.data as Pick<FinaleSettings, "semi1_winner_id" | "semi2_winner_id" | "champion_team_id"> | null) ?? null,
      ),
      { bom: true, formulaGuardColumns: FINALE_SUPPORTER_PHONE_COLUMNS },
    ),
    {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="finale-${year}-supporters-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
