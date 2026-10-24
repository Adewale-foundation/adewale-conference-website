"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A dropdown that writes one search param, keeping every other (the day, the tab). */
export default function ParamSelect({
  param,
  options,
  value,
  allLabel,
  label,
}: {
  param: string;
  options: { value: string; label: string }[];
  value: string;
  /** An empty choice that clears the param; omit when one option must be chosen. */
  allLabel?: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(param, e.target.value);
        else next.delete(param);
        router.replace(`${pathname}?${next}`, { scroll: false });
      }}
      className="min-h-10 w-full max-w-sm rounded-md border border-foreground/15 bg-card px-3 text-sm"
    >
      {allLabel ? <option value="">{allLabel}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
