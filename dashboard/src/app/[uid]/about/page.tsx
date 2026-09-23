import { AppHeader } from "@/components/AppHeader";
import { GroupSection } from "@/components/GroupSection";
import { ListRow } from "@/components/ListRow";
import {
  Bot,
  Tag,
  Code2,
  Clock,
  Database,
  User,
  Layers,
  HardDrive,
  Globe,
  Cpu,
  Palette,
  Radio,
  ShieldCheck,
  Image as ImageIcon,
} from "lucide-react";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  const bot = config.botUsername ? `@${config.botUsername}` : "—";
  const ttl = config.mediaTtlDays;

  return (
    <>
      <AppHeader title="Tentang" subtitle="Informasi aplikasi & pengembang" />

      <section className="px-1 mb-6 animate-fade-up">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border border-line bg-[#f5f5f5] flex-shrink-0">
            <img
              src="/icon.png"
              alt=""
              draggable={false}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold tracking-[-.03em] text-ink leading-tight">
              CheyaVerse
            </h2>
            <p className="text-[13px] text-ink-mute mt-0.5">
              v1.4.8-release
            </p>
          </div>
        </div>
        <p className="text-[13.5px] text-ink-soft leading-[1.7] mt-4">
          CheyaVerse adalah webapp personal yang terhubung dengan bot Telegram. Dan terhubung langsung dengan akun telegram anda
        </p>
      </section>

      <GroupSection title="Bot">
        <ListRow icon={<Bot size={22} />} title="Username" value={bot} disabled />
        <ListRow icon={<Globe size={22} />} title="Platform" value="Telegram" disabled />
        <ListRow
          icon={<Tag size={22} />}
          title="Prefix command"
          value="/qr · /web"
          disabled
        />
      </GroupSection>

      <GroupSection title="Aplikasi">
        <ListRow icon={<Code2 size={22} />} title="Versi" value="v1.4.8" disabled />
        <ListRow
          icon={<ShieldCheck size={22} />}
          title="Status"
          value="Running"
          disabled
        />
        <ListRow icon={<Radio size={22} />} title="Realtime" value="SSE" disabled />
      </GroupSection>

      <GroupSection title="Media">
        <ListRow
          icon={<Clock size={22} />}
          title="Masa simpan"
          value={`${ttl} hari`}
          disabled
        />
        <ListRow icon={<ImageIcon size={22} />} title="Ukuran maks" value="5 MB" disabled />
        <ListRow
          icon={<Palette size={22} />}
          title="Sampul profil"
          value="Foto · Warna · Ikon"
          disabled
        />
      </GroupSection>

      <GroupSection title="Teknologi">
        <ListRow icon={<Cpu size={22} />} title="Frontend" value="Next.js 14" disabled />
        <ListRow icon={<Layers size={22} />} title="UI" value="Tailwind CSS" disabled />
        <ListRow
          icon={<Database size={22} />}
          title="Database"
          value="Turso (libsql)"
          disabled
        />
        <ListRow
          icon={<HardDrive size={22} />}
          title="Storage"
          value="Telegram Chat"
          disabled
        />
      </GroupSection>

      <GroupSection title="Pengembang">
        <ListRow
          icon={<User size={22} />}
          title="Nama"
          value="M. Syalman Al Farizi"
          disabled
        />
        <ListRow icon={<Code2 size={22} />} title="Role" value="Full-stack Developer" disabled />
      </GroupSection>

      <p className="text-center text-[11px] text-ink-mute py-4 font-medium">
        Made with ♥ CheyaVerse · v1.4.8
      </p>
    </>
  );
}
