"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] root rendering failed:", error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          alignItems: "center",
          background: "#fff",
          color: "#0a0a0a",
          display: "flex",
          fontFamily: "system-ui, sans-serif",
          justifyContent: "center",
          minHeight: "100dvh",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "420px", width: "100%" }}>
          <h1>CheyaVerse mengalami gangguan</h1>
          <p>Data tidak dihapus. Muat ulang halaman untuk mencoba lagi.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#0a0a0a",
              border: 0,
              borderRadius: "12px",
              color: "#fff",
              minHeight: "44px",
              padding: "0 20px",
            }}
          >
            Coba lagi
          </button>
        </main>
      </body>
    </html>
  );
}
