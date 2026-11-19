"use client";

import { useEffect, useRef } from "react";

const STAGGER = 90;
const DONE_AFTER = 1100;

/** The blocks worth revealing one by one: each section container's children, and the cells of a small grid. */
function targets(root: HTMLElement): HTMLElement[][] {
  const groups: HTMLElement[][] = [];
  for (const container of root.querySelectorAll<HTMLElement>("section > .mx-auto")) {
    for (const block of Array.from(container.children) as HTMLElement[]) {
      const cells = Array.from(block.children) as HTMLElement[];
      const isSmallGrid = block.classList.contains("grid") && cells.length >= 2 && cells.length <= 8;
      groups.push(isSmallGrid ? cells : [block]);
    }
  }
  return groups;
}

/** Fades the wrapped sections' blocks up as they scroll into view, without touching the sections.
 *  Nothing is hidden until this runs, and anything already on screen is left alone, so there is no flash. */
export default function ScrollReveals({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: number[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const node = entry.target as HTMLElement;
          observer.unobserve(node);
          node.classList.add("reveal-in");
          // Dropped afterwards: a lingering transform would trap fixed modals and fight hover transitions.
          timers.push(
            window.setTimeout(
              () => {
                node.classList.remove("reveal", "reveal-in");
                node.style.removeProperty("--reveal-delay");
              },
              DONE_AFTER + Number(node.dataset.revealDelay ?? 0),
            ),
          );
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );

    for (const group of targets(el)) {
      group.forEach((node, i) => {
        if (node.getBoundingClientRect().top < window.innerHeight) return;
        const delay = i * STAGGER;
        node.dataset.revealDelay = String(delay);
        node.style.setProperty("--reveal-delay", `${delay}ms`);
        node.classList.add("reveal");
        observer.observe(node);
      });
    }
    return () => {
      observer.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return <div ref={root}>{children}</div>;
}
