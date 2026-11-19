import Link from "next/link";
import RegisterSchoolButton from "./register-school-button";
import WaitlistButton from "./waitlist-button";

/** Keeps the `#register` anchor the nav, the portal and our emails link to. */
export default function NextEditionSection({ registrationOpen }: { registrationOpen: boolean }) {
  return (
    <section id="register" className="scroll-mt-18 bg-[#0A0F1E] px-6 py-14 md:px-12 md:py-24">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-10">
        <div className="max-w-xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="block h-px w-6 bg-[#E8A020]" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-primary">For schools</span>
          </div>
          <h2 className="font-bebas text-5xl leading-[0.92] text-white md:text-7xl lg:text-8xl">
            Your school could be next.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[rgba(250,247,240,0.78)] md:text-lg">
            {registrationOpen
              ? "Registration is open to every secondary school in Ogun State, and entry is free."
              : "Registration for this edition has closed. Join the waitlist and we will email you the day the next one opens."}
          </p>
          <p className="mt-3 text-sm text-[rgba(250,247,240,0.6)]">
            <Link href="/register" className="text-primary underline underline-offset-2">Who can enter and how it works</Link>
            {" · "}Already registered?{" "}
            <Link href="/portal" className="text-primary underline underline-offset-2">Sign in to the portal</Link>
          </p>
        </div>
        <div className="flex flex-col items-start gap-4 [&>button]:mt-0">
          {registrationOpen ? <RegisterSchoolButton /> : <WaitlistButton />}
          <Link
            href="/sponsors"
            className="inline-flex min-h-12 items-center border border-[#F0EAD8] px-6 text-xs font-bold uppercase tracking-[0.2em] text-[#F0EAD8] transition-colors hover:border-primary hover:text-primary"
          >
            Become a partner
          </Link>
        </div>
      </div>
    </section>
  );
}
