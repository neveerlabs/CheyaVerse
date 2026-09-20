import { AppHeader } from "@/components/AppHeader";
import { CommandRow } from "./CommandRow";

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
      <AppHeader title="Perintah" subtitle="Tap tombol copy untuk menyalin command" />
      <div className="flex flex-col px-1 animate-fade-up">
        {COMMANDS.map((c) => (
          <CommandRow key={c.cmd} cmd={c.cmd} desc={c.desc} />
        ))}
      </div>
      <p className="text-center text-[11.5px] text-ink-mute py-5 font-normal">
        CheyaVerse · v1.4.8
      </p>
    </>
  );
}
