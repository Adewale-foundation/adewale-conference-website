import Link from "next/link";
import { ScanLine, Ticket, Trophy } from "lucide-react";

const TABS = [
  { key: "attendees", label: "Attendees", href: "/portal/admin/finale", icon: Ticket },
  { key: "staff", label: "Door staff", href: "/portal/admin/finale/staff", icon: ScanLine },
  { key: "fan-vote", label: "Fan vote", href: "/portal/admin/finale/fan-vote", icon: Trophy },
] as const;

export default function FinaleTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Grand Finale" className="grid grid-cols-3 gap-1 rounded-lg bg-foreground/5 p-1 sm:inline-grid">
      {TABS.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === active ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold sm:px-5 ${
            key === active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
