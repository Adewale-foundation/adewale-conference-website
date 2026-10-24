"use client";

import { useState } from "react";
import { Card, EmptyState, SectionHeading } from "@/components/portal/ui";
import { ReadOnlyBadge } from "@/components/portal/read-only-badge";
import ActionForm from "@/components/portal/action-form";
import { SubmitButton } from "@/components/portal/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Mail } from "lucide-react";
import {
  addLead,
  addLeadsBulk,
  emailLead,
  setLeadActive,
} from "@/app/(portal)/portal/admin/attendance/actions";
import { CENTRE_LEAD_ROLES, type CentreLead, type CentreLeadRole, type ExamCentre } from "@/supabase/types";

const field =
  "min-h-11 w-full rounded-md border border-foreground/15 bg-card px-3 text-sm outline-none" +
  " focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]";

export default function CentreLeadsPanel({
  centres,
  leads,
  canManage,
  editionYear,
  roleLabels,
}: {
  centres: ExamCentre[];
  leads: CentreLead[];
  canManage: boolean;
  editionYear: number;
  roleLabels: Record<CentreLeadRole, string>;
}) {
  const [bulk, setBulk] = useState(false);
  const centreName = (id: string) => {
    const c = centres.find((x) => x.id === id);
    return c ? `${c.name}, ${c.town}` : "Unknown centre";
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading>Add staff</SectionHeading>
        {canManage ? (
          <button
            type="button"
            onClick={() => setBulk((v) => !v)}
            className="min-h-9 cursor-pointer text-xs font-bold text-gold-ink"
          >
            {bulk ? "Add one at a time" : "Paste a list"}
          </button>
        ) : (
          <ReadOnlyBadge />
        )}
      </div>

      {canManage && centres.length > 0 ? (
        <Card className="p-4">
          {bulk ? (
            <ActionForm action={addLeadsBulk} className="space-y-2">
              <input type="hidden" name="edition_year" value={editionYear} />
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  name="centre_id"
                  // A panel scoped to one venue (the camp) has nothing to choose.
                  defaultValue={centres.length === 1 ? centres[0].id : ""}
                  required
                  className={field}
                >
                  <option value="" disabled>
                    Centre…
                  </option>
                  {centres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}, {c.town}
                    </option>
                  ))}
                </select>
                <select name="role" defaultValue="invigilator" className={field}>
                  {CENTRE_LEAD_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabels[r]}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                name="rows"
                rows={6}
                required
                placeholder={"Ada Nwosu, ada@example.com, 08030000000\nBimpe Okoro, bimpe@example.com"}
                className={`${field} py-2 font-mono text-xs`}
              />
              <p className="text-xs text-muted-foreground">
                One person per line: name, email, phone. Paste straight out of the Fellows sheet.
              </p>
              <SubmitButton pendingText="Adding…">Add them</SubmitButton>
            </ActionForm>
          ) : (
            <ActionForm action={addLead} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <input type="hidden" name="edition_year" value={editionYear} />
              <select
                  name="centre_id"
                  // A panel scoped to one venue (the camp) has nothing to choose.
                  defaultValue={centres.length === 1 ? centres[0].id : ""}
                  required
                  className={field}
                >
                <option value="" disabled>
                  Centre…
                </option>
                {centres.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}, {c.town}
                  </option>
                ))}
              </select>
              <input name="name" required placeholder="Full name" className={field} />
              <input
                name="email"
                type="email"
                required
                placeholder="Email"
                autoCapitalize="none"
                className={field}
              />
              <input name="phone" placeholder="Phone (optional)" className={field} />
              <select name="role" defaultValue="invigilator" className={field}>
                {CENTRE_LEAD_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
              <SubmitButton pendingText="Adding…">Add</SubmitButton>
            </ActionForm>
          )}
        </Card>
      ) : null}

      {leads.length === 0 ? (
        <EmptyState title="Nobody can sign in yet">
          Add the centre leads and invigilators above. They need no account — the email you enter
          is exactly what they type at <code className="bg-foreground/5 px-1">/attendance</code>,
          and an email you have not registered here cannot get in.
        </EmptyState>
      ) : (
        <div className="divide-y divide-foreground/5 border border-foreground/10">
          <p className="bg-foreground/5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Registered staff
          </p>
          {leads.map((lead) => (
            <div
              key={lead.id}
              className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  {lead.name}
                  {lead.is_active ? "" : " · deactivated"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {lead.email} · {roleLabels[lead.role]} · {centreName(lead.centre_id)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lead.last_signed_in_at
                    ? `Last signed in ${new Date(lead.last_signed_in_at).toLocaleString("en-GB")}`
                    : "Never signed in"}
                  {" · "}
                  <span className={lead.last_emailed_at ? "" : "font-bold text-gold-ink"}>
                    {lead.last_emailed_at
                      ? `emailed ${new Date(lead.last_emailed_at).toLocaleString("en-GB")}`
                      : "not emailed yet"}
                  </span>
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  <ActionForm action={emailLead}>
                    <input type="hidden" name="lead_id" value={lead.id} />
                    <ConfirmSubmitButton
                      size="sm"
                      variant="outline"
                      title={`Email ${lead.name}?`}
                      description={`Sends ${lead.email} their centre, the link, and the address they must sign in with. Safe to send again — it replaces nothing.`}
                      confirmLabel="Send it"
                    >
                      <Mail className="size-3.5" aria-hidden="true" />
                      {lead.last_emailed_at ? "Resend" : "Send link"}
                    </ConfirmSubmitButton>
                  </ActionForm>
                  <ActionForm action={setLeadActive}>
                    <input type="hidden" name="lead_id" value={lead.id} />
                    <input type="hidden" name="active" value={lead.is_active ? "false" : "true"} />
                    <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                      {lead.is_active ? "Deactivate" : "Reactivate"}
                    </SubmitButton>
                  </ActionForm>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
