import PageHeader from "@/components/layout/page-header";
import RegistrationGuide from "@/components/sections/registration-section";
import RegisterSchoolButton from "@/components/sections/register-school-button";
import WaitlistButton from "@/components/sections/waitlist-button";
import { getRegistrationOpen } from "@/lib/edition-state";
import {
  LGA_OPTIONS,
  SCHOOL_CATEGORY_OPTIONS,
  type RegistrationFormData,
} from "@/lib/forms";
import { findSchoolByName } from "@/lib/school-identity";
import { pageMetadata } from "@/lib/seo";
import { lookupWaitlistInvite, type InviteRejection } from "@/lib/waitlist-invite";
import { createAdminClient } from "@/supabase/admin";

export const metadata = pageMetadata(
  "Register Your School",
  "Enter your school for the Adewale Students Conference.",
);
// Invite tokens are read per request — never cache this page.
export const dynamic = "force-dynamic";

// Why a link didn't work, in the school's language rather than the token's.
const REJECTION_COPY: Record<Exclude<InviteRejection, "missing">, { title: string; body: string }> = {
  used: {
    title: "This invitation has been used",
    body: "Your school's registration is already in. Check the principal's and supervising teacher's inboxes for the confirmation and portal activation link — or email us if it never arrived.",
  },
  expired: {
    title: "This invitation has expired",
    body: "Invitation links are valid for a limited time. Reply to the email that brought you here and we'll send a fresh one.",
  },
  unknown: {
    title: "We couldn't find that invitation",
    body: "The link may have been cut short when it was copied. Try opening it straight from the original email, or contact us and we'll reissue it.",
  },
};

function ClosedPanel({
  title,
  body,
  showWaitlist = false,
}: {
  title: string;
  body: string;
  showWaitlist?: boolean;
}) {
  return (
    <div className="border border-[#E8A020] bg-[#1C2540] p-6 md:p-8">
      <p className="text-xs font-bold tracking-[0.3em] uppercase text-primary mb-2">{title}</p>
      <p className="text-sm md:text-base text-[rgba(250,247,240,0.75)]">
        {body} Already registered? Your school&apos;s portal stays open:{" "}
        <a href="/portal" className="text-primary underline underline-offset-2">
          sign in here
        </a>
        .
      </p>
      {showWaitlist ? <WaitlistButton /> : null}
      <p className="mt-4 text-sm text-[rgba(250,247,240,0.6)]">
        Questions?{" "}
        <a
          href="mailto:adewaleconference@gmail.com?subject=ASC%20Registration%20Invitation"
          className="text-primary underline underline-offset-2"
        >
          Email the ASC team
        </a>
        .
      </p>
    </div>
  );
}

/** Without `?invite` this mirrors the homepage. With a valid one it opens the
 * form prefilled EVEN WHEN REGISTRATION IS CLOSED — /api/registration
 * re-validates the token at submit time. */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite: inviteToken } = await searchParams;
  const { open } = await getRegistrationOpen();

  // Service role: the waitlist table is admin-only.
  const adminDb = inviteToken ? createAdminClient() : null;
  const lookup = adminDb ? await lookupWaitlistInvite(adminDb, inviteToken) : null;

  let prefill: Partial<RegistrationFormData> | undefined;
  let schoolName: string | null = null;

  if (lookup?.ok && adminDb) {
    const { invite } = lookup;
    // Prefer the canonical spelling, so an invited school lands on its existing
    // row instead of minting a near-duplicate.
    const existing = await findSchoolByName(adminDb, invite.school_name);
    const resolvedName = existing?.name ?? invite.school_name;
    schoolName = resolvedName;

    // Re-checked: an option that no longer exists would wedge its <select>.
    const lga = (LGA_OPTIONS as readonly string[]).includes(invite.lga ?? "") ? invite.lga! : "";
    const category = (SCHOOL_CATEGORY_OPTIONS as readonly string[]).includes(invite.category ?? "")
      ? invite.category!
      : "";

    prefill = {
      schoolFullName: resolvedName,
      schoolSource: existing ? "existing" : "new",
      ...(lga ? { schoolLGA: lga } : {}),
      ...(category ? { schoolCategory: category } : {}),
      teacherFullName: invite.contact_name,
      teacherEmail: invite.contact_email,
      ...(invite.phone ? { teacherNumber: invite.phone } : {}),
    };
  }

  const invited = Boolean(prefill);

  return (
    <>
      <PageHeader
        kicker={invited ? "You're invited" : "For schools"}
        title={invited ? "Complete Your Registration" : "Register Your School"}
        subtitle={
          invited
            ? `We've held a place for ${schoolName}. Your school details are already filled in — add your three student representatives, your principal, and your supervising teacher.`
            : "Every secondary school in Ogun State is eligible, and entry is free."
        }
      />
      <section className="bg-[#0A0F1E] px-6 md:px-12 pb-12 md:pb-16">
        <div className="max-w-3xl mx-auto">
          {invited ? (
            <RegisterSchoolButton
              label="Open the registration form"
              autoOpen
              prefill={prefill}
              inviteToken={inviteToken}
            />
          ) : lookup && !lookup.ok && lookup.reason !== "missing" ? (
            <ClosedPanel {...REJECTION_COPY[lookup.reason]} />
          ) : open ? (
            <RegisterSchoolButton />
          ) : (
            <ClosedPanel
              title="Registration closed"
              body="Registration for this edition has closed. Join the waitlist and we'll email you the moment the next edition opens."
              showWaitlist
            />
          )}
        </div>
      </section>
      <RegistrationGuide />
    </>
  );
}
