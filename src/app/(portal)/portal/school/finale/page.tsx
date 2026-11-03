import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState } from "@/components/portal/ui";
import FinaleSchoolForm, { type FinaleSchoolInitial } from "@/components/portal/finale-school-form";
import { educatorKey, formatCampDate } from "@/lib/camp";
import { loadEducatorsOnRecord } from "@/lib/camp-data";
import { loadActingEntry } from "@/lib/acting-school-data";
import { ATTEND_BASE, GRAND_FINALE, schoolInviteState, ticketPath } from "@/lib/finale-attend";
import { loadAttendance, loadSchoolResponse, ticketQrSvg } from "@/lib/finale-attend-data";
import { FINALE_YEAR, finaleDb } from "@/lib/finale-data";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { getSessionUser } from "@/supabase/auth";
import { isSupabaseConfigured } from "@/supabase/env";

export const metadata = pageMetadata("Grand Finale", "Accept the Grand Finale invitation and say who is coming.");
export const dynamic = "force-dynamic";

export default async function SchoolFinale() {
  if (!isSupabaseConfigured) redirect("/portal/login");
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");
  const { entry, error: entryError } = await loadActingEntry();
  if (entryError) throw new Error(`Could not load your school: ${entryError}`);
  if (!entry?.school_id || entry.edition_year !== FINALE_YEAR) {
    return <EmptyState title="Grand Finale invitations">The invitation is for schools registered for ASC {FINALE_YEAR}.</EmptyState>;
  }

  const schoolId = entry.school_id;
  const db = finaleDb();
  if (!db) throw new Error("The Grand Finale needs SUPABASE_SECRET_KEY to be set.");
  const supabase = await createClient();
  // Service-role reads below are scoped to entry.school_id, which loadActingEntry read under RLS. Students
  // too: their RLS admits approved members only, not a coordinator who just owns the entry.
  const [attendance, { response, error: responseError }, { educators, error: educatorsError }, studentsRes] = await Promise.all([
    loadAttendance(db, FINALE_YEAR),
    loadSchoolResponse(db, FINALE_YEAR, schoolId),
    loadEducatorsOnRecord(supabase, entry.id),
    db
      .from("students")
      .select("id, name, level")
      .eq("school_id", schoolId)
      .eq("edition_year", entry.edition_year)
      .is("deactivated_at", null)
      .order("name"),
  ]);
  const loadError = attendance.error ?? responseError ?? educatorsError ?? studentsRes.error?.message;
  if (loadError) throw new Error(`Could not load the Grand Finale invitation: ${loadError}`);

  const state = schoolInviteState(attendance.settings);
  const students = (studentsRes.data ?? []) as { id: string; name: string; level: string | null }[];
  const keyed = educators.map((e) => ({ key: educatorKey(e), name: e.name, phone: e.phone, email: e.email }));

  // Lay the saved answer over the record: matched educators are ticked, the rest come back as "other".
  const saved = response?.status !== "cancelled" ? response : null;
  const savedEducators = saved?.educators ?? [];
  const matches = (e: (typeof keyed)[number], s: { name: string; email: string | null }) =>
    educatorKey({ name: s.name, email: s.email }) === e.key || s.name === e.name;
  // A first answer starts from the record (the teacher, then every registered student) so the school trims rather than builds.
  const initial: FinaleSchoolInitial = !response
    ? {
        attending: "",
        going: keyed.slice(0, 1).map((e) => e.key),
        others: [],
        studentIds: students.map((s) => s.id),
        extras: [],
        studentCount: students.length,
      }
    : {
    attending: response ? (response.status === "cancelled" ? "no" : "yes") : "",
    going: keyed.filter((e) => savedEducators.some((s) => matches(e, s))).map((e) => e.key),
    others: savedEducators.filter((s) => !keyed.some((e) => matches(e, s))).map((s) => ({ name: s.name, phone: s.phone ?? "" })),
    studentIds: (saved?.students ?? []).flatMap((s) => (s.student_id && students.some((x) => x.id === s.student_id) ? [s.student_id] : [])),
    extras: (saved?.students ?? []).filter((s) => !s.student_id).map((s) => ({ name: s.full_name, cls: s.class ?? "" })),
    studentCount: saved?.student_count ?? 0,
  };
  const qr = saved?.status === "confirmed" ? await ticketQrSvg(saved.ref_code) : null;

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="bg-[#0A0F1E] p-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">ASC {FINALE_YEAR} · Grand Finale invitation</p>
          <p className="mt-1 font-bebas text-3xl leading-tight">{GRAND_FINALE.theme}</p>
          <p className="text-sm text-white/70">{GRAND_FINALE.subtheme}</p>
          <p className="mt-3 text-sm text-white/85">
            {GRAND_FINALE.dateLabel} · {GRAND_FINALE.timeLabel} · {GRAND_FINALE.venue}, {GRAND_FINALE.venueArea}
          </p>
          <Link href={ATTEND_BASE} target="_blank" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
            About the day ↗
          </Link>
        </div>
        <div className="p-6 text-sm text-muted-foreground">
          Bring your students to watch the semi-finals and the final, see the project exhibition and the awards. Tell us who is
          coming and we&apos;ll email you one ticket for the whole group.
          {attendance.settings?.school_respond_by ? (
            <> Reply by <b className="text-foreground">{formatCampDate(attendance.settings.school_respond_by)}</b>.</>
          ) : null}
        </div>
      </Card>

      {saved ? (
        <Card className={`flex flex-wrap items-center justify-between gap-5 border-l-4 p-5 ${saved.status === "confirmed" ? "border-l-green-600" : "border-l-primary"}`}>
          <div className="min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${saved.status === "confirmed" ? "text-green-700" : "text-gold-ink"}`}>
              {saved.status === "confirmed" ? "Seats confirmed" : "On the waitlist"}
            </p>
            <p className="mt-1 font-bebas text-2xl leading-tight">
              {saved.seats} seats · {(saved.educators ?? []).length} educator{(saved.educators ?? []).length === 1 ? "" : "s"} and {saved.student_count} student{saved.student_count === 1 ? "" : "s"}
            </p>
            <p className="text-sm text-muted-foreground">
              Ticket <span className="font-mono font-bold text-foreground">{saved.ref_code}</span>, emailed to {saved.email}.{" "}
              <Link href={ticketPath(saved.ref_code)} className="font-semibold text-gold-ink hover:underline">Open the ticket</Link>
            </p>
          </div>
          {qr ? <div className="size-28 shrink-0 bg-white p-1.5 [&>svg]:size-full" aria-label={`QR code for ${saved.ref_code}`} dangerouslySetInnerHTML={{ __html: qr }} /> : null}
        </Card>
      ) : null}

      <Card className="p-6">
        <h2 className="text-xl font-bold text-foreground">{saved ? "Change your answer" : "Your answer"}</h2>
        {state === "open" ? (
          <div className="mt-4">
            <FinaleSchoolForm registrationId={entry.id} educators={keyed} students={students} initial={initial} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {state === "past-deadline"
              ? "The reply-by date has passed. To change your answer, reply to your ticket email or contact the ASC team."
              : "The Grand Finale has ended. Thank you."}
          </p>
        )}
      </Card>
    </>
  );
}
