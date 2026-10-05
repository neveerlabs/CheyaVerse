import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";
import { ChevronDown, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

const FAQS: { q: string; a: string[] }[] = [
  {
    q: "Media is not showing in the dashboard",
    a: [
      "Pastikan Anda masuk menggunakan akun Telegram yang sama dengan akun saat media dikirim melalui bot.",
      "Unggahan melalui bot akan muncul di Media setelah prosesnya selesai. Unggahan langsung dari halaman dashboard bukan jalur unggah bot.",
      "Periksa tanggal kedaluwarsa yang ditampilkan. Media yang sudah kedaluwarsa tidak lagi tersedia.",
      "Jika daftar belum berubah, buka tab Media kembali setelah koneksi pulih. Aplikasi akan meminta data terbaru saat navigasi atau tersambung kembali.",
    ],
  },
  {
    q: "An upload did not complete",
    a: [
      "Batas unggahan berbeda menurut fitur: media melalui bot QR hingga 15 MiB per file dan item Library hingga 4 MiB.",
      "Periksa ukuran file dan koneksi internet, lalu coba unggah kembali setelah proses sebelumnya selesai.",
      "Pratinjau dan pemutaran video bergantung pada format yang didukung browser. MP4 dengan H.264 umumnya memiliki dukungan luas.",
    ],
  },
  {
    q: "Media verification or download is not working",
    a: [
      "Selesaikan verifikasi pada halaman media sebelum melanjutkan.",
      "Jika verifikasi kedaluwarsa, mulai kembali proses dari halaman media.",
      "Periksa apakah pengaturan privasi atau ekstensi browser memblokir konten verifikasi. Anda juga dapat mencoba browser lain.",
    ],
  },
  {
    q: "Messages or notifications appear out of date",
    a: [
      "Pastikan koneksi internet aktif. CheyaVerse memperbarui data melalui koneksi langsung dan mencoba menyambung kembali jika koneksi terputus.",
      "Buka tab terkait kembali atau pindah halaman lalu kembali untuk meminta data terbaru tanpa memuat ulang seluruh browser.",
      "Jika masalah hanya terjadi pada satu perangkat, periksa sesi perangkat di Settings.",
    ],
  },
  {
    q: "A GitHub repository is missing",
    a: [
      "Buka Settings → GitHub dan pastikan akun terhubung.",
      "Token harus masih aktif dan memiliki izin untuk membaca repositori yang ingin ditampilkan. Ganti token atau hubungkan ulang jika aksesnya berubah.",
      "Repositori dan riwayatnya diminta dari GitHub saat halaman Projects dibuka; pastikan GitHub dapat diakses.",
    ],
  },
  {
    q: "Home shows a different repository than my popular repositories",
    a: [
      "Kartu unggulan Home selalu menampilkan data neveerlabs/CheyaVerse. Grid di bawahnya tetap menampilkan repositori populer dari akun GitHub yang tersambung.",
      "Jika grid kosong atau data akun sendiri belum tampil, buka Settings → GitHub dan pastikan akun serta token yang tersambung benar dan masih punya akses.",
      "Data repository diminta dari GitHub saat halaman dimuat. Gangguan GitHub, batas API, izin organisasi, atau token yang perlu disambungkan ulang dapat membuat sebagian data tidak tersedia.",
    ],
  },
  {
    q: "AI tidak menemukan repository atau file yang saya maksud",
    a: [
      "Untuk pertanyaan repositori, AI memakai koneksi GitHub milik akun yang sedang masuk. Hubungkan GitHub di Settings dan pastikan token dapat membaca repo tersebut.",
      "Sebutkan nama repository atau owner/repository. AI mengutamakan repository milik akun yang tersambung dan hanya memuat satu repository untuk satu permintaan.",
      "Untuk pertanyaan kode, sebutkan path file yang tepat. Isi seluruh repository tidak dimuat sekaligus; README, struktur terbatas, dan file yang diminta dipilih sesuai pertanyaan.",
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
        title="Help Center"
        subtitle="Last updated: October 5, 2026"
        backHref={`/${params.uid}/profile`}
      />

      <p className="text-[13.5px] text-ink-soft leading-[1.75] px-1 mb-6 animate-fade-up">
        Panduan berikut membahas fitur utama dan langkah awal untuk
        menyelesaikan kendala yang umum terjadi.
      </p>

      <section className="mb-6 animate-fade-up">
        <h2 className="text-[11.5px] font-semibold tracking-[.08em] uppercase text-ink-mute px-3 mb-2">
          Common questions
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
          Technical support
        </h2>
        <div className="rounded-2xl bg-white border border-line p-5">
          <p className="text-[13px] text-ink-soft leading-[1.7] mb-4">
            Untuk bantuan teknis yang belum tercakup di atas, kirim email
            dengan deskripsi masalah, langkah untuk mengulanginya, perangkat
            dan browser yang digunakan, serta tangkapan layar bila relevan.
            Jangan sertakan kata sandi, token, atau informasi pribadi yang
            tidak diperlukan.
          </p>
          <a
            href="mailto:userlinuxorg@gmail.com?subject=CheyaVerse%20Technical%20Support"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-ink text-white text-[13px] font-medium transition-all active:scale-[.97] sm:hover:bg-accent-hover"
          >
            <Mail size={15} strokeWidth={2.2} />
            Contact technical support
          </a>
        </div>
      </section>
    </>
  );
}
