import { createClient, Client } from "@libsql/client";
import { config } from "./config";

let _client: Client | null = null;
const TURSO_REQUEST_TIMEOUT_MS = 8_000;

async function fetchTursoWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const originalSignal = init?.signal;
  const abortFromOriginal = () => controller.abort(originalSignal?.reason);
  if (originalSignal?.aborted) {
    abortFromOriginal();
  } else {
    originalSignal?.addEventListener("abort", abortFromOriginal, { once: true });
  }
  const timer = setTimeout(
    () => controller.abort(new Error("Turso request timed out.")),
    TURSO_REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    originalSignal?.removeEventListener("abort", abortFromOriginal);
  }
}

export function getTurso(): Client {
  if (_client) return _client;
  if (!config.turso.url || !config.turso.authToken) {
    throw new Error("Turso credentials not configured.");
  }
  const url = config.turso.url.replace(/^turso:\/\//i, "libsql://");
  _client = createClient({
    url,
    authToken: config.turso.authToken,
    fetch: fetchTursoWithTimeout,
  });
  return _client;
}
