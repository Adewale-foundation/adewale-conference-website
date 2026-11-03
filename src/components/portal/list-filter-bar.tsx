"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/portal/ui";
import { filterFormQuery } from "@/components/portal/list-filter-query";

const inputCls =
  "rounded-md border border-foreground/15 bg-card px-3 py-2 text-sm outline-none focus:border-primary";

/**
 * Search/filter bar for admin list pages. The URL remains the source of truth,
 * but submission uses Next navigation so the transition feels in-app.
 */
export function FilterBar({
  q,
  placeholder,
  preserve,
  children,
  showApply = true,
  applyLabel = "Apply",
  live = false,
}: {
  q?: string;
  placeholder: string;
  preserve?: Record<string, string | undefined>;
  children?: React.ReactNode;
  /** When false, rely on Enter in search or an in-panel apply control. */
  showApply?: boolean;
  applyLabel?: string;
  /** Search as the user types (debounced); Enter still applies at once. */
  live?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function apply(form: HTMLFormElement, mode: "push" | "replace") {
    const href = `${pathname}${filterFormQuery(new FormData(form))}`;
    const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (href === current) return;
    startTransition(() => {
      router[mode](href, { scroll: false });
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    apply(event.currentTarget, "push");
  }

  // Replace, not push: one history entry per keystroke would make Back useless.
  function typed() {
    if (!live) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => formRef.current && apply(formRef.current, "replace"), 350);
  }

  return (
    <Card className="p-4 mb-4">
      <form ref={formRef} onSubmit={submit} className="flex flex-wrap items-center gap-2" aria-busy={pending}>
        {/* Live search keeps the field enabled: disabling it mid-typing would drop focus. */}
        <fieldset disabled={pending && !live} className="contents">
          {Object.entries(preserve ?? {}).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder={placeholder}
            onChange={typed}
            aria-label={placeholder}
            className={`${inputCls} flex-1 min-w-48`}
          />
          {children}
          {showApply ? (
            <Button type="submit" size="sm" variant="outline">
              {pending ? "Applying..." : applyLabel}
            </Button>
          ) : null}
        </fieldset>
      </form>
    </Card>
  );
}
