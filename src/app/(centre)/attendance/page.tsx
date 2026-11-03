import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { signInCentres } from "@/lib/attendance-data";
import { currentLead } from "./actions";
import SignInForm from "@/components/centre/sign-in-form";

export const metadata = pageMetadata(
  "Centre attendance",
  "Mark which candidates turned up at your exam centre.",
);
export const dynamic = "force-dynamic";

export default async function CentreSignIn() {
  if (await currentLead()) redirect("/attendance/roster");

  const { exam, camp, finale, centres } = await signInCentres();
  const open = Boolean(exam || camp || finale);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <header>
        <h1 className="font-bebas text-3xl text-foreground">Centre attendance</h1>
        <p className="serif-display mt-1 text-sm italic text-muted-foreground">
          {[exam?.title, camp?.title, finale ? "Grand Finale door check-in" : null].filter(Boolean).join(" · ") || "Adéwálé Students Conference"}
        </p>
      </header>

      {open ? (
        <SignInForm centres={centres} />
      ) : (
        <div className="border border-foreground/15 bg-card p-5 text-sm text-muted-foreground">
          Attendance is not open yet. The desk opens it on the morning of the paper, at camp, or at the Grand Finale doors.
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Use the email the exam desk registered for you. If it is not recognised, call the desk
        rather than trying another address.
      </p>
    </main>
  );
}
