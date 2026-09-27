"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

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
        const value = window.localStorage.getItem(key);
        setDraft(value && value.trim() ? value : null);
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