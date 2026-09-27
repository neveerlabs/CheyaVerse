"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

function parseDraftValue(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { text?: unknown; replyToId?: unknown };
      if (typeof parsed?.text === "string" && parsed.text.trim()) {
        return parsed.text;
      }
    } catch {}
    return null;
  }
  return trimmed;
}

export function ChatDraftPreview({
  uid,
  contactId,
  fallback,
}: {
  uid: string;
  contactId: string;
  fallback: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const key = `cheya-draft:${uid}:${contactId}`;

  useEffect(() => {
    const read = () => {
      try {
        setDraft(parseDraftValue(window.localStorage.getItem(key)));
      } catch {
        setDraft(null);
      }
    };
    read();
    const handler = () => read();
    window.addEventListener("storage", handler);
    window.addEventListener("cheya-draft-change", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("cheya-draft-change", handler);
    };
  }, [key]);

  if (draft) {
    return (
      <span className="text-danger">
        <span className="font-semibold">Draft: </span>
        {draft}
      </span>
    );
  }

  return <>{fallback}</>;
}