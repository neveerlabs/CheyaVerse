import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Penerimaan Syarat",
    body: "Dengan mengakses dan menggunakan layanan CheyaVerse, pengguna menyatakan telah membaca, memahami, dan menyetujui seluruh syarat dan ketentuan dalam dokumen ini. Jika tidak menyetujui salah satu ketentuan, pengguna dilarang menggunakan layanan.",
  },
  {
    title: "Deskripsi Layanan",
    body: "CheyaVerse adalah layanan bot Telegram yang memungkinkan pengguna mengunggah, menyimpan, dan mengakses media melalui QR code dan dashboard personal. Layanan disediakan sebagaimana adanya (as is) tanpa jaminan ketersediaan tanpa gangguan.",
  },
  {
    title: "Akun Pengguna",
    body: "Akun tertaut langsung dengan ID Telegram pengguna. Pengguna bertanggung jawab menjaga keamanan akun Telegram. Segala aktivitas yang dilakukan melalui akun dianggap sebagai tanggung jawab pengguna.",
  },
  {
    title: "Penggunaan yang Diizinkan",
    body: "Layanan hanya boleh digunakan untuk keperluan pribadi dan sah. Pengguna dilarang menyimpan atau menyebarkan konten ilegal, melanggar hak kekayaan intelektual, bermuatan SARA, maupun konten yang dapat merugikan pihak lain.",
  },
  {
    title: "Batas Ukuran dan Format",
    body: "Ukuran maksimum file adalah 15 MB per file. Layanan menerima format gambar dan video dengan kodek yang didukung browser modern. Sistem berhak menolak file yang melebihi batas ukuran atau bertipe tidak didukung.",
  },
  {
    title: "Masa Expired Media",
    body: "Media disimpan selama 30 hari sejak tanggal unggahan. Setelah periode tersebut, file dihapus otomatis dan tidak dapat dipulihkan. Pengguna bertanggung jawab mengunduh atau mencadangkan media penting sebelum masa simpan berakhir.",
  },
  {
    title: "Konten Pengguna",
    body: "Pengguna bertanggung jawab penuh atas seluruh konten yang diunggah. Pengguna menyatakan memiliki hak yang sah atas konten tersebut dan tidak melanggar hak pihak ketiga.",
  },
  {
    title: "Batasan Tanggung Jawab",
    body: "CheyaVerse disediakan tanpa jaminan apa pun. Pengembang tidak bertanggung jawab atas kehilangan data, gangguan layanan, atau kerugian tidak langsung yang timbul dari penggunaan layanan ini.",
  },
  {
    title: "Penghentian Layanan",
    body: "Sistem berhak menghentikan atau membatasi akses pengguna ke layanan jika ditemukan pelanggaran terhadap syarat dan ketentuan ini, tanpa pemberitahuan terlebih dahulu.",
  },
  {
    title: "Perubahan Syarat",
    body: "Pengembang dapat memperbarui syarat dan ketentuan ini kapan saja. Versi terbaru selalu tersedia di halaman ini. Penggunaan layanan secara berkelanjutan menandakan persetujuan pengguna terhadap perubahan yang berlaku.",
  },
  {
    title: "Hukum yang Berlaku",
    body: "Syarat dan ketentuan ini diatur oleh dan ditafsirkan sesuai dengan hukum yang berlaku di Republik Indonesia.",
  },
];

export default function AgreementPage() {
  return (
    <>
      <AppHeader
        title="Perjanjian Pengguna"
        subtitle="Terakhir diperbarui: 22 September 2026"
      />

      <article className="animate-fade-up">
        <p className="text-[13.5px] text-ink-soft leading-[1.75] mb-7">
          Dokumen ini merupakan perjanjian yang mengikat secara hukum antara
          pengguna dengan pengembang layanan CheyaVerse. Baca dengan saksama
          sebelum menggunakan layanan.
        </p>

        <div className="flex flex-col gap-6">
          {SECTIONS.map((s, i) => (
            <section key={s.title}>
              <h2 className="text-[14.5px] font-semibold text-ink mb-2 tracking-[-.005em]">
                Pasal {i + 1} — {s.title}
              </h2>
              <p className="text-[13.5px] text-ink-soft leading-[1.75]">
                {s.body}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-9 pt-5 border-t border-divider">
          <p className="text-[11.5px] text-ink-mute leading-relaxed">
            Dengan menggunakan CheyaVerse, pengguna menyatakan telah membaca,
            memahami, dan menyetujui seluruh isi Perjanjian Pengguna ini.
          </p>
        </div>
      </article>
    </>
  );
}
