"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A school picker that writes `?school=`, keeping every other param (the day). */
export default function SchoolFilter({
  schools,
  value,
}: {
  schools: { registrationId: string; schoolName: string; count: number }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <select
      aria-label="Filter by school"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set("school", e.target.value);
        else next.delete("school");
        router.replace(`${pathname}?${next}`, { scroll: false });
      }}
      className="min-h-10 w-full max-w-sm rounded-md border border-foreground/15 bg-card px-3 text-sm"
    >
      <option value="">All schools ({schools.length})</option>
      {schools.map((s) => (
        <option key={s.registrationId} value={s.registrationId}>
          {s.schoolName} ({s.count})
        </option>
      ))}
    </select>
  );
}
