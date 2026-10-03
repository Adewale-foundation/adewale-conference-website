import Link from "next/link";
import { campWindow, formatCampDate, primaryEducator } from "@/lib/camp";
import { deadlineInfo } from "@/lib/challenges";
import type { MyCamp } from "@/lib/camp-data";
import { Card } from "@/components/portal/ui";

const cta =
  "inline-flex items-center gap-2 bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-foreground hover:bg-primary/90 transition-colors";
const ghost =
  "inline-flex items-center gap-2 border border-foreground/15 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-foreground hover:border-foreground/40 transition-colors";

/** The camp invitation on the school dashboard, in whichever state the school is in. */
export default function CampCard({ camp }: { camp: MyCamp }) {
  const { settings, confirmation } = camp;
  const win = campWindow(settings, confirmation);
  const status = confirmation?.status ?? "pending";
  const deadline = deadlineInfo(win.deadline);
  const when = [formatCampDate(settings.arrival_at, false), formatCampDate(settings.departure_at, false)]
    .filter(Boolean)
    .join(" – ");

  const tone =
    status === "attending"
      ? { border: "border-l-green-600", text: "text-green-700" }
      : status === "pending"
        ? { border: "border-l-primary", text: "text-gold-ink" }
        : { border: "border-l-foreground/30", text: "text-muted-foreground" };

  const heading =
    status === "attending"
      ? "Your camp place is secured"
      : status === "not_attending"
        ? "You told us you can't attend"
        : status === "released"
          ? "Your camp place has been released"
          : win.open
            ? "Secure your place at camp"
            : "Camp confirmations have closed";

  return (
    <Card className={`p-5 border-l-4 ${tone.border}`}>
      <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${tone.text}`}>
        {settings.title}
      </p>
      <p className="font-bebas text-2xl text-foreground leading-tight mt-1">{heading}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
        {[when, settings.venue].filter(Boolean).join(" · ")}
      </p>
      {status === "attending" ? (
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-foreground">
            Confirmed: <strong>{primaryEducator(confirmation?.educators)?.name ?? "your educator"}</strong> and
            your three contestants.
          </p>
          {confirmation?.extra_educator && confirmation.extra_status === "pending" ? (
            <p className="text-amber-800">
              {confirmation.extra_educator.name} is awaiting approval. Don&apos;t bring them unless
              it&apos;s approved.
            </p>
          ) : confirmation?.extra_educator && confirmation.extra_status === "approved" ? (
            <p className="text-green-700">{confirmation.extra_educator.name} is approved as a second educator.</p>
          ) : confirmation?.extra_educator && confirmation.extra_status === "declined" ? (
            <p className="text-red-700">
              {confirmation.extra_educator.name} was declined. Only{" "}
              {primaryEducator(confirmation.educators)?.name ?? "your educator"} is confirmed.
            </p>
          ) : null}
        </div>
      ) : null}
      {status === "pending" && win.open ? (
        <p className={`text-sm mt-2 ${deadline.soon ? "text-red-700 font-semibold" : "text-foreground"}`}>
          Confirm by {formatCampDate(win.deadline)} · {deadline.label}
        </p>
      ) : null}
      {status === "released" ? (
        <p className="text-sm text-foreground mt-2">
          Contact the Planning Committee if you think this is a mistake.
        </p>
      ) : null}
      {status === "pending" && !win.open ? (
        <p className="text-sm text-foreground mt-2">
          Contact the Planning Committee if your school still wants to attend.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {status === "pending" && win.open ? (
          <Link href="/portal/school/camp" className={cta}>Secure our place →</Link>
        ) : null}
        {status === "attending" && settings.whatsapp_url ? (
          <a href={settings.whatsapp_url} target="_blank" rel="noopener noreferrer" className={cta}>
            Join the WhatsApp group ↗
          </a>
        ) : null}
        {status === "attending" ? (
          <Link href="/portal/school/resources" className={ghost}>Camp program</Link>
        ) : null}
        {status !== "pending" ? (
          <Link href="/portal/school/camp" className={ghost}>
            {win.open && status !== "released" ? "View or change response" : "View details"}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
