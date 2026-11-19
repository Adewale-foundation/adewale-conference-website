import PublicLayout from "@/components/layout/public-layout";

// Shared chrome (nav + footer) for every public page. Authenticated pages live
// in a sibling (portal) group with their own layout.
export default function PublicGroupLayout({ children }: { children: React.ReactNode }) {
  return <PublicLayout>{children}</PublicLayout>;
}
