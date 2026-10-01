export function reportClientError(
  error: unknown,
  context: string,
  urgent = false,
): void {
  if (typeof window === "undefined") return;
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const stack = error instanceof Error ? error.stack : undefined;
  window.dispatchEvent(
    new CustomEvent("cheya:client-error", {
      detail: {
        message: `${context}: ${message}`,
        urgent,
        ...(stack ? { stack } : {}),
      },
    }),
  );
}
