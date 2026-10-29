"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FINALE_BASE, validateSupport, votingState } from "@/lib/finale";
import { FINALE_YEAR, finaleDb, loadFinale } from "@/lib/finale-data";
import { currentSupporterId, finaleSecret, rememberSupporter } from "@/lib/finale-session";
import { rateLimit, requestIp } from "@/lib/rate-limit";

export type FinaleFormResult = { ok: false; error: string } | null;

const NOT_SET_UP: FinaleFormResult = { ok: false, error: "The fan vote isn't set up yet. Please try again later." };

export async function joinFinale(_prev: FinaleFormResult, formData: FormData): Promise<FinaleFormResult> {
  const ip = requestIp(await headers());
  if (!rateLimit(`finale-join:${ip}`, { limit: 5, windowMs: 60_000 })) {
    return { ok: false, error: "Too many tries from this device. Wait a minute and try again." };
  }
  // A field people never see. Bots fill it; pretend all is well and keep nothing.
  if (String(formData.get("website") ?? "")) redirect(FINALE_BASE);

  const db = finaleDb();
  if (!db || !finaleSecret()) return NOT_SET_UP;
  const existing = await currentSupporterId();
  if (existing) {
    const { data: known, error: knownError } = await db.from("finale_supporters").select("id").eq("id", existing).maybeSingle();
    if (knownError) return { ok: false, error: "Something went wrong on our side. Please try again." };
    if (known) redirect(`${FINALE_BASE}/me`);
  }

  const { settings, teams, error } = await loadFinale(db, FINALE_YEAR);
  if (error) return { ok: false, error: "Something went wrong on our side. Please try again." };
  if (votingState(settings) !== "open") return { ok: false, error: "Joining is closed for this finale." };

  const checked = validateSupport(
    {
      teamId: formData.get("team_id"),
      pickSemi1: formData.get("pick_semi1"),
      pickSemi2: formData.get("pick_semi2"),
      pickChampion: formData.get("pick_champion"),
      name: formData.get("name"),
      anonymous: formData.get("anonymous") === "on",
      cheer: formData.get("cheer"),
      phone: formData.get("phone"),
      consent: formData.get("consent") === "on",
    },
    teams,
  );
  if (!checked.ok) return checked;
  const v = checked.value;

  const { data, error: insertError } = await db
    .from("finale_supporters")
    .insert({
      edition_year: FINALE_YEAR,
      team_id: v.teamId,
      pick_semi1: v.pickSemi1,
      pick_semi2: v.pickSemi2,
      pick_champion: v.pickChampion,
      display_name: v.displayName,
      phone: v.phone,
      cheer: v.cheer,
      public_status: v.publicStatus,
    })
    .select("id")
    .single();
  if (insertError?.code === "23505") {
    // Not restoring the badge is deliberate: without a code sent to the phone,
    // anyone could type someone else's number and take over their entry.
    return { ok: false, error: "This number has already joined. Open the link on the phone you joined with." };
  }
  if (insertError || !data) return { ok: false, error: "Something went wrong on our side. Please try again." };

  await rememberSupporter(data.id as string);
  revalidatePath(FINALE_BASE, "layout");
  redirect(`${FINALE_BASE}/me?joined=1`);
}
