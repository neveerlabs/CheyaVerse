import crypto from "crypto";

export type SessionIdent = {
  device_type: string | null;
  os: string | null;
  brand: string | null;
  model: string | null;
  browser: string | null;
  cpu_cores: number | null;
  ram_gb: number | null;
  language?: string | null;
  timezone?: string | null;
  platform?: string | null;
  max_touch?: number | null;
  color_depth?: number | null;
  webgl_vendor?: string | null;
  webgl_renderer?: string | null;
  screen_w?: number | null;
  screen_h?: number | null;
};

function joinParts(parts: (string | number | null | undefined)[]): string {
  return parts.map((p) => (p == null ? "" : String(p))).join("|");
}

export function computeFingerprint(ident: SessionIdent): string {
  const parts = [
    ident.device_type ?? "",
    ident.os ?? "",
    ident.brand ?? "",
    ident.model ?? "",
    ident.browser ?? "",
    ident.cpu_cores == null ? "" : String(ident.cpu_cores),
    ident.ram_gb == null ? "" : String(ident.ram_gb),
    ident.language ?? "",
    ident.timezone ?? "",
    ident.platform ?? "",
    ident.max_touch == null ? "" : String(ident.max_touch),
    ident.color_depth == null ? "" : String(ident.color_depth),
    ident.webgl_vendor ?? "",
    ident.webgl_renderer ?? "",
  ];
  return crypto
    .createHash("sha256")
    .update(joinParts(parts))
    .digest("hex")
    .slice(0, 32);
}

export function computeLegacyFingerprint(ident: SessionIdent): string {
  const parts = [
    ident.device_type ?? "",
    ident.os ?? "",
    ident.brand ?? "",
    ident.model ?? "",
    ident.browser ?? "",
    ident.cpu_cores == null ? "" : String(ident.cpu_cores),
    ident.ram_gb == null ? "" : String(ident.ram_gb),
    ident.language ?? "",
    ident.timezone ?? "",
    ident.screen_w == null ? "" : String(ident.screen_w),
    ident.screen_h == null ? "" : String(ident.screen_h),
    ident.color_depth == null ? "" : String(ident.color_depth),
    ident.platform ?? "",
    ident.max_touch == null ? "" : String(ident.max_touch),
  ];
  return crypto
    .createHash("sha256")
    .update(joinParts(parts))
    .digest("hex")
    .slice(0, 32);
}
