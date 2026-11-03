import Link from "next/link";
import { Ticket, Trophy } from "lucide-react";

const TABS = [
  { key: "attendees", label: "Attendees", href: "/portal/admin/finale", icon: Ticket },
  { key: "fan-vote", label: "Fan vote", href: "/portal/admin/finale/fan-vote", icon: Trophy },
] as const;

export default function FinaleTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Grand Finale" className="grid grid-cols-2 gap-1 rounded-lg bg-foreground/5 p-1 sm:inline-grid">
      {TABS.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === active ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-bold ${
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
