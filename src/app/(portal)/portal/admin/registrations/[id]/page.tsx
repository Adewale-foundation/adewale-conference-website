import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  PortalBody,
  PortalHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/portal/ui";
import { RegistrationDetails } from "@/components/portal/registration-details";
import { RegistrationContactEditor } from "@/components/portal/registration-contact-editor";
import { Select } from "@/components/ui/select";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { safeBack } from "@/lib/admin-links";
import type { RegistrationStatus, Rep } from "@/supabase/types";
import { setRegistrationStatus } from "../../actions";

export const metadata = pageMetadata("Registration details", "Review a school registration.");
export const dynamic = "force-dynamic";

const STATUSES: RegistrationStatus[] = ["submitted", "verified", "declined"];

type DetailRegistration = {
  id: string;
  school_id: string | null;
  edition_year: number;
  status: RegistrationStatus;
  decline_reason: string | null;
  claim_code: string | null;
  contact_email: string | null;
  contact_name: string | null;
  onboarded_at: string | null;
  provisioned_count: number | null;
  reps: unknown;
  details: Record<string, string> | null;
  schools: { name: string | null; lga: string | null; category: string | null } | null;
  profiles: { email: string | null; full_name: string | null } | null;
};

type MemberRow = {
  email: string;
  full_name: string | null;
  status: string;
  profile_id: string | null;
  onboarded_at: string | null;
};

function value(details: Record<string, string> | null, key: string) {
  const raw = details?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function activationText(member: MemberRow | undefined, fallbackActive: boolean) {
  if (fallbackActive || member?.profile_id) return "Active";
  if (member?.onboarded_at) return "Onboarded, awaiting sign-in";
  if (member?.status === "approved") return "Activation pending";
  return "No membership yet";
}

export default async function RegistrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  await requireModuleView("registrations");
  const canManage = await canManageModule("registrations");
  const { id } = await params;
  const back = safeBack((await searchParams).from);
  const supabase = await createClient();

  const { data } = await supabase
    .from("registrations")
    .select(
      "id, school_id, edition_year, status, decline_reason, claim_code, contact_email, contact_name, onboarded_at, provisioned_count, reps, details, schools(name, lga, category), profiles(email, full_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const registration = data as unknown as DetailRegistration;
  const reps = Array.isArray(registration.reps) ? (registration.reps as Rep[]) : [];
  const details = registration.details;
  const teacherEmail = value(details, "Teacher Email Address") || registration.contact_email || "";
  const principalEmail = value(details, "Principal Email Address");
  const teacherName = value(details, "Teacher Full Name") || registration.contact_name || "";
  const principalName = value(details, "Principal Full Name");

  const { data: memberData } = registration.school_id
    ? await supabase
        .from("school_members")
        .select("email, full_name, status, profile_id, onboarded_at")
        .eq("school_id", registration.school_id)
    : { data: [] };
  const members = ((memberData ?? []) as MemberRow[]).reduce(
    (map, member) => map.set(member.email.toLowerCase(), member),
    new Map<string, MemberRow>(),
  );
  const teacherMember = teacherEmail ? members.get(teacherEmail.toLowerCase()) : undefined;
  const principalMember = principalEmail
    ? members.get(principalEmail.toLowerCase())
    : undefined;

  return (
    <>
      <PortalHeader
        title={registration.schools?.name ?? "Registration"}
        subtitle={`${registration.edition_year} edition`}
      />
      <PortalBody>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild size="sm" variant="outline">
              <Link href={back.href}>
                <ArrowLeft className="size-4" />
                {back.label}
              </Link>
            </Button>
            {!canManage ? <ReadOnlyBadge /> : null}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <Card className="p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      School
                    </p>
                    <h2 className="font-bebas text-3xl leading-none text-foreground">
                      {registration.schools?.name ?? "Unassigned school"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[registration.schools?.lga, registration.schools?.category]
                        .filter(Boolean)
                        .join(" · ") || "School metadata not captured"}
                    </p>
                  </div>
                  <StatusBadge status={registration.status} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="border border-foreground/10 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Students
                    </p>
                    <p className="mt-1 font-bebas text-3xl leading-none text-foreground">
                      {reps.length}
                    </p>
                  </div>
                  <div className="border border-foreground/10 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Provisioned
                    </p>
                    <p className="mt-1 font-bebas text-3xl leading-none text-foreground">
                      {registration.provisioned_count ?? 0}
                    </p>
                  </div>
                  <div className="border border-foreground/10 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Claim code
                    </p>
                    <p className="mt-1 font-mono text-lg text-foreground">
                      {registration.claim_code ?? "None"}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <SectionHeading>Full Entry</SectionHeading>
                <RegistrationDetails details={details} reps={reps} defaultOpen />
              </Card>
            </div>

            <aside className="space-y-4">
              {canManage ? (
                <Card className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex size-9 items-center justify-center rounded-md bg-foreground/5 text-foreground">
                      <ShieldCheck className="size-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Review status
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Verified or declined sends the school decision email.
                      </p>
                    </div>
                  </div>
                  <form
                    action={setRegistrationStatus.bind(null, registration.id)}
                    className="space-y-2"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Select
                        name="status"
                        defaultValue={registration.status}
                        className="flex-1 capitalize"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                      <ConfirmSubmitButton
                        size="sm"
                        variant="outline"
                        title="Change registration status?"
                        description="The school will be emailed if this moves to verified or declined. A decline reason is included in that email and shown on their portal."
                        confirmLabel="Yes, update"
                      >
                        Update
                      </ConfirmSubmitButton>
                    </div>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        Decline reason (optional)
                      </span>
                      <textarea
                        name="decline_reason"
                        rows={2}
                        defaultValue={registration.decline_reason ?? ""}
                        placeholder="e.g. No female representative — please replace one rep and resubmit."
                        className="mt-1 w-full rounded-md border border-input bg-card px-2 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                      />
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        Only used when you set the status to declined; the school sees this and can
                        fix it and resubmit.
                      </span>
                    </label>
                  </form>
                </Card>
              ) : null}

              <RegistrationContactEditor
                registrationId={registration.id}
                kind="teacher"
                label="Educator"
                name={teacherName}
                email={teacherEmail}
                status={activationText(teacherMember, Boolean(registration.profiles))}
                canManage={canManage}
              />
              <RegistrationContactEditor
                registrationId={registration.id}
                kind="principal"
                label="Principal"
                name={principalName}
                email={principalEmail}
                status={activationText(principalMember, Boolean(principalMember?.profile_id))}
                canManage={canManage}
              />
            </aside>
          </div>
        </div>
      </PortalBody>
    </>
  );
}
