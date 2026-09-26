"use client";

import { useState } from "react";
import {
  Globe,
  Calendar,
  Database,
  Trash2,
  Cpu,
  Layers,
  HardDrive,
  Check,
} from "lucide-react";

export function SettingsClient({ mediaTtlDays }: { mediaTtlDays: number }) {
  const [cleared, setCleared] = useState(false);

  function clearCache() {
    try {
      localStorage.removeItem("cheya-media-view");
    } catch {}
    setCleared(true);
    setTimeout(() => setCleared(false), 1800);
  }

  return (
    <>
      <section className="mb-6 animate-fade-up">
        <h2 className="text-[11.5px] font-semibold tracking-[.08em] uppercase text-ink-mute px-3 mb-2">
          Umum
        </h2>
        <div className="rounded-2xl bg-white border border-line overflow-hidden">
          <Row
            icon={<Globe size={17} strokeWidth={1.7} />}
            title="Bahasa"
            value="Indonesia"
          />
          <Row
            icon={<Calendar size={17} strokeWidth={1.7} />}
            title="Format tanggal"
            value="24 jam"
            last
          />
        </div>
      </section>

      <section className="mb-6 animate-fade-up">
        <h2 className="text-[11.5px] font-semibold tracking-[.08em] uppercase text-ink-mute px-3 mb-2">
          Data
        </h2>
        <div className="rounded-2xl bg-white border border-line overflow-hidden">
          <Row
            icon={<Database size={17} strokeWidth={1.7} />}
            title="Masa simpan media"
            value={`${mediaTtlDays} hari`}
          />
          <Row
            icon={<HardDrive size={17} strokeWidth={1.7} />}
            title="Penyimpanan"
            value="Telegram"
          />
          <Row
            icon={<Trash2 size={17} strokeWidth={1.7} />}
            title="Bersihkan cache lokal"
            subtitle="Hapus preferensi yang tersimpan di perangkat"
            action={
              <button
                type="button"
                onClick={clearCache}
                className={`text-[13px] font-medium transition-colors ${
                  cleared ? "text-success" : "text-ink-soft hover:text-ink"
                }`}
              >
                {cleared ? (
                  <span className="inline-flex items-center gap-1">
                    <Check size={13} strokeWidth={2.4} /> Selesai
                  </span>
                ) : (
                  "Bersihkan"
                )}
              </button>
            }
            last
          />
        </div>
      </section>

      <section className="mb-6 animate-fade-up">
        <h2 className="text-[11.5px] font-semibold tracking-[.08em] uppercase text-ink-mute px-3 mb-2">
          Tentang Aplikasi
        </h2>
        <div className="rounded-2xl bg-white border border-line overflow-hidden">
          <Row
            icon={<Layers size={17} strokeWidth={1.7} />}
            title="Versi"
            value="v1.7.3-release"
          />
          <Row
            icon={<Cpu size={17} strokeWidth={1.7} />}
            title="Runtime"
            value="Next.js 14"
          />
          <Row
            icon={<Database size={17} strokeWidth={1.7} />}
            title="Backend"
            value="Turso · Telegram"
            last
          />
        </div>
      </section>
    </>
  );
}

function Row({
  icon,
  title,
  subtitle,
  value,
  action,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  action?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3.5 px-4 py-[14px] min-h-[56px] relative ${
        last
          ? ""
          : "before:absolute before:bottom-0 before:left-[46px] before:right-0 before:h-px before:bg-divider"
      }`}
    >
      <span className="w-5 h-5 flex items-center justify-center text-ink-soft flex-shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[14.5px] text-ink tracking-[-.005em] leading-tight truncate">
          {title}
        </span>
        {subtitle && (
          <span className="text-[12px] text-ink-mute leading-tight truncate">
            {subtitle}
          </span>
        )}
      </span>
      {action ? (
        <span className="flex-shrink-0">{action}</span>
      ) : value !== undefined ? (
        <span className="text-[13px] text-ink-soft flex-shrink-0">{value}</span>
      ) : null}
    </div>
  );
}