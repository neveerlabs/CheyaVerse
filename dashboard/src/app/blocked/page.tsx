import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default function BlockedPage() {
  return (
    <main className="mx-auto max-w-[600px] px-5 min-h-screen flex flex-col items-center justify-center py-10">
      <div className="w-20 h-20 rounded-full bg-[#fff0f0] flex items-center justify-center mb-5">
        <ShieldAlert size={32} className="text-danger" strokeWidth={2} />
      </div>
      <h1 className="text-[22px] font-bold tracking-[-.02em] text-ink mb-2 text-center">
        Perangkat Diblokir
      </h1>
      <p className="text-[13.5px] text-ink-soft text-center max-w-[380px] leading-relaxed">
        Perangkat ini telah diblokir dari layanan CheyaVerse. Akses ke seluruh
        halaman dashboard akan ditolak secara otomatis dari perangkat ini.
      </p>
      <p className="text-[12px] text-ink-mute text-center max-w-[340px] leading-relaxed mt-4">
        Jika Anda merasa ini sebuah kesalahan, hubungi pemilik akun Telegram
        terkait untuk membuka blokir.
      </p>
    </main>
  );
}
