import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  Card,
  PortalBody,
  PortalHeader,
  SectionHeading,
  StatusBadge,
} from "@/components/portal/ui";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import { pageMetadata } from "@/lib/seo";
import { createClient } from "@/supabase/server";
import { canManageModule, requireModuleView } from "@/supabase/auth";
import { SchoolLink } from "@/components/portal/school-link";
import type { InfoChangeRequestRow } from "@/supabase/types";
import { approveInfoChange, declineInfoChange } from "./actions";

export const metadata = pageMetadata(
  "Contact corrections",
  "Educator/principal detail corrections requested by schools.",
);
export const dynamic = "force-dynamic";

const TARGET_LABEL: Record<InfoChangeRequestRow["target"], string> = {
  teacher: "Educator",
  principal: "Principal",
};

export default async function AdminInfoChanges() {
  await requireModuleView("registrations");
  const canManage = await canManageModule("registrations");

  const supabase = await createClient();

  // RLS (icr_read) returns all rows to admins.
  const { data, error } = await supabase
    .from("info_change_requests")
    .select(
      "id, registration_id, school_id, target, new_name, new_phone, previous_name, previous_phone, reason, status, admin_note, requested_by, created_at, reviewed_at, schools(name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not read the corrections: ${error.message}`);
  const rows = (data ?? []) as unknown as InfoChangeRequestRow[];
  const pending = rows.filter((r) => r.status === "pending");
  const resolved = rows.filter((r) => r.status !== "pending");

  // What each pending request would overwrite. Approving used to show only the
  // incoming value, so "Mrs Okoro → Change Ada to Ben" never appeared side by
  // side and the sentence was approved into the educator's name.
  const current = new Map<string, Record<string, string>>();
  const pendingRegIds = [...new Set(pending.map((r) => r.registration_id))];
  if (pendingRegIds.length) {
    const { data: regs, error: regErr } = await supabase
      .from("registrations")
      .select("id, details")
      .in("id", pendingRegIds);
    if (regErr) throw new Error(`Could not read the registrations: ${regErr.message}`);
    for (const reg of (regs ?? []) as { id: string; details: Record<string, string> | null }[]) {
      current.set(reg.id, reg.details ?? {});
    }
  }
  const currentValue = (r: InfoChangeRequestRow, field: "Full Name" | "Number") =>
    (current.get(r.registration_id)?.[
      `${r.target === "teacher" ? "Teacher" : "Principal"} ${field}`
    ] ?? "").trim() || "—";

  return (
    <>
      <PortalHeader
        title="Contact corrections"
        subtitle="Schools requesting a fix to an educator or principal name / phone — approve to apply it."
      />
      <PortalBody>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <SectionHeading>
              Pending {pending.length > 0 ? `(${pending.length})` : ""}
            </SectionHeading>
            {!canManage ? <ReadOnlyBadge /> : null}
          </div>
          {pending.length === 0 ? (
            <p className="serif-display italic text-muted-foreground">
              No correction requests awaiting review.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((r) => (
                <Card key={r.id} className="p-4 space-y-3">
                  <div>
                    <SchoolLink registrationId={r.registration_id} from="/portal/admin/info-changes" className="font-medium text-foreground">
                      {r.schools?.name ?? "Unknown school"}
                    </SchoolLink>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground mt-1">
                      {TARGET_LABEL[r.target]}
                    </p>
                    <dl className="mt-2 space-y-1 text-sm">
                      {r.new_name ? (
                        <div className="flex flex-wrap items-baseline gap-2">
                          <dt className="text-muted-foreground">Name</dt>
                          <dd className="text-muted-foreground line-through">
                            {currentValue(r, "Full Name")}
                          </dd>
                          <span aria-hidden className="text-muted-foreground">→</span>
                          <dd className="font-medium text-foreground">{r.new_name}</dd>
                        </div>
                      ) : null}
                      {r.new_phone ? (
                        <div className="flex flex-wrap items-baseline gap-2">
                          <dt className="text-muted-foreground">Phone</dt>
                          <dd className="text-muted-foreground line-through">
                            {currentValue(r, "Number")}
                          </dd>
                          <span aria-hidden className="text-muted-foreground">→</span>
                          <dd className="font-medium text-foreground">{r.new_phone}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <p className="text-sm text-muted-foreground mt-1">Reason: {r.reason}</p>
                  </div>
                  {canManage ? (
                    <div className="flex gap-2">
                      <form action={approveInfoChange.bind(null, r.id)}>
                        <ConfirmSubmitButton
                          size="sm"
                          title="Apply this correction?"
                          description={`This overwrites the ${TARGET_LABEL[r.target].toLowerCase()} details on the registration${r.new_name ? `: name "${currentValue(r, "Full Name")}" becomes "${r.new_name}"` : ""}${r.new_phone ? `${r.new_name ? " and" : ":"} phone "${currentValue(r, "Number")}" becomes "${r.new_phone}"` : ""}.`}
                          confirmLabel="Yes, apply"
                        >
                          Approve
                        </ConfirmSubmitButton>
                      </form>
                      <form action={declineInfoChange.bind(null, r.id)} className="flex items-center gap-2">
                        <input
                          name="note"
                          placeholder="Reason (optional)"
                          className="rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <ConfirmSubmitButton
                          size="sm"
                          variant="outline"
                          destructive
                          title="Decline this correction?"
                          description="Nothing changes on the registration."
                          confirmLabel="Yes, decline"
                        >
                          Decline
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeading>History</SectionHeading>
          {resolved.length === 0 ? (
            <p className="serif-display italic text-muted-foreground">
              Approved and declined requests appear here.
            </p>
          ) : (
            <Card className="divide-y divide-foreground/5">
              {resolved.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <SchoolLink registrationId={r.registration_id} from="/portal/admin/info-changes" className="font-medium text-foreground">
                      {r.schools?.name ?? "Unknown school"}
                    </SchoolLink>
                    <p className="text-sm text-muted-foreground">
                      {TARGET_LABEL[r.target]}
                      {r.new_name
                        ? ` · ${r.previous_name ? `${r.previous_name} → ` : ""}${r.new_name}`
                        : ""}
                      {r.new_phone
                        ? ` · ${r.previous_phone ? `${r.previous_phone} → ` : ""}${r.new_phone}`
                        : ""}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </Card>
          )}
        </div>
      </PortalBody>
    </>
  );
}
