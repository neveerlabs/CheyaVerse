import { isIP } from "node:net";

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
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-client-ip"),
    ...(headers.get("x-forwarded-for")?.split(",") ?? []),
  ]
    .map((ip) => ip?.trim() ?? "")
    .filter(Boolean);
  const publicIp = candidates.find(isPublicIp);
  if (publicIp) return publicIp;
  return candidates.find((ip) => isIP(ip) !== 0) ?? "unknown";
}

export function isPublicIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [first, second, third] = ip.split(".").map(Number);
    if (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 &&
        (second === 0 ||
          second === 168 ||
          (second === 88 && third === 99))) ||
      (first === 198 &&
        (second === 18 ||
          second === 19 ||
          (second === 51 && third === 100))) ||
      (first === 203 && second === 0 && third === 113)
    ) {
      return false;
    }
    return true;
  }
  if (version !== 6) return false;

  const [firstHextet, secondHextet] = ip.toLowerCase().split(":");
  if (!/^[23]/.test(firstHextet)) return false;
  const second = Number.parseInt(secondHextet || "0", 16);
  if (
    (firstHextet === "2001" &&
      (second <= 0x01ff || second === 0x0db8)) ||
    firstHextet === "2002" ||
    (firstHextet === "3fff" && second <= 0x0fff)
  ) {
    return false;
  }
  return true;
}

type LocationFields = {
  city: string | null;
  region: string | null;
  country: string | null;
  postal: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function locationFields(
  value: Record<string, unknown>,
): LocationFields | null {
  const city =
    typeof value.city === "string" && value.city.trim()
      ? value.city.trim()
      : null;
  const region =
    typeof value.region === "string" && value.region.trim()
      ? value.region.trim()
      : null;
  const countryValue = value.country_name ?? value.country;
  const country =
    typeof countryValue === "string" && countryValue.trim()
      ? countryValue.trim()
      : null;
  const postalValue = value.postal ?? value.postal_code;
  const postal =
    typeof postalValue === "string" && postalValue.trim()
      ? postalValue.trim()
      : null;
  return city || region || country || postal
    ? { city, region, country, postal }
    : null;
}

async function fetchLocation(
  url: string,
  parse: (value: Record<string, unknown>) => LocationFields | null,
): Promise<LocationFields | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!isRecord(data)) return null;
    return parse(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupLocationFields(ip: string): Promise<LocationFields | null> {
  if (!isPublicIp(ip)) return null;
  const encodedIp = encodeURIComponent(ip);
  const primary = await fetchLocation(
    `https://ipapi.co/${encodedIp}/json/`,
    (data) => (data.error ? null : locationFields(data)),
  );
  if (primary?.city && primary.country) return primary;

  const fallback = await fetchLocation(
    `https://ipwho.is/${encodedIp}`,
    (data) =>
      data.success === false
        ? null
        : locationFields({
            city: data.city,
            region: data.region,
            country: data.country,
            postal: data.postal,
          }),
  );
  if (!primary && !fallback) {
    console.warn("[device] IP geolocation providers returned no location data.");
  }
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    city: primary.city ?? fallback.city,
    region: primary.region ?? fallback.region,
    country: primary.country ?? fallback.country,
    postal: primary.postal ?? fallback.postal,
  };
}

export async function lookupLocationDetails(
  ip: string,
): Promise<LocationFields | null> {
  return lookupLocationFields(ip);
}

export async function lookupLocation(ip: string): Promise<string | null> {
  const location = await lookupLocationFields(ip);
  if (!location) return null;
  const parts = [location.city, location.region, location.country].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length ? parts.join(", ") : null;
}

export async function lookupCityAndCountry(
  ip: string,
): Promise<Pick<LocationFields, "city" | "country"> | null> {
  const location = await lookupLocationFields(ip);
  return location ? { city: location.city, country: location.country } : null;
}