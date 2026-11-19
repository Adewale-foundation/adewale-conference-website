"use client";

import { useState } from "react";
import { createClient } from "@/supabase/client";

// Logs a download to resource_downloads (for progress/analytics) and offers a
// "Save offline" action that warms the service-worker cache with the file's
// URL so it opens later with no signal.
export default function MaterialDownloadButton({
  resourceId,
  fileUrl,
  fileName,
}: {
  resourceId: string;
  fileUrl: string;
  fileName?: string | null;
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function log() {
    try {
      const s = createClient();
      const {
        data: { user },
      } = await s.auth.getUser();
      if (user) {
        await s.from("resource_downloads").insert({
          resource_id: resourceId,
          student_user_id: user.id,
          event: "download",
        });
      }
    } catch {
      /* best-effort */
    }
  }

  async function saveOffline() {
    setSaving(true);
    try {
      await fetch(fileUrl).catch(() => {}); // populate the SW cache
      await log();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap gap-3">
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={fileName ?? undefined}
        onClick={() => void log()}
        className="text-xs uppercase tracking-[0.15em] text-primary hover:underline"
      >
        Download ↓
      </a>
      <button
        onClick={saveOffline}
        disabled={saving || saved}
        className="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        {saved ? "Saved offline ✓" : saving ? "Saving…" : "Save offline"}
      </button>
    </div>
  );
}
