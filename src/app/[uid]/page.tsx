import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { GroupSection } from "@/components/GroupSection";
import { ListRow } from "@/components/ListRow";
import { HomeLookup } from "./HomeLookup";
import {
  Send, Terminal, QrCode, Upload, BarChart3, Info, Bot, Sparkles,
} from "lucide-react";
import { config } from "@/lib/config";
import { getStats } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: { uid: string } }) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  const bot = config.botUsername;
  const botUrl = bot ? `https://t.me/${bot}` : undefined;
  let stats = { total: 0, active: 0, expired: 0 };
  try { stats = await getStats(uid); } catch {}

  return (
    <>
      <AppHeader
        title="CheyaVerse"
        subtitle={`ID ${uid}`}
        icon={<Bot size={22} strokeWidth={2.4} />}
      />

      <div className="grid grid-cols-3 gap-2 mb-7 animate-fade-up">
        <StatMini value={stats.total} label="Total" />
        <StatMini value={stats.active} label="Aktif" />
        <StatMini value={stats.expired} label="Expired" />
      </div>

      <HomeLookup uid={uid} />

      <GroupSection title="Bot">
        <ListRow
          icon={<Send size={22} />}
          title="Buka di Telegram"
          subtitle={bot ? `@${bot}` : "Username bot belum diatur"}
          href={botUrl}
          external
          disabled={!bot}
        />
        <ListRow
          icon={<Terminal size={22} />}
          title="Daftar Perintah"
          subtitle="Semua command yang tersedia"
          href={`/${uid}/commands`}
        />
      </GroupSection>

      <GroupSection title="Tools">
        <ListRow
          icon={<QrCode size={22} />}
          title="Generate QR"
          subtitle="Kirim /qr <teks> ke bot"
          href={botUrl}
          external
          disabled={!bot}
        />
        <ListRow
          icon={<Upload size={22} />}
          title="Upload Media"
          subtitle="Foto/video dengan caption /qr"
          href={botUrl}
          external
          disabled={!bot}
        />
        <ListRow
          icon={<Sparkles size={22} />}
          title="Media Terbaru"
          subtitle="File yang baru di-upload"
          href={`/${uid}/media`}
        />
      </GroupSection>

      <GroupSection title="Lainnya">
        <ListRow
          icon={<BarChart3 size={22} />}
          title="Statistik"
          subtitle="Ringkasan penggunaan"
          href={`/${uid}/stats`}
        />
        <ListRow
          icon={<Info size={22} />}
          title="Tentang"
          subtitle="Info bot & developer"
          href={`/${uid}/about`}
        />
      </GroupSection>

      <p className="text-center text-[11px] text-ink-mute py-3 font-medium">
        CheyaVerse · v1.2.2
      </p>
    </>
  );
}

function StatMini({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white border border-line p-3.5">
      <div className="text-[22px] font-bold tracking-[-.03em] text-ink leading-none tabular-nums">
        {value.toLocaleString("id-ID")}
      </div>
      <div className="text-[10.5px] font-semibold text-ink-mute mt-1.5">{label}</div>
    </div>
  );
}