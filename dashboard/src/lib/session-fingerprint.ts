import crypto from "crypto";

export type SessionIdent = {
  device_type: string | null;
  os: string | null;
  brand: string | null;
  model: string | null;
  browser: string | null;
  cpu_cores: number | null;
  ram_gb: number | null;
};

export function computeFingerprint(ident: SessionIdent): string {
  const parts = [
    ident.device_type ?? "",
    ident.os ?? "",
    ident.brand ?? "",
    ident.model ?? "",
    ident.browser ?? "",
    ident.cpu_cores == null ? "" : String(ident.cpu_cores),
    ident.ram_gb == null ? "" : String(ident.ram_gb),
  ];
  return crypto
    .createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 32);
}
