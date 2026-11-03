"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Search } from "lucide-react";
import { checkInAtDoor, doorCounts, lookupDoorTickets, signOut } from "@/app/(centre)/attendance/actions";
import type { DoorTicket } from "@/lib/finale-attend-data";

type Result =
  | { kind: "ticket"; ticket: DoorTicket; note?: { tone: "ok" | "warn" | "bad"; text: string } }
  | { kind: "list"; tickets: DoorTicket[] }
  | { kind: "none"; text: string };

function statusNote(t: DoorTicket): { tone: "ok" | "warn" | "bad"; text: string } | undefined {
  if (t.status === "waitlisted") return { tone: "bad", text: "On the waitlist: not confirmed. Send them to the help desk." };
  if (t.status === "cancelled") return { tone: "bad", text: "Cancelled ticket. Send them to the help desk." };
  if (t.checkedInAt) return { tone: "warn", text: `Already checked in at ${new Date(t.checkedInAt).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}.` };
  return undefined;
}

const TONE = { ok: "bg-emerald-600 text-white", warn: "bg-amber-400 text-[#0A0F1E]", bad: "bg-red-600 text-white" } as const;

/** One phone, one job: scan or search, see who it is, check them in. */
export default function FinaleDoor({ staffName, initialCounts }: { staffName: string; initialCounts: { checkedIn: number; confirmed: number } | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [counts, setCounts] = useState(initialCounts);
  const [pending, startTransition] = useTransition();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const lookup = useCallback((text: string) => {
    busyRef.current = true;
    startTransition(async () => {
      const res = await lookupDoorTickets(text);
      if (!res.ok) setResult({ kind: "none", text: res.error });
      else if (res.tickets.length === 0) setResult({ kind: "none", text: "No ticket matches that. Check the code or try their name." });
      else if (res.tickets.length === 1) setResult({ kind: "ticket", ticket: res.tickets[0], note: statusNote(res.tickets[0]) });
      else setResult({ kind: "list", tickets: res.tickets });
    });
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      busyRef.current = false;
      setScanning(true);
    } catch {
      setCameraError("The camera didn't start. Allow camera access for this site, or search by code below.");
    }
  }, []);

  useEffect(() => {
    if (!scanning) return;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && !busyRef.current && video.readyState === video.HAVE_ENOUGH_DATA) {
        // Decode a downscaled frame: full camera resolution is slow on mid-range phones.
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.floor(video.videoWidth * scale);
        canvas.height = Math.floor(video.videoHeight * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            navigator.vibrate?.(60);
            lookup(code.data);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scanning, lookup]);

  useEffect(() => stopCamera, [stopCamera]);

  const next = () => {
    setResult(null);
    setQuery("");
    busyRef.current = false;
  };

  const checkIn = (ticket: DoorTicket, undo = false) =>
    startTransition(async () => {
      const res = await checkInAtDoor(ticket.id, undo);
      const t = res.ticket ?? ticket;
      if (res.ok) {
        setResult({
          kind: "ticket",
          ticket: t,
          note: undo ? { tone: "warn", text: "Check-in undone." } : { tone: "ok", text: `Checked in: ${t.seats} seat${t.seats === 1 ? "" : "s"}. Welcome!` },
        });
        navigator.vibrate?.(undo ? 40 : [40, 60, 40]);
        setCounts((await doorCounts()) ?? counts);
      } else {
        setResult({
          kind: "ticket",
          ticket: t,
          note:
            res.reason === "already"
              ? statusNote(t)
              : res.reason === "not-confirmed"
                ? statusNote(t)
                : { tone: "bad", text: res.error ?? "Could not check in. Try again." },
        });
      }
    });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-ink">Grand Finale · Door check-in</p>
          <h1 className="font-bebas text-3xl leading-none text-foreground">Hi, {staffName.split(" ")[0]}</h1>
          {counts ? (
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              <b className="text-foreground">{counts.checkedIn.toLocaleString("en-NG")}</b> of {counts.confirmed.toLocaleString("en-NG")} seats in
            </p>
          ) : null}
        </div>
        <form action={signOut}>
          <button className="text-xs font-semibold text-muted-foreground underline">Sign out</button>
        </form>
      </header>

      <section className="overflow-hidden rounded-xl bg-[#0A0F1E]">
        <div className="relative aspect-square w-full">
          <video ref={videoRef} playsInline muted className={`absolute inset-0 size-full object-cover ${scanning ? "" : "hidden"}`} />
          <canvas ref={canvasRef} className="hidden" />
          {scanning ? (
            <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-primary/90 shadow-[0_0_0_999px_rgba(10,15,30,0.45)]" />
          ) : (
            <button type="button" onClick={startCamera} className="absolute inset-0 grid place-items-center gap-3 text-white">
              <span className="grid place-items-center gap-3">
                <span className="grid size-20 place-items-center rounded-full bg-primary text-[#0A0F1E]">
                  <Camera className="size-9" aria-hidden />
                </span>
                <span className="text-lg font-bold">Tap to start scanning</span>
                <span className="px-6 text-center text-sm text-white/60">Point the camera at the QR code on their ticket.</span>
              </span>
            </button>
          )}
          {scanning && pending ? <div className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white">Looking up…</div> : null}
        </div>
        {scanning ? (
          <button type="button" onClick={stopCamera} className="flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold text-white/80">
            <CameraOff className="size-4" aria-hidden /> Stop camera
          </button>
        ) : null}
      </section>
      {cameraError ? <p className="text-sm text-destructive">{cameraError}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) lookup(query.trim());
        }}
        className="flex gap-2"
      >
        <label className="sr-only" htmlFor="door-search">Ticket code or name</label>
        <input
          id="door-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Code (GF-…) or name"
          autoCapitalize="characters"
          className="min-h-12 min-w-0 flex-1 rounded-md border border-foreground/15 bg-card px-3 text-base outline-none focus:border-primary"
        />
        <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center gap-2 rounded-md bg-foreground px-4 font-bold text-background disabled:opacity-60">
          <Search className="size-4" aria-hidden /> Find
        </button>
      </form>

      {result ? (
        <section aria-live="polite" className="overflow-hidden rounded-xl border border-foreground/10 bg-card">
          {result.kind === "none" ? (
            <p className="p-5 text-base">{result.text}</p>
          ) : result.kind === "list" ? (
            <ul className="divide-y divide-foreground/10">
              {result.tickets.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setResult({ kind: "ticket", ticket: t, note: statusNote(t) })} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                    <span className="min-w-0">
                      <b className="block truncate">{t.name}</b>
                      <span className="block truncate text-sm text-muted-foreground">{t.refCode} · {t.seats} seat{t.seats === 1 ? "" : "s"}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold uppercase text-muted-foreground">{t.checkedInAt ? "In" : t.status === "confirmed" ? "" : t.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              {result.note ? <p className={`px-5 py-3 text-base font-bold ${TONE[result.note.tone]}`}>{result.note.text}</p> : null}
              <div className="grid gap-1 p-5">
                <p className="font-mono text-sm text-muted-foreground">{result.ticket.refCode}</p>
                <p className="text-2xl font-black leading-tight">{result.ticket.name}</p>
                {result.ticket.detail ? <p className="text-sm text-muted-foreground">{result.ticket.detail}</p> : null}
                <p className="mt-2 text-lg font-bold">{result.ticket.seats} seat{result.ticket.seats === 1 ? "" : "s"}</p>
              </div>
              <div className="grid gap-2 px-5 pb-5">
                {result.ticket.status === "confirmed" && !result.ticket.checkedInAt ? (
                  <button type="button" disabled={pending} onClick={() => checkIn(result.ticket)} className="min-h-14 rounded-md bg-emerald-600 text-lg font-black text-white disabled:opacity-60">
                    {pending ? "Checking in…" : `Check in ${result.ticket.seats} seat${result.ticket.seats === 1 ? "" : "s"}`}
                  </button>
                ) : null}
                {result.ticket.checkedInAt && result.note?.tone !== "ok" ? (
                  <button type="button" disabled={pending} onClick={() => checkIn(result.ticket, true)} className="min-h-11 rounded-md border border-foreground/15 text-sm font-semibold disabled:opacity-60">
                    Undo check-in
                  </button>
                ) : null}
              </div>
            </>
          )}
          <button type="button" onClick={next} className="w-full border-t border-foreground/10 py-4 text-base font-bold text-gold-ink">
            {scanning ? "Scan next ticket" : "Next"}
          </button>
        </section>
      ) : null}
    </main>
  );
}
