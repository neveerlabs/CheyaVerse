import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";
import { ChevronDown, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

const FAQS: { q: string; a: string[] }[] = [
  {
    q: "Media tidak muncul di dashboard",
    a: [
      "Pastikan Anda mengunggah media melalui bot Telegram dengan caption /qr, bukan langsung dari galeri.",
      "Cek apakah media sudah melewati masa simpan 30 hari. Media yang expired akan dihapus otomatis.",
      "Lakukan refresh halaman (tarik ke bawah atau tekan tombol reload browser).",
      "Jika media lama diunggah sebelum pembaruan akun, media tersebut tidak akan muncul di dashboard. Silakan unggah ulang.",
    ],
  },
  {
    q: "Upload foto atau video gagal",
    a: [
      "Ukuran file maksimum adalah 5 MB. Kompres atau perkecil terlebih dahulu sebelum mengunggah.",
      "Pastikan koneksi internet stabil saat mengirim media ke bot.",
      "Beberapa format video tidak didukung. Gunakan format MP4 untuk hasil terbaik.",
      "Jika masalah berlanjut, tunggu beberapa saat lalu coba lagi — server Telegram mungkin sedang sibuk.",
    ],
  },
  {
    q: "Download stuck di verifikasi reCAPTCHA",
    a: [
      "Selesaikan verifikasi reCAPTCHA terlebih dahulu, baru proses download akan berjalan.",
      "Jika verifikasi expired, tekan tombol Download sekali lagi untuk mendapatkan tantangan baru.",
      "Nonaktifkan pemblokir iklan atau ekstensi yang mungkin menghalangi reCAPTCHA.",
      "Jika tetap gagal, coba browser lain atau mode incognito.",
    ],
  },
  {
    q: "Video tidak dapat diputar",
    a: [
      "Kodek video mungkin tidak didukung oleh browser. Coba putar menggunakan browser Chrome, Safari, atau Edge versi terbaru.",
      "Coba lakukan hard refresh (Ctrl + Shift + R di desktop, atau bersihkan cache di mobile).",
      "Jika video tetap tidak dapat diputar, kemungkinan file rusak. Silakan unggah ulang dari bot.",
    ],
  },
  {
    q: "Link QR tidak bisa dibuka",
    a: [
      "Pastikan Anda membuka link melalui browser modern dengan koneksi internet aktif.",
      "Cek kembali apakah tautan yang diketik sudah sesuai dengan yang ada di barcode.",
      "Jika media sudah expired, link akan menampilkan halaman kosong. Unggah ulang media melalui bot untuk mendapatkan link baru.",
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
        Jika Anda mengalami kendala saat menggunakan CheyaVerse, silakan periksa
        panduan berikut. Sebagian besar masalah dapat diselesaikan dengan
        beberapa langkah sederhana.
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
              <summary className="flex items-center justify-between gap-3 px-4 py-[15px] min-h-[56px] cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden transition-colors hover:bg-[#fafafa]">
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
            Jika Anda menemukan bug, kendala teknis yang tidak dapat
            diselesaikan melalui panduan di atas, atau perilaku tidak wajar
            pada aplikasi, silakan laporkan melalui email. Sertakan deskripsi
            masalah, langkah reproduksi, dan tangkapan layar bila memungkinkan.
          </p>
          <a
            href="mailto:userlinuxorg@gmail.com?subject=Laporan%20Bug%20CheyaVerse"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-ink text-white text-[13px] font-medium transition-all active:scale-[.97] hover:bg-accent-hover"
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