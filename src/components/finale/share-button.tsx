"use client";

import { useState } from "react";
import { ctaClass } from "@/components/finale/ui";

const optionClass =
  "flex cursor-pointer items-center justify-center rounded-xl bg-card px-3 py-3 text-sm font-bold shadow-[0_0_0_1px_rgba(10,15,30,0.1)] hover:bg-foreground/[0.03]";

/**
 * On a phone, the phone's own share sheet (WhatsApp, Instagram, SMS, …). On a
 * laptop, copy-link and the common apps right under the button: desktop browsers
 * that support navigator.share open the OS share menu away from the page, which
 * reads as a button that does nothing.
 */
export default function ShareButton({ text, url }: { text: string; url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const message = `${text} ${url}`;
  const enc = encodeURIComponent;

  async function share() {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url });
        return;
      } catch (e) {
        // Closing the sheet is not a failure; anything else falls through to the options.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    setOpen((v) => !v);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button type="button" onClick={share} aria-expanded={open} className={`${ctaClass} bg-foreground text-background`}>
        Share
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" onClick={copy} className={optionClass}>
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <a href={`https://wa.me/?text=${enc(message)}`} target="_blank" rel="noopener noreferrer" className={optionClass}>
            WhatsApp
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={optionClass}
          >
            Facebook
          </a>
          <a
            href={`https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={optionClass}
          >
            X
          </a>
        </div>
      ) : null}
    </div>
  );
}
