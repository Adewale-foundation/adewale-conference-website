import Link from "next/link";
import { ClipboardCheck, Tent } from "lucide-react";

const TABS = [
  { key: "zonal", label: "Zonal finals", href: "/portal/admin/attendance", icon: ClipboardCheck },
  { key: "camp", label: "Camp", href: "/portal/admin/attendance/camp", icon: Tent },
] as const;

/** The two registers live on separate pages; this is how one reaches the other. */
export default function AttendanceTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Attendance registers" className="grid grid-cols-2 gap-1 rounded-lg bg-foreground/5 p-1 sm:inline-grid">
      {TABS.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === active ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-bold ${
            key === active
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
