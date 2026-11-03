import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/portal/action-form";
import { SubmitButton } from "@/components/portal/submit-button";
import { ATTEND_BASE, GRAND_FINALE, normalizeRefCode } from "@/lib/finale-attend";
import { loadTicket, ticketQrSvg } from "@/lib/finale-attend-data";
import { finaleDb } from "@/lib/finale-data";
import { canManageModule } from "@/supabase/auth";
import { checkInAttendee } from "@/app/(portal)/portal/admin/finale/actions";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Grand Finale ticket", robots: { index: false, follow: false } };

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const [{ ref }, { new: isNew }] = await Promise.all([params, searchParams]);
  const code = normalizeRefCode(ref);
  const db = finaleDb();
  if (!code || !db) notFound();
  const { ticket, error } = await loadTicket(db, code);
  if (error) throw new Error(`Could not load the ticket: ${error}`);
  if (!ticket) notFound();

  // The QR opens this page, so door staff signed in to the portal check people in here.
  const [qr, canCheckIn] = await Promise.all([ticketQrSvg(ticket.ref_code), canManageModule("participants")]);
  const waiting = ticket.status === "waitlisted";
  const cancelled = ticket.status === "cancelled";

  return (
    <section className="bg-[#0A0F1E] px-4 py-14 text-[#F0EAD8] md:px-12 md:py-20">
      <div className="mx-auto max-w-3xl">
        <Link href={ATTEND_BASE} className="text-sm text-[#F0EAD8]/60 hover:text-white">← Grand Finale</Link>
        {isNew ? (
          <p className="mt-6 text-lg text-white">
            {waiting ? "You're on the waitlist. We've emailed you, and we'll email again when seats open." : "You're registered. We've emailed this ticket to you as well."}
          </p>
        ) : null}

        <div className="mt-6 grid overflow-hidden rounded-md bg-[#FAF7F0] text-[#0A0F1E] sm:grid-cols-[1fr_13rem]">
          <div className="grid min-w-0 gap-3.5 border-b-2 border-dashed border-[#0A0F1E]/25 p-7 sm:border-b-0 sm:border-r-2">
            <span className={`text-[11px] font-extrabold uppercase tracking-[0.2em] ${cancelled ? "text-destructive" : waiting ? "text-[#B45309]" : "text-[#1F7A4D]"}`}>
              ● {cancelled ? "Cancelled" : waiting ? "On the waitlist" : ticket.checked_in_at ? "Checked in" : ticket.seats > 1 ? "Seats secured" : "Seat secured"}
            </span>
            <h1 className="text-4xl font-black uppercase leading-none tracking-tight">
              {ticket.first_name} {ticket.last_name.slice(0, 1)}.
            </h1>
            {ticket.organisation ? <p className="text-sm text-muted-foreground">{ticket.organisation}</p> : null}
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Seats</dt>
                <dd>{ticket.seats}{ticket.student_count ? ` (you + ${ticket.student_count})` : ""}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Date</dt>
                <dd>{GRAND_FINALE.shortDate} 2026</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Doors</dt>
                <dd>9am</dd>
              </div>
              <div className="col-span-full">
                <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Venue</dt>
                <dd>{GRAND_FINALE.venue}, {GRAND_FINALE.venueArea}</dd>
              </div>
            </dl>
          </div>
          <div className="grid content-center justify-items-center gap-2.5 bg-muted p-6">
            {!waiting && !cancelled ? (
              <div className="size-40 bg-white p-2 [&>svg]:size-full" aria-label={`QR code for ${ticket.ref_code}`} dangerouslySetInnerHTML={{ __html: qr }} />
            ) : null}
            <p className="font-mono text-2xl font-bold tracking-wider">{ticket.ref_code}</p>
          </div>
        </div>

        {!waiting && !cancelled ? (
          <p className="mt-5 max-w-2xl text-sm text-[#F0EAD8]/70">
            Show the QR code or say <b className="text-white">{ticket.ref_code}</b> at the door.
            {ticket.student_count ? " Arrive with your students and check in as one group." : ""}
          </p>
        ) : null}

        {canCheckIn && ticket.status === "confirmed" ? (
          <div className="mt-8 rounded-md border border-primary/50 bg-[#141B2E] p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">Door check-in (staff)</p>
            <ActionForm action={checkInAttendee.bind(null, ticket.id, !!ticket.checked_in_at)} className="mt-3" successClassName="text-sm text-[#F0EAD8]/80">
              <SubmitButton size="sm" pendingText="Saving…">
                {ticket.checked_in_at ? "Undo check-in" : `Check in ${ticket.seats} seat${ticket.seats === 1 ? "" : "s"}`}
              </SubmitButton>
            </ActionForm>
          </div>
        ) : null}
      </div>
    </section>
  );
}
