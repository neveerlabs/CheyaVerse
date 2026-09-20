import { getSupabase } from "./supabase";
import { config } from "./config";

export type MediaMeta = {
  id: string;
  owner_id: number | null;
  filename: string;
  storage_path: string;
  content_type: string;
  file_size: number;
  expires_at: string;
};

export async function fetchMedia(mediaId: string): Promise<MediaMeta | null> {
  const { data, error } = await getSupabase()
    .from(config.supabase.table)
    .select("*")
    .eq("id", mediaId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as MediaMeta;
}

export async function listRecentMedia(uid: number, limit = 50): Promise<MediaMeta[]> {
  const { data, error } = await getSupabase()
    .from(config.supabase.table)
    .select("*")
    .eq("owner_id", uid)
    .order("expires_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as MediaMeta[];
}

export async function createSignedUrl(
  storagePath: string,
  expiresIn: number,
): Promise<string | null> {
  const { data, error } = await getSupabase()
    .storage.from(config.supabase.bucket)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function getStats(uid: number) {
  const sb = getSupabase();
  const nowIso = new Date().toISOString();
  const [totalRes, activeRes] = await Promise.all([
    sb.from(config.supabase.table).select("id", { count: "exact", head: true }).eq("owner_id", uid),
    sb.from(config.supabase.table).select("id", { count: "exact", head: true }).eq("owner_id", uid).gte("expires_at", nowIso),
  ]);
  const total = totalRes.count ?? 0;
  const active = activeRes.count ?? 0;
  return { total, active, expired: Math.max(0, total - active) };
}

export async function deleteMediaById(
  mediaId: string,
  ownerId: number,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = getSupabase();
  const meta = await fetchMedia(mediaId);
  if (!meta) return { ok: false, reason: "not_found" };
  if (meta.owner_id !== ownerId) return { ok: false, reason: "forbidden" };

  if (meta.storage_path) {
    try {
      await sb.storage.from(config.supabase.bucket).remove([meta.storage_path]);
    } catch (err) {
      console.error("Storage remove failed:", err);
    }
  }

  const { error } = await sb.from(config.supabase.table).delete().eq("id", mediaId);
  if (error) return { ok: false, reason: "db_error" };
  return { ok: true };
}

export async function renameMediaById(
  mediaId: string,
  ownerId: number,
  newName: string,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = getSupabase();
  const meta = await fetchMedia(mediaId);
  if (!meta) return { ok: false, reason: "not_found" };
  if (meta.owner_id !== ownerId) return { ok: false, reason: "forbidden" };

  const cleaned = newName.replace(/[\\/\r\n\t]/g, "").trim().slice(0, 200);
  if (!cleaned) return { ok: false, reason: "invalid_name" };

  const { error } = await sb
    .from(config.supabase.table)
    .update({ filename: cleaned })
    .eq("id", mediaId);
  if (error) return { ok: false, reason: "db_error" };
  return { ok: true };
}
