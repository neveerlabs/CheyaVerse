export type DeviceType = "mobile" | "tablet" | "desktop" | "bot" | "unknown";

export type DeviceInfo = {
  type: DeviceType;
  os: string | null;
  brand: string | null;
  model: string | null;
  browser: string | null;
};

export function parseDeviceInfo(ua: string): DeviceInfo {
  const info: DeviceInfo = {
    type: "unknown",
    os: null,
    brand: null,
    model: null,
    browser: null,
  };
  if (!ua) return info;

  const u = ua.toLowerCase();

  if (/bot|crawler|spider|curl|wget|python|httpx|axios|node-fetch|facebookexternalhit/.test(u)) {
    info.type = "bot";
  } else if (/ipad|tablet|playbook|silk/.test(u) || (/android/.test(u) && !/mobile/.test(u))) {
    info.type = "tablet";
  } else if (/mobile|iphone|ipod|android|blackberry|windows phone|opera mini/.test(u)) {
    info.type = "mobile";
  } else if (/windows|macintosh|linux|x11|cros/.test(u)) {
    info.type = "desktop";
  }

  if (/iphone|ipad|ipod/.test(u)) info.os = "iOS";
  else if (/android/.test(u)) {
    const m = u.match(/android\s+([\d.]+)/);
    info.os = m ? `Android ${m[1]}` : "Android";
  } else if (/windows nt 10/.test(u)) info.os = "Windows 10/11";
  else if (/windows nt/.test(u)) info.os = "Windows";
  else if (/mac os x|macintosh/.test(u)) info.os = "macOS";
  else if (/cros/.test(u)) info.os = "ChromeOS";
  else if (/linux/.test(u)) info.os = "Linux";

  if (/iphone/.test(u)) {
    info.brand = "Apple";
    info.model = "iPhone";
  } else if (/ipad/.test(u)) {
    info.brand = "Apple";
    info.model = "iPad";
  } else if (/macintosh/.test(u)) {
    info.brand = "Apple";
    info.model = "Mac";
  } else {
    const androidMatch = ua.match(/android[^;]*;\s*([^;)]+?)(?:\s+build|\)|;)/i);
    if (androidMatch) {
      let modelRaw = androidMatch[1].trim();
      modelRaw = modelRaw.replace(/^[a-z]{2}[-_][a-z]{2}(?:;?\s*)/i, "").trim();
      if (
        modelRaw &&
        modelRaw.toLowerCase() !== "wv" &&
        !/^[a-z]{2}$/.test(modelRaw) &&
        modelRaw.length > 1 &&
        !/^[\d.]+$/.test(modelRaw)
      ) {
        info.model = modelRaw;
        info.brand = guessBrand(modelRaw);
      }
    }
  }

  if (/edg\//.test(u)) info.browser = "Edge";
  else if (/opr\/|opera/.test(u)) info.browser = "Opera";
  else if (/crios/.test(u)) info.browser = "Chrome";
  else if (/fxios/.test(u)) info.browser = "Firefox";
  else if (/chrome\/|chromium/.test(u) && !/edg\//.test(u)) info.browser = "Chrome";
  else if (/firefox\//.test(u)) info.browser = "Firefox";
  else if (/safari\//.test(u) && !/chrome|crios|android/.test(u)) info.browser = "Safari";

  return info;
}

function guessBrand(model: string): string | null {
  const m = model.toUpperCase();
  if (/^SM-|^GT-|^SCH-|^SGH-|^SPH-|^SHV-|^SC-/.test(m)) return "Samsung";
  if (/^PIXEL/.test(m)) return "Google";
  if (/^REDMI/.test(m)) return "Redmi";
  if (/^POCO/.test(m)) return "POCO";
  if (/^MI\s|^MI-|^M2\d|^2\d{7}|^M20|^M21|^22\d{6}/.test(m)) return "Xiaomi";
  if (/^CPH/.test(m)) return "Oppo";
  if (/^V2\d{3}|^V19|^V20|^V21|^V22|^V23|^V25|^V27|^V29|^V30|^V40/.test(m)) return "Vivo";
  if (/^RMX/.test(m)) return "Realme";
  if (/^VOG-|^ELE-|^LYA-|^CLT-|^MAR-|^ANE-|^JNY-|^FIG-|^ELS-|^NOH-|^JAD-/.test(m)) return "Huawei";
  if (/^ONEPLUS|^IN20|^IN21|^LE21|^LE22|^NE22|^CPH2|^KB20|^AC20|^GM19/.test(m)) return "OnePlus";
  if (/^ASUS_|^ZS|^ZB|^ZE|^AI/.test(m)) return "Asus";
  if (/^MOTO|^XT\d/.test(m)) return "Motorola";
  if (/^NOKIA/.test(m)) return "Nokia";
  if (/^INFINIX|^INF/.test(m)) return "Infinix";
  if (/^TECNO|^TEC|^K[FL]\d/.test(m)) return "Tecno";
  if (/^ITEL|^IT/.test(m)) return "Itel";
  if (/^LGE|^LM-|^LG-/.test(m)) return "LG";
  if (/^SONY|^XQ-|^F\d{4}|^SO-/.test(m)) return "Sony";
  return null;
}

export function formatDeviceInfo(info: DeviceInfo): string {
  const parts: string[] = [];
  const typeLabel =
    info.type === "mobile"
      ? "Mobile"
      : info.type === "tablet"
      ? "Tablet"
      : info.type === "desktop"
      ? "Desktop"
      : info.type === "bot"
      ? "Bot"
      : null;
  if (typeLabel) parts.push(typeLabel);
  if (info.os) parts.push(info.os);
  if (info.brand && info.model && !info.model.toUpperCase().includes(info.brand.toUpperCase())) {
    parts.push(`${info.brand} ${info.model}`);
  } else if (info.brand) {
    parts.push(info.brand);
  } else if (info.model) {
    parts.push(info.model);
  }
  return parts.join(" · ");
}

export function parseDevice(ua: string): string {
  return formatDeviceInfo(parseDeviceInfo(ua));
}

export function getClientIp(headers: {
  get: (name: string) => string | null;
}): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-client-ip") ??
    "unknown"
  );
}

export function isPublicIp(ip: string): boolean {
  if (!ip || ip === "unknown") return false;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") return false;
  if (/^10\./.test(ip)) return false;
  if (/^192\.168\./.test(ip)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return false;
  if (/^169\.254\./.test(ip)) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return false;
  if (/^fc00:|^fd00:|^fe80:|^::ffff:10\.|^::ffff:192\.168\./i.test(ip)) return false;
  return true;
}

export async function lookupLocation(ip: string): Promise<string | null> {
  if (!isPublicIp(ip)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.error) return null;
    const parts = [data?.city, data?.region, data?.country_name].filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  } catch {
    return null;
  }
}