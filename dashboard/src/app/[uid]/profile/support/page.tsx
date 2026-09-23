import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";
import { ChevronDown, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

const FAQS: { q: string; a: string[] }[] = [
  {
    q: "Media tidak muncul di dashboard",
    a: [
      "Media hanya diproses bila diunggah melalui bot Telegram dengan caption /qr. Upload langsung dari galeri perangkat tidak masuk ke sistem.",
      "Masa simpan media adalah 30 hari sejak tanggal unggahan. Setelah 30 hari, media dihapus otomatis dari database dan Telegram Storage Chat.",
      "Media yang diunggah sebelum akun terdaftar tidak akan tertaut ke dashboard. Lakukan upload ulang setelah akun aktif.",
      "Jika media belum muncul dalam 30 detik, muat ulang halaman atau periksa koneksi internet perangkat.",
    ],
  },
  {
    q: "Upload foto atau video gagal",
    a: [
      "Batas ukuran file adalah 15 MB per file. Kompresi media bila melebihi batas.",
      "Koneksi internet harus stabil selama proses upload. Koneksi tidak stabil dapat mengakibatkan upload terputus.",
      "Format video mengikuti dukungan browser modern. Format MP4 direkomendasikan untuk kompatibilitas maksimal.",
      "Jika kegagalan berlanjut, tunggu beberapa menit lalu ulangi. Server Telegram kemungkinan sedang overload.",
    ],
  },
  {
    q: "Download stuck di verifikasi reCAPTCHA",
    a: [
      "Verifikasi reCAPTCHA bersifat wajib. Proses download hanya dimulai setelah verifikasi berhasil.",
      "Token verifikasi memiliki masa berlaku terbatas. Jika kedaluwarsa, tekan tombol Download kembali untuk memuat tantangan baru.",
      "Nonaktifkan pemblokir iklan, ekstensi privasi, atau VPN yang dapat memblokir reCAPTCHA.",
      "Jika gagal berulang, gunakan mode incognito atau browser lain.",
    ],
  },
  {
    q: "Video tidak dapat diputar",
    a: [
      "Kodek video mengikuti dukungan browser. Format H.264/MP4 memiliki kompatibilitas terbaik. Format AVI, MKV, atau WMV kemungkinan tidak didukung.",
      "Lakukan hard refresh untuk memuat ulang resource yang ter-cache: Ctrl + Shift + R (desktop) atau bersihkan cache browser (mobile).",
      "Jika masih gagal, kemungkinan file korup. Lakukan upload ulang dari bot Telegram.",
    ],
  },
  {
    q: "Link QR tidak bisa dibuka",
    a: [
      "Link hanya dapat dibuka melalui browser modern dengan koneksi internet aktif.",
      "Periksa kembali ID media pada URL. ID bersifat unik 7 digit dan case-sensitive.",
      "Bila media sudah melewati masa simpan 30 hari, link menampilkan halaman kosong. Upload ulang untuk mendapatkan link baru.",
    ],
  },
];

export default function SupportPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  return (
    <>
      <SubPageHeader
        title="Pusat Bantuan"
        subtitle="Panduan & penanganan kendala"
        backHref={`/${params.uid}/profile`}
      />

      <p className="text-[13.5px] text-ink-soft leading-[1.75] px-1 mb-6 animate-fade-up">
        Bagian ini berisi panduan penanganan kendala yang umum terjadi saat
        menggunakan CheyaVerse. Sebagian besar kendala dapat diselesaikan
        dengan langkah-langkah berikut.
      </p>

      <section className="mb-6 animate-fade-up">
        <h2 className="text-[11.5px] font-semibold tracking-[.08em] uppercase text-ink-mute px-3 mb-2">
          Pertanyaan Umum
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
          Melaporkan Bug
        </h2>
        <div className="rounded-2xl bg-white border border-line p-5">
          <p className="text-[13px] text-ink-soft leading-[1.7] mb-4">
            Bug, kendala teknis di luar panduan di atas, atau perilaku tidak
            wajar pada aplikasi dapat dilaporkan melalui email. Sertakan
            deskripsi masalah, langkah reproduksi, dan tangkapan layar bila
            memungkinkan.
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
        CheyaVerse · v1.4.8
      </p>
    </>
  );
}
