"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { canAffordImagery, type ConnectionHint } from "@/lib/connection";

/** The hero's photo, added after first paint so the heading never waits on it, and skipped
 *  altogether on Data Saver or a 2G link. */
export default function HeroBackdrop({ src }: { src: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: ConnectionHint }).connection;
    if (canAffordImagery(connection)) setShow(true);
  }, []);

  if (!show) return null;
  return <Image src={src} alt="" fill sizes="100vw" className="hero-backdrop -z-20 object-cover" />;
}
