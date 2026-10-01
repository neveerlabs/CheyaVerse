"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  Check,
  Copy,
  Download,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";

type Contact = {
  uid: string;
  username: string;
  first_name: string;
  last_name: string;
  photo_url?: string;
};

type QrBlend = {
  name: string;
  start: string;
  end: string;
};

const QR_BLENDS: QrBlend[] = [
  { name: "Indigo rose", start: "#5364b7", end: "#c05f9c" },
  { name: "Ocean", start: "#087e8b", end: "#54c6a9" },
  { name: "Sunset", start: "#e05d44", end: "#f0a44b" },
  { name: "Violet", start: "#6941c6", end: "#4f9fe8" },
  { name: "Emerald", start: "#167a58", end: "#9abf4b" },
];

type Props = {
  contact: Contact;
  onClose: () => void;
  onToast: (message: string) => void;
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function buildSvg(
  matrix: ReturnType<typeof QRCode.create>,
  blend: QrBlend,
  origin: string,
): string {
  const size = matrix.modules.size;
  const quietZone = 4;
  const fullSize = size + quietZone * 2;
  const logoCenter = fullSize / 2;
  const logoSize = size * 0.19;
  const finderOrigins = [
    { x: 0, y: 0 },
    { x: size - 7, y: 0 },
    { x: 0, y: size - 7 },
  ];
  const dots: string[] = [];

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const inFinder = finderOrigins.some(
        ({ x, y }) =>
          column >= x - 1 &&
          column <= x + 7 &&
          row >= y - 1 &&
          row <= y + 7,
      );
      const dx = column + quietZone + 0.5 - logoCenter;
      const dy = row + quietZone + 0.5 - logoCenter;
      if (
        matrix.modules.get(row, column) !== 1 ||
        inFinder ||
        dx * dx + dy * dy < (logoSize / 2 + 0.8) ** 2
      ) {
        continue;
      }
      dots.push(
        `<circle cx="${column + quietZone + 0.5}" cy="${row + quietZone + 0.5}" r=".39" fill="url(#contact-qr-gradient)"/>`,
      );
    }
  }

  const finders = finderOrigins
    .map(({ x, y }) => {
      const left = x + quietZone;
      const top = y + quietZone;
      return `<g transform="translate(${left} ${top})"><rect width="7" height="7" rx="1.7" fill="url(#contact-qr-gradient)"/><rect x="1" y="1" width="5" height="5" rx="1" fill="#fff"/><rect x="2" y="2" width="3" height="3" rx=".7" fill="url(#contact-qr-gradient)"/></g>`;
    })
    .join("");
  const logoX = logoCenter - logoSize / 2;
  const logoUrl = escapeXml(`${origin}/assets/cheyaverse.jpg`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="960" viewBox="0 0 ${fullSize} ${fullSize}"><defs><linearGradient id="contact-qr-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${blend.start}"/><stop offset="100%" stop-color="${blend.end}"/></linearGradient><clipPath id="contact-qr-logo-clip"><circle cx="${logoCenter}" cy="${logoCenter}" r="${logoSize / 2}"/></clipPath></defs><rect width="${fullSize}" height="${fullSize}" fill="#fff"/>${dots.join("")}${finders}<image href="${logoUrl}" x="${logoX}" y="${logoX}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#contact-qr-logo-clip)"/></svg>`;
}

async function renderPng(svg: string): Promise<Blob> {
  const logoResponse = await fetch("/assets/cheyaverse.jpg", {
    cache: "force-cache",
  });
  if (!logoResponse.ok) {
    throw new Error("CheyaVerse logo could not be loaded.");
  }
  const logoBlob = await logoResponse.blob();
  const logoBytes = new Uint8Array(await logoBlob.arrayBuffer());
  let logoBinary = "";
  for (const byte of logoBytes) logoBinary += String.fromCharCode(byte);
  const logoDataUrl = `data:${logoBlob.type || "image/jpeg"};base64,${btoa(logoBinary)}`;
  const inlineSvg = svg.replace(
    /href="[^"]*\/assets\/cheyaverse\.jpg"/,
    `href="${logoDataUrl}"`,
  );
  const image = new Image();
  const svgUrl = URL.createObjectURL(
    new Blob([inlineSvg], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("QR code could not be rendered."));
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 960;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image rendering is unavailable.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not create the QR image."));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function ContactQrModal({
  contact,
  onClose,
  onToast,
}: Props) {
  const [origin, setOrigin] = useState("");
  const [maskPattern, setMaskPattern] = useState(0);
  const [blendIndex, setBlendIndex] = useState(0);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const username = contact.username.trim().replace(/^@/, "");
  const url = useMemo(() => {
    if (username) return `https://t.me/${encodeURIComponent(username)}`;
    if (!origin) return "";
    return `tg://user?id=${encodeURIComponent(contact.uid)}`;
  }, [contact.uid, origin, username]);
  const matrix = useMemo(
    () =>
      url
        ? QRCode.create(url, {
            errorCorrectionLevel: "H",
            maskPattern: maskPattern as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
          })
        : null,
    [maskPattern, url],
  );
  const blend = QR_BLENDS[blendIndex] ?? QR_BLENDS[0];
  const svgMarkup = useMemo(
    () => (matrix && origin ? buildSvg(matrix, blend, origin) : ""),
    [blend, matrix, origin],
  );
  const displayName =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.username ||
    "Contact";

  useEffect(() => {
    setOrigin(window.location.origin);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function regenerate() {
    setBlendIndex((index) => (index + 1) % QR_BLENDS.length);
    setMaskPattern((pattern) => (pattern + 1) % 8);
  }

  async function downloadQr() {
    if (!svgMarkup) return;
    setWorking(true);
    try {
      const png = await renderPng(svgMarkup);
      const objectUrl = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `cheyaverse-contact-${contact.uid}-qr.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      onToast("QR image downloaded.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not download QR image.");
    } finally {
      setWorking(false);
    }
  }

  async function copyQr() {
    if (!svgMarkup) return;
    setWorking(true);
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("This browser does not support copying images.");
      }
      const png = await renderPng(svgMarkup);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      onToast("QR image copied.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not copy QR image.");
    } finally {
      setWorking(false);
    }
  }

  async function shareQr() {
    if (!svgMarkup) return;
    setWorking(true);
    try {
      if (typeof navigator.share !== "function") {
        throw new Error("Sharing is not supported by this browser.");
      }
      const png = await renderPng(svgMarkup);
      const file = new File([png], "cheyaverse-contact-qr.png", {
        type: "image/png",
      });
      const shareTitle = `${displayName} · CheyaVerse`;
      const fileSharingUnsupported =
        typeof navigator.canShare === "function" &&
        !navigator.canShare({ files: [file] });

      if (fileSharingUnsupported) {
        await navigator.share({ title: `${displayName} · CheyaVerse`, url });
      } else {
        try {
          await navigator.share({ files: [file], title: shareTitle });
        } catch (error) {
          const unsupportedFileError =
            error instanceof TypeError ||
            (error instanceof DOMException &&
              ["DataError", "NotSupportedError"].includes(error.name));
          if (
            typeof navigator.canShare === "function" ||
            !unsupportedFileError
          ) {
            throw error;
          }
          await navigator.share({ title: shareTitle, url });
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      onToast(
        error instanceof Error
          ? `Could not share QR image: ${error.message}`
          : "Could not share QR image.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm sm:p-5"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-qr-title"
        className="flex max-h-[min(92dvh,720px)] w-full max-w-[360px] flex-col overflow-hidden rounded-[24px] border border-white/70 bg-[#f8f9fb] shadow-[0_24px_90px_-24px_rgba(0,0,0,.4)]"
      >
        <header className="flex items-center justify-between border-b border-black/[.06] bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 id="contact-qr-title" className="text-[16px] font-semibold text-ink">
              Contact QR code
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-ink-mute">
              Share a link to {displayName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close contact QR"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2f3f5] text-ink-soft transition hover:bg-[#e9ebef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6873c4]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-6">
          <div
            className="mx-auto w-full max-w-[240px]"
            aria-label={`QR code linking to ${displayName}`}
            role="img"
          >
            {svgMarkup ? (
              <div
                className="aspect-square w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : (
              <div className="aspect-square w-full animate-pulse rounded-2xl bg-[#eef0f4]" />
            )}
          </div>
          <p className="mx-auto mt-3 max-w-[260px] break-all text-center font-mono text-[10px] leading-relaxed text-ink-mute">
            {url || "Preparing contact link…"}
          </p>
          <button
            type="button"
            onClick={regenerate}
            disabled={!svgMarkup || working}
            aria-label={`Regenerate QR style (${blend.name})`}
            className="mx-auto mt-4 flex min-h-10 items-center justify-center gap-2 rounded-full border border-black/[.08] bg-white px-4 text-[12px] font-medium text-ink-soft transition hover:border-black/15 hover:bg-[#f7f8fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6873c4] disabled:opacity-50"
          >
            <RefreshCw size={15} />
            Regenerate
          </button>
        </div>

        <footer className="grid grid-cols-4 gap-2 border-t border-black/[.06] bg-white px-4 py-3">
          <button
            type="button"
            disabled={working || !svgMarkup}
            onClick={() => void copyQr()}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-[#f3f4f6] text-[10px] font-medium text-ink transition hover:bg-[#e9ebef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6873c4] disabled:opacity-50"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            Copy
          </button>
          <button
            type="button"
            disabled={working || !svgMarkup}
            onClick={() => void shareQr()}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-[#f3f4f6] text-[10px] font-medium text-ink transition hover:bg-[#e9ebef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6873c4] disabled:opacity-50"
          >
            <Share2 size={16} />
            Share
          </button>
          <button
            type="button"
            disabled={working || !svgMarkup}
            onClick={() => void downloadQr()}
            className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#f3f4f6] text-[11px] font-medium text-ink transition hover:bg-[#e9ebef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6873c4] disabled:opacity-50"
          >
            <Download size={16} />
            Download PNG
          </button>
        </footer>
      </section>
    </div>
  );
}
