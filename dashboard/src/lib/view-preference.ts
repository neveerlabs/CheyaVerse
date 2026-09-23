import { cookies } from "next/headers";

export const VIEW_COOKIE = "cheya_media_view";
export type MediaView = "list" | "grid";

export function getViewPreferenceServer(): MediaView {
  try {
    const v = cookies().get(VIEW_COOKIE)?.value;
    if (v === "grid" || v === "list") return v;
  } catch {}
  return "list";
}