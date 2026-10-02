import Link from "next/link";
import { registrationHref } from "@/lib/admin-links";

// No hooks, so server and client lists can both use it. Without an id, or for
// an admin who can't view registrations, it is the same text with no link.
export function SchoolLink({
  registrationId,
  from,
  enabled = true,
  className = "",
  children,
}: {
  registrationId: string | null | undefined;
  /** The list's own URL, so the registration page can link back to it. */
  from?: string;
  enabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (!registrationId || !enabled) return <span className={className}>{children}</span>;
  return (
    <Link
      href={registrationHref(registrationId, from)}
      className={`${className} underline-offset-2 hover:text-primary hover:underline`}
    >
      {children}
    </Link>
  );
}
