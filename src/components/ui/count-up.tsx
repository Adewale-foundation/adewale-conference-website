"use client";

import { useEffect, useRef, useState } from "react";
import { countAt, parseCount } from "@/lib/count-up";

/** Counts a figure up from zero the first time it is seen. Renders the final text on the server,
 *  so it is right without JS and for reduced motion. */
export default function CountUp({ text, duration = 1600 }: { text: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);

  useEffect(() => {
    const el = ref.current;
    const parts = parseCount(text);
    if (!el || !parts || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const started = performance.now();
        const tick = (now: number) => {
          const progress = (now - started) / duration;
          setShown(countAt(parts, progress));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [text, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {shown}
    </span>
  );
}
