// The shell for centre staff on exam day: one page, one job, on a phone held in
// one hand. Deliberately not (public)/ — that layout carries the marketing nav,
// and footer — and not /portal/, whose proxy runs a Supabase session
// check on every request for people who have no session.
export default function CentreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)]">{children}</div>
  );
}
