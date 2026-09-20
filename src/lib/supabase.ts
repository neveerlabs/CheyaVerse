import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!config.supabase.url || !config.supabase.key) {
    throw new Error("Supabase credentials not configured.");
  }
  _client = createClient(config.supabase.url, config.supabase.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}