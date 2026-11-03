import Link from "next/link";
import { ScanLine } from "lucide-react";

export default function ScanTicketsButton() {
  return (
    <Link
      href="/portal/admin/finale/scan"
      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"
    >
      <ScanLine className="size-4" aria-hidden="true" />
      Scan tickets
    </Link>
  );
}
