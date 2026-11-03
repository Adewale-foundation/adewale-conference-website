"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ATTEND_BASE, attendState, ticketPath, validateAttendee } from "@/lib/finale-attend";
import { loadAttendance, registerAttendee, sendTicket } from "@/lib/finale-attend-data";
import { FINALE_YEAR, finaleDb } from "@/lib/finale-data";
import { rateLimit, requestIp } from "@/lib/rate-limit";

export type AttendFormResult = { ok: false; error: string } | { ok: true; message: string } | null;

const OUR_SIDE: AttendFormResult = { ok: false, error: "Something went wrong on our side. Please try again." };

export async function registerToAttend(_prev: AttendFormResult, formData: FormData): Promise<AttendFormResult> {
  const ip = requestIp(await headers());
  if (!rateLimit(`finale-attend:${ip}`, { limit: 5, windowMs: 60_000 })) {
    return { ok: false, error: "Too many tries from this device. Wait a minute and try again." };
  }
  // A field people never see. Bots fill it; pretend all is well and keep nothing.
  if (String(formData.get("website") ?? "")) redirect(ATTEND_BASE);

  const db = finaleDb();
  if (!db) return { ok: false, error: "Registration isn't set up yet. Please try again later." };
  const { settings, totals, error } = await loadAttendance(db, FINALE_YEAR);
  if (error) {
    console.error("finale: attendance could not load", error);
    return OUR_SIDE;
  }
  const state = attendState(settings, totals.confirmed);
  if (state === "closed") return { ok: false, error: "Registration isn't open yet." };
  if (state === "over") return { ok: false, error: "The Grand Finale has ended. Thank you for your interest." };

  const checked = validateAttendee(
    {
      firstName: formData.get("first_name"),
      lastName: formData.get("last_name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      role: formData.get("role"),
      organisation: formData.get("organisation"),
      lga: formData.get("lga"),
      studentCount: formData.get("student_count"),
      studentNames: formData.getAll("student_name"),
      studentClasses: formData.getAll("student_class"),
    },
    { requirePhone: true },
  );
  if (!checked.ok) return checked;

  const { registered, error: registerError } = await registerAttendee(db, FINALE_YEAR, checked.value, {
    source: "open",
    invitedBy: null,
    force: false,
  });
  if (registerError || !registered) {
    console.error("finale: attendee could not register", registerError);
    return OUR_SIDE;
  }

  // Never show an existing ticket to whoever typed the email: it goes to the inbox only.
  if (registered.existing) {
    await sendTicket(db, registered.id);
    return {
      ok: true,
      message: `${checked.value.email} is already registered. We've emailed the ticket to that address again. Need to change your seats? Reply to that email.`,
    };
  }

  await sendTicket(db, registered.id);
  revalidatePath(ATTEND_BASE);
  redirect(`${ticketPath(registered.refCode)}?new=1`);
}
