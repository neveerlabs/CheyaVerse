import { AppHeader } from "@/components/AppHeader";
import { CommandRow } from "./CommandRow";
import { Terminal } from "lucide-react";

export const dynamic = "force-dynamic";

const COMMANDS = [
  { cmd: "/start", desc: "Mulai bot dan tampilkan info CheyaVerse" },
  { cmd: "/help", desc: "Tampilkan menu bantuan & perintah" },
  { cmd: "/web", desc: "Dapatkan URL dashboard personal kamu" },
  { cmd: "/qr <teks>", desc: "Generate QR code dari teks apa pun" },
  { cmd: "/qr (caption)", desc: "Upload foto/video dengan caption /qr untuk dapat QR viewer" },
];

export default function CommandsPage() {
  return (
    <>
      <AppHeader
        title="Perintah"
        subtitle="Command yang tersedia"
        icon={<Terminal size={22} strokeWidth={2.4} />}
      />
      <div className="rounded-2xl bg-white border border-line overflow-hidden animate-fade-up">
        {COMMANDS.map((c) => (
          <CommandRow key={c.cmd} cmd={c.cmd} desc={c.desc} />
        ))}
      </div>
      <p className="text-center text-[11px] text-ink-mute py-3 font-medium mt-3">
        Tap pada perintah untuk menyalin
      </p>
    </>
  );
}