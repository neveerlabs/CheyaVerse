"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, Palette, RefreshCw, X } from "lucide-react";

type QrStyle = {
  name: string;
  start: string;
  end: string;
};

const COLOR_STYLES: QrStyle[] = [
  { name: "Indigo", start: "#535d9f", end: "#a46d9b" },
  { name: "Ocean", start: "#087e8b", end: "#54c6a9" },
  { name: "Sunset", start: "#e05d44", end: "#f0a44b" },
  { name: "Forest", start: "#176b45", end: "#91b84b" },
  { name: "Berry", start: "#8b3d83", end: "#e66b8c" },
  { name: "Aurora", start: "#176b85", end: "#7b61a8" },
  { name: "Lagoon", start: "#087f8c", end: "#6265c4" },
  { name: "Citrus", start: "#db7b18", end: "#a8b83c" },
  { name: "Rose", start: "#c13f69", end: "#f08a75" },
  { name: "Twilight", start: "#394e9b", end: "#d65c8a" },
  { name: "Mint", start: "#318c75", end: "#8bbf91" },
  { name: "Amethyst", start: "#6247aa", end: "#b15fbc" },
  { name: "Mono", start: "#171923", end: "#545b6b" },
];

const BACKGROUNDS = [
  { name: "Putih", value: "#ffffff" },
  { name: "Krem", value: "#fffaf0" },
  { name: "Abu terang", value: "#f1f3f5" },
];

const DOT_STYLES = [
  { name: "Titik", value: "dot" },
  { name: "Bulat", value: "rounded" },
  { name: "Kotak", value: "square" },
] as const;

type DotStyle = (typeof DOT_STYLES)[number]["value"];
type QrAppearance = {
  colorIndex: number;
  background: string;
  dots: DotStyle;
};

const DEFAULT_APPEARANCE: QrAppearance = {
  colorIndex: 0,
  background: "#ffffff",
  dots: "dot",
};

function buildSvg(
  matrix: ReturnType<typeof QRCode.create>,
  appearance: QrAppearance,
  origin: string,
): string {
  const size = matrix.modules.size;
  const quiet = 4;
  const fullSize = size + quiet * 2;
  const color = COLOR_STYLES[appearance.colorIndex] ?? COLOR_STYLES[0];
  const finderOrigins = [
    { x: 0, y: 0 },
    { x: size - 7, y: 0 },
    { x: 0, y: size - 7 },
  ];
  const logoRadius = size * 0.095;
  const logoCenter = fullSize / 2;
  const modules: string[] = [];

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const inFinder = finderOrigins.some(({ x, y }) =>
        column >= x - 1 && column <= x + 7 && row >= y - 1 && row <= y + 7,
      );
      const dx = column + quiet + 0.5 - logoCenter;
      const dy = row + quiet + 0.5 - logoCenter;
      if (
        matrix.modules.get(row, column) !== 1 ||
        inFinder ||
        dx * dx + dy * dy < (logoRadius + 0.8) ** 2
      ) {
        continue;
      }
      const cx = column + quiet + 0.5;
      const cy = row + quiet + 0.5;
      if (appearance.dots === "square") {
        modules.push(`<rect x="${cx - 0.42}" y="${cy - 0.42}" width=".84" height=".84" fill="url(#media-qr-gradient)"/>`);
      } else {
        const radius = appearance.dots === "dot" ? 0.34 : 0.44;
        modules.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#media-qr-gradient)"/>`);
      }
    }
  }

  const finders = finderOrigins.map(({ x, y }) => {
    const px = x + quiet;
    const py = y + quiet;
    const radius = appearance.dots === "square" ? 0.4 : 1.8;
    return `<g transform="translate(${px} ${py})"><rect width="7" height="7" rx="${radius}" fill="url(#media-qr-gradient)"/><rect x="1" y="1" width="5" height="5" rx="${Math.min(1.4, radius)}" fill="${appearance.background}"/><rect x="2" y="2" width="3" height="3" rx="${Math.min(0.9, radius)}" fill="url(#media-qr-gradient)"/></g>`;
  }).join("");
  const logoSize = size * 0.175;
  const logoX = (fullSize - logoSize) / 2;
  const logoUri = `${origin}/assets/cheyaverse.jpg`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="960" viewBox="0 0 ${fullSize} ${fullSize}"><defs><linearGradient id="media-qr-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color.start}"/><stop offset="100%" stop-color="${color.end}"/></linearGradient><clipPath id="media-qr-logo"><circle cx="${logoCenter}" cy="${logoCenter}" r="${logoSize / 2}"/></clipPath></defs><rect width="${fullSize}" height="${fullSize}" fill="${appearance.background}"/>${modules.join("")}${finders}<image href="${logoUri}" x="${logoX}" y="${logoX}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#media-qr-logo)"/></svg>`;
}

async function renderPng(svg: string): Promise<Blob> {
  const logoResponse = await fetch("/assets/cheyaverse.jpg", {
    cache: "force-cache",
  });
  if (!logoResponse.ok) {
    throw new Error("Logo Cheya tidak dapat dimuat.");
  }
  const logoBlob = await logoResponse.blob();
  const logoBytes = new Uint8Array(await logoBlob.arrayBuffer());
  let logoBinary = "";
  for (const byte of logoBytes) logoBinary += String.fromCharCode(byte);
  const logoDataUrl = `data:${logoBlob.type || "image/jpeg"};base64,${btoa(logoBinary)}`;
  const inlineSvg = svg.replace(
    /href="[^"]+\/assets\/cheyaverse\.jpg"/,
    `href="${logoDataUrl}"`,
  );
  const image = new Image();
  const objectUrl = URL.createObjectURL(
    new Blob([inlineSvg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("QR tidak dapat dirender sebagai gambar."));
      image.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 960;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas gambar tidak tersedia.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Tidak dapat membuat QR."));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function MediaQrModal({
  mediaId,
  onClose,
  onToast,
}: {
  mediaId: string;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [origin, setOrigin] = useState("");
  const [showCanvas, setShowCanvas] = useState(false);
  const [maskPattern, setMaskPattern] = useState(0);
  const [draft, setDraft] = useState<QrAppearance>(DEFAULT_APPEARANCE);
  const [appearance, setAppearance] = useState<QrAppearance>(DEFAULT_APPEARANCE);
  const [working, setWorking] = useState(false);
  const url = origin ? `${origin}/m/${encodeURIComponent(mediaId)}` : "";
  const matrix = useMemo(
    () =>
      url
        ? QRCode.create(url, {
            errorCorrectionLevel: "H",
            maskPattern: maskPattern as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
          })
        : null,
    [url, maskPattern],
  );
  const svgMarkup = useMemo(
    () => (matrix && origin ? buildSvg(matrix, appearance, origin) : ""),
    [matrix, appearance, origin],
  );

  useEffect(() => {
    setOrigin(window.location.origin);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function downloadQr() {
    if (!svgMarkup) return;
    setWorking(true);
    try {
      const png = await renderPng(svgMarkup);
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(png);
      link.href = objectUrl;
      link.download = `cheyaverse-media-${mediaId}-qr.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      onToast("Mengunduh QR code.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Gagal mengunduh QR.");
    } finally {
      setWorking(false);
    }
  }

  async function copyQr() {
    if (!svgMarkup) return;
    setWorking(true);
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Browser ini belum mendukung salinan gambar.");
      }
      const png = await renderPng(svgMarkup);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
      onToast("Image copied");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Image copy failed");
    } finally {
      setWorking(false);
    }
  }

  function applyAppearance() {
    setAppearance(draft);
    setMaskPattern((pattern) => (pattern + 1) % 8);
    setShowCanvas(false);
    onToast("Desain QR diterapkan.");
  }

  return (
    <div
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-5"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-qr-title"
        data-report-anchor="left"
        data-report-gap="4"
        className="flex max-h-[min(92dvh,760px)] w-full max-w-[430px] flex-col overflow-hidden rounded-[28px] border border-white/60 bg-[#f7f8fa] shadow-[0_24px_90px_-24px_rgba(0,0,0,.45)] animate-fade-up"
      >
        <header className="flex items-center justify-between border-b border-black/[.06] bg-white px-5 py-4">
          <div>
            <h2 id="media-qr-title" className="text-[16px] font-semibold text-ink">
              QR Code media
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-mute">
              Simpan atau bagikan akses media dengan QR code dibawah ini.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup QR"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2f3f5] text-ink-soft active:scale-95"
          >
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5">
          <div className="mx-auto w-full max-w-[310px] rounded-[24px] border border-black/[.06] bg-white p-4 shadow-[0_8px_24px_-18px_rgba(0,0,0,.24)]">
            {svgMarkup ? (
              <div
                className="aspect-square w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                aria-label="QR code menuju media"
                role="img"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : (
              <div className="aspect-square animate-pulse rounded-xl bg-[#f0f1f3]" />
            )}
          </div>
          <p className="mx-auto mt-3 max-w-[310px] break-all text-center font-mono text-[10.5px] leading-relaxed text-ink-mute">
            {url}
          </p>

          {showCanvas && (
            <div className="mt-5 rounded-2xl border border-black/[.06] bg-white p-4">
              <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Palette size={16} />
                Sesuaikan desain
              </div>
              <p className="mb-2 text-[11px] font-medium text-ink-mute">Warna QR</p>
              <div className="mb-4 grid grid-cols-5 gap-2">
                {COLOR_STYLES.map((style, index) => (
                  <button
                    key={style.name}
                    type="button"
                    title={style.name}
                    aria-label={`Warna ${style.name}`}
                    aria-pressed={draft.colorIndex === index}
                    onClick={() => setDraft((value) => ({ ...value, colorIndex: index }))}
                    className={`relative h-9 rounded-xl border-2 ${
                      draft.colorIndex === index ? "border-ink" : "border-transparent"
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${style.start}, ${style.end})`,
                    }}
                  >
                    {draft.colorIndex === index && (
                      <Check size={15} className="absolute inset-0 m-auto text-white" />
                    )}
                  </button>
                ))}
              </div>
              <p className="mb-2 text-[11px] font-medium text-ink-mute">Latar</p>
              <div className="mb-4 flex gap-2">
                {BACKGROUNDS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={draft.background === item.value}
                    onClick={() => setDraft((value) => ({ ...value, background: item.value }))}
                    className={`rounded-full border px-3 py-1.5 text-[11px] ${
                      draft.background === item.value
                        ? "border-ink text-ink"
                        : "border-line text-ink-mute"
                    }`}
                    style={{ backgroundColor: item.value }}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <p className="mb-2 text-[11px] font-medium text-ink-mute">Bentuk titik</p>
              <div className="flex gap-2">
                {DOT_STYLES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={draft.dots === item.value}
                    onClick={() => setDraft((value) => ({ ...value, dots: item.value }))}
                    className={`flex-1 rounded-xl border px-2 py-2 text-[11px] ${
                      draft.dots === item.value
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-white text-ink-soft"
                    }`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={applyAppearance}
                className="mt-4 w-full rounded-xl bg-ink px-4 py-2.5 text-[12px] font-semibold text-white active:scale-[.98]"
              >
                Terapkan desain
              </button>
            </div>
          )}
        </div>

        <footer className="grid grid-cols-4 gap-2 border-t border-black/[.06] bg-white px-4 py-3">
          <button
            type="button"
            disabled={working || !svgMarkup}
            onClick={() => void downloadQr()}
            className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl bg-[#f3f4f6] text-[10px] font-medium text-ink disabled:opacity-50"
          >
            <Download size={16} />
            Download
          </button>
          <button
            type="button"
            disabled={working || !svgMarkup}
            onClick={() => void copyQr()}
            className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl bg-[#f3f4f6] text-[10px] font-medium text-ink disabled:opacity-50"
          >
            <Copy size={16} />
            Copy image
          </button>
          <button
            type="button"
            onClick={() => setMaskPattern((pattern) => (pattern + 1) % 8)}
            className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl bg-[#f3f4f6] text-[10px] font-medium text-ink"
          >
            <RefreshCw size={16} />
            Regenerate
          </button>
          <button
            type="button"
            aria-expanded={showCanvas}
            onClick={() => {
              setDraft(appearance);
              setShowCanvas((visible) => !visible);
            }}
            className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl bg-[#f3f4f6] text-[10px] font-medium text-ink"
          >
            <Palette size={16} />
            Canvas
          </button>
        </footer>
      </section>
    </div>
  );
}
