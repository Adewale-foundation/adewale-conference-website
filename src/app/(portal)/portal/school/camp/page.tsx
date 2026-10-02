import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, SectionHeading } from "@/components/portal/ui";
import CampCard from "@/components/portal/camp-card";
import CampResponseForm from "@/components/portal/camp-response-form";
import { campWindow, formatCampDate, goingSummary, mergeSavedEducators } from "@/lib/camp";
import { loadEducatorsOnRecord, loadMyCamp } from "@/lib/camp-data";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { getSessionUser } from "@/supabase/auth";
import { isSupabaseConfigured } from "@/supabase/env";

export const metadata = pageMetadata("ASC Camp", "Confirm your school's place at camp.");
export const dynamic = "force-dynamic";

const PACKING = [
  "School uniform for the opening ceremony and competition rounds",
  "Nightwear, underwear and a towel",
  "Comfortable shoes and slippers",
  "Toiletries: soap, toothbrush and toothpaste, sponge, hair care",
  "Bedsheet, pillowcase and a light blanket or wrapper",
  "Bucket, water bottle and a torch or rechargeable lamp",
  "Any personal medication, clearly labelled, with written instructions for the teacher",
];

export default async function SchoolCamp() {
  if (!isSupabaseConfigured) redirect("/portal/login");
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");
  const supabase = await createClient();

  const { data: reg, error: regError } = await supabase
    .from("registrations")
    .select("id, school_id, edition_year")
    .order("edition_year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (regError) throw new Error(`Could not load your registration: ${regError.message}`);

  const { camp, error: campError } = reg ? await loadMyCamp(supabase, reg.id) : { camp: null, error: null };
  if (campError) throw new Error(`Could not load camp details: ${campError}`);

  if (!reg || !camp) {
    return (
      <div className="space-y-6">
        <SectionHeading>ASC Camp</SectionHeading>
        <EmptyState title="Camp invitations go to schools that qualify for the Grand Finale. Check back once results are out." />
      </div>
    );
  }

  const [{ data: repRows, error: repError }, { educators: onRecord, error: recordError }] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, level")
      .eq("school_id", reg.school_id)
      .eq("edition_year", reg.edition_year)
      .is("deactivated_at", null)
      .order("name"),
    loadEducatorsOnRecord(supabase, reg.id),
  ]);
  if (repError) throw new Error(`Could not load your contestants: ${repError.message}`);
  if (recordError) throw new Error(`Could not load your educators: ${recordError}`);
  const reps = (repRows ?? []) as { id: string; name: string; level: string | null }[];

  const { settings, confirmation } = camp;
  const { record, extras } = mergeSavedEducators(onRecord, confirmation?.educators);
  const win = campWindow(settings, confirmation);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>{settings.title}</SectionHeading>
        <p className="serif-display italic text-muted-foreground">
          Three days of competition, from the Group Stage through to the Semi Finals.
        </p>
      </div>

      <CampCard camp={camp} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="p-5 space-y-5">
          <div>
            <h2 className="font-bebas text-2xl text-foreground">Who attends</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your three registered contestants and the educators accompanying them. Changing the
              team needs written approval from the Planning Committee. Use{" "}
              <Link href="/portal/school/students" className="font-semibold text-foreground hover:underline">
                Students
              </Link>{" "}
              to request a replacement.
            </p>
            {reps.length ? (
              <ul className="mt-3 divide-y divide-foreground/5 border border-foreground/10">
                {reps.map((r) => (
                  <li key={r.id} className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-foreground">{r.name}</span>
                    <span className="text-muted-foreground">{r.level ?? ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No contestants on file yet.</p>
            )}
          </div>

          <div className="border-t border-foreground/5 pt-5">
            <h2 className="font-bebas text-2xl text-foreground">Your response</h2>
            {win.open ? (
              <div className="mt-3">
                <CampResponseForm
                  registrationId={reg.id}
                  confirmation={confirmation}
                  record={record}
                  savedExtras={extras}
                />
              </div>
            ) : (
              <div className="mt-2 space-y-1 text-sm">
                {confirmation?.status === "attending" ? (
                  <p className="text-foreground">
                    Attending with {goingSummary(confirmation.educators) || "no educators listed"}.
                  </p>
                ) : confirmation?.status === "not_attending" ? (
                  <p className="text-foreground">Not attending: {confirmation.decline_reason}</p>
                ) : null}
                <p className="text-muted-foreground">
                  {win.reason === "released"
                    ? "This place has been offered to another school."
                    : "Responses are locked. Contact the Planning Committee to make a change."}
                </p>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5 space-y-2 text-sm">
            <h2 className="font-bebas text-xl text-foreground">Dates and venue</h2>
            <p><span className="text-muted-foreground">Arrival:</span> {formatCampDate(settings.arrival_at)}</p>
            <p><span className="text-muted-foreground">Departure:</span> {formatCampDate(settings.departure_at)}</p>
            {settings.venue ? <p><span className="text-muted-foreground">Venue:</span> {settings.venue}</p> : null}
            <p className="text-muted-foreground">
              Accreditation and room allocation happen on arrival. Full board is provided:
              accommodation, meals and refreshments.
            </p>
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="font-bebas text-xl text-foreground">What to pack (each student)</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {PACKING.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="mt-3 text-foreground">
              Students may not use mobile phones during competition rounds. Accompanying
              teachers may keep theirs.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
