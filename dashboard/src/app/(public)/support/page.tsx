import { AppHeader } from "@/components/AppHeader";
import { ChevronDown, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

const FAQS: { q: string; a: string[] }[] = [
  {
    q: "Media is missing from the dashboard",
    a: [
      "Media hanya diproses jika diunggah melalui bot Telegram dengan keterangan /qr. Unggahan langsung dari galeri perangkat tidak diproses.",
      "Media disimpan selama 30 hari sejak diunggah, lalu dihapus otomatis dari basis data dan Telegram Storage Chat.",
      "Media yang diunggah sebelum akun terdaftar tidak tertaut ke dashboard. Unggah kembali setelah akun aktif.",
      "Jika media belum muncul setelah 30 detik, muat ulang halaman atau periksa koneksi internet.",
    ],
  },
  {
    q: "Photo or video upload failed",
    a: [
      "Ukuran maksimum setiap file adalah 15 MB. Kompresi media jika melebihi batas tersebut.",
      "Pastikan koneksi internet stabil selama proses pengunggahan untuk mencegah proses terputus.",
      "Format video bergantung pada dukungan browser. Format MP4 direkomendasikan untuk kompatibilitas yang lebih baik.",
      "Jika masalah berlanjut, tunggu beberapa menit sebelum mencoba kembali. Server Telegram mungkin sedang sibuk.",
    ],
  },
  {
    q: "Download is stuck at reCAPTCHA verification",
    a: [
      "Verifikasi reCAPTCHA wajib diselesaikan sebelum proses pengunduhan dimulai.",
      "Token verifikasi memiliki masa berlaku terbatas. Jika kedaluwarsa, pilih Download kembali untuk memuat tantangan baru.",
      "Nonaktifkan pemblokir iklan, ekstensi privasi, atau VPN yang mungkin menghalangi reCAPTCHA.",
      "Jika masalah berulang, coba gunakan mode privat atau browser lain.",
    ],
  },
  {
    q: "Video will not play",
    a: [
      "Pemutaran video bergantung pada dukungan browser. Format H.264/MP4 memiliki kompatibilitas terbaik; AVI, MKV, dan WMV mungkin tidak didukung.",
      "Muat ulang halaman tanpa menggunakan cache dengan menekan Ctrl + Shift + R (desktop), atau bersihkan cache browser (perangkat seluler).",
      "Jika masalah berlanjut, file mungkin rusak. Unggah kembali melalui bot Telegram.",
    ],
  },
  {
    q: "QR link will not open",
    a: [
      "Tautan hanya dapat dibuka melalui browser modern dengan koneksi internet aktif.",
      "Pastikan ID media pada URL benar. ID terdiri atas tujuh digit dan peka terhadap huruf besar atau kecil.",
      "Media yang telah melewati masa simpan 30 hari tidak lagi tersedia. Unggah kembali untuk mendapatkan tautan baru.",
    ],
  },
];

export default function SupportPage() {
  return (
    <>
      <AppHeader
        title="Help Center"
        subtitle="Panduan penggunaan dan penanganan kendala."
      />

      <p className="text-[13.5px] text-ink-soft leading-[1.75] px-1 mb-6 animate-fade-up">
        Halaman ini memuat panduan untuk mengatasi kendala umum saat
        menggunakan CheyaVerse. Sebagian besar kendala dapat diselesaikan
        dengan mengikuti langkah-langkah berikut.
      </p>

      <section className="mb-6 animate-fade-up">
        <h2 className="text-[11.5px] font-semibold tracking-[.08em] uppercase text-ink-mute px-3 mb-2">
          Frequently Asked Questions
        </h2>
        <div className="rounded-2xl bg-white border border-line overflow-hidden">
          {FAQS.map((item, idx) => (
            <details
              key={item.q}
              className={`group ${
                idx !== FAQS.length - 1 ? "border-b border-divider" : ""
              }`}
            >
              <summary className="flex items-center justify-between gap-3 px-4 py-[15px] min-h-[56px] cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden transition-colors sm:hover:bg-[#fafafa]">
                <span className="text-[14px] font-medium text-ink leading-snug tracking-[-.005em]">
                  {item.q}
                </span>
                <ChevronDown
                  size={17}
                  strokeWidth={2}
                  className="text-ink-mute flex-shrink-0 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="px-4 pb-4 -mt-0.5">
                <ul className="flex flex-col gap-2">
                  {item.a.map((step, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-[12.5px] text-ink-soft leading-[1.65]"
                    >
                      <span className="mt-[7px] w-[5px] h-[5px] rounded-full bg-ink-mute flex-shrink-0" />
                      <span className="flex-1">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="mb-6 animate-fade-up">
        <h2 className="text-[11.5px] font-semibold tracking-[.08em] uppercase text-ink-mute px-3 mb-2">
          Report a Bug
        </h2>
        <div className="rounded-2xl bg-white border border-line p-5">
          <p className="text-[13px] text-ink-soft leading-[1.7] mb-4">
            Laporkan bug, kendala teknis di luar panduan, atau perilaku aplikasi
            yang tidak wajar melalui email. Sertakan deskripsi masalah, langkah
            reproduksi, dan tangkapan layar jika tersedia.
          </p>
          <a
            href="mailto:userlinuxorg@gmail.com?subject=Laporan%20Bug%20CheyaVerse"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-ink text-white text-[13px] font-medium transition-all active:scale-[.97] sm:hover:bg-accent-hover"
          >
            <Mail size={15} strokeWidth={2.2} />
            userlinuxorg@gmail.com
          </a>
        </div>
      </section>

      <p className="text-center text-[11px] text-ink-mute py-3 font-normal">
        CheyaVerse · v1.7.3-release
      </p>
    </>
  );
}