export const VIEW_COOKIE = "cheya_media_view";
export type MediaView = "list" | "grid";

export function setViewPreferenceClient(view: MediaView) {
  try {
    document.cookie = `${VIEW_COOKIE}=${view}; path=/; max-age=31536000; samesite=lax`;
  } catch {}
}