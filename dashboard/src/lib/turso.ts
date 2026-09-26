import { createClient, Client } from "@libsql/client";
import { config } from "./config";

let _client: Client | null = null;

export function getTurso(): Client {
  if (_client) return _client;
  if (!config.turso.url || !config.turso.authToken) {
    throw new Error("Turso credentials not configured.");
  }
  _client = createClient({
    url: config.turso.url,
    authToken: config.turso.authToken,
  });
  return _client;
}
