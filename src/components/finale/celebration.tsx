"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const COLORS = ["#E8A020", "#FFD166", "#FAF7F0", "#1D9A6C", "#E4572E", "#3D5AFE"];
const DURATION = 5200;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
  round: boolean;
}

function burst(width: number, height: number): Piece[] {
  const pieces: Piece[] = [];
  const piece = (x: number, y: number, vx: number, vy: number): Piece => ({
    x,
    y,
    vx,
    vy,
    size: 6 + Math.random() * 8,
    spin: (Math.random() - 0.5) * 0.4,
    angle: Math.random() * Math.PI,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    round: Math.random() < 0.25,
  });
  const power = Math.min(26, 12 + height / 60);
  // Two cannons from the bottom corners, then a shower from the top.
  for (let i = 0; i < 90; i++) {
    const lift = -(power * (0.55 + Math.random() * 0.45));
    const drift = (3 + Math.random() * 9) * (width / 900 + 0.5);
    pieces.push(piece(0, height, drift, lift), piece(width, height, -drift, lift));
  }
  for (let i = 0; i < 80; i++) {
    pieces.push(piece(Math.random() * width, -20 - Math.random() * height * 0.6, (Math.random() - 0.5) * 3, 2 + Math.random() * 3));
  }
  return pieces;
}

/** Wraps a block that deserves confetti: fires when it scrolls into view, and again on every click.
 *  Sets data-live so CSS under `.celebrate` can hold its entrance until then. */
export default function Celebration({
  children,
  className = "",
  once,
}: {
  children: React.ReactNode;
  className?: string;
  /** sessionStorage key: auto-fire only the first time in a visit (the home page, not the results page). */
  once?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const [live, setLive] = useState(false);
  const [mounted, setMounted] = useState(false);

  const fire = useCallback(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(frame.current);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    el.width = width * ratio;
    el.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const pieces = burst(width, height);
    const started = performance.now();

    const tick = (now: number) => {
      const age = now - started;
      ctx.clearRect(0, 0, width, height);
      if (age > DURATION) return;
      ctx.globalAlpha = Math.min(1, (DURATION - age) / 900);
      for (const p of pieces) {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.vy = Math.min(p.vy, 7);
        p.x += p.vx + Math.sin((age + p.size * 90) / 260) * 0.9;
        p.y += p.vy;
        p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Squashing the height fakes a ribbon tumbling in 3D.
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.cos(p.angle * 2));
        }
        ctx.restore();
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    setMounted(true);
    return () => cancelAnimationFrame(frame.current);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el || !mounted) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setLive(true);
        let seen = false;
        try {
          seen = Boolean(once && sessionStorage.getItem(once));
          if (once) sessionStorage.setItem(once, "1");
        } catch {
          // Storage can be blocked; then the confetti simply fires every time.
        }
        if (!seen) fire();
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fire, mounted, once]);

  return (
    <div ref={root} data-live={live || undefined} onClick={fire} className={`celebrate ${className}`}>
      {children}
      {mounted
        ? // On <body>: a fixed canvas inside a backdrop-blur parent would be clipped to it.
          createPortal(
            <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[200] h-full w-full" />,
            document.body,
          )
        : null}
    </div>
  );
}
