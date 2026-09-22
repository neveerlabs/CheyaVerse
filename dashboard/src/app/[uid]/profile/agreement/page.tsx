import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Penerimaan Syarat",
    body: "Dengan mengakses dan menggunakan layanan CheyaVerse, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh syarat dan ketentuan yang tercantum dalam dokumen ini. Jika Anda tidak menyetujui salah satu ketentuan, mohon untuk tidak menggunakan layanan.",
  },
  {
    title: "Deskripsi Layanan",
    body: "CheyaVerse adalah layanan bot Telegram yang memungkinkan pengguna untuk mengunggah, menyimpan, dan mengakses media melalui QR code dan dashboard personal. Layanan ini disediakan sebagaimana adanya tanpa jaminan ketersediaan tanpa gangguan.",
  },
  {
    title: "Akun Pengguna",
    body: "Akun Anda terhubung langsung dengan ID Telegram Anda. Anda bertanggung jawab menjaga keamanan akun Telegram Anda. Segala aktivitas yang dilakukan melalui akun Anda dianggap sebagai tanggung jawab Anda.",
  },
  {
    title: "Penggunaan yang Diizinkan",
    body: "CheyaVerse hanya boleh digunakan untuk keperluan pribadi dan sah. Anda dilarang menggunakan layanan ini untuk menyimpan atau menyebarkan konten ilegal, konten yang melanggar hak kekayaan intelektual, konten SARA, maupun konten yang dapat merugikan pihak lain.",
  },
  {
    title: "Batas Ukuran dan Format",
    body: "Ukuran maksimum file yang dapat diunggah adalah 5 MB per file. Layanan ini menerima format gambar dan video dengan kodek yang didukung browser modern. Kami berhak menolak file yang melebihi batas ukuran atau bertipe tidak didukung.",
  },
  {
    title: "Masa Simpan Media",
    body: "Media disimpan selama 30 hari sejak tanggal unggahan. Setelah periode tersebut, file akan dihapus secara otomatis dan tidak dapat dipulihkan. Anda bertanggung jawab untuk mengunduh atau mencadangkan media penting sebelum masa simpan berakhir.",
  },
  {
    title: "Konten Pengguna",
    body: "Anda bertanggung jawab sepenuhnya atas seluruh konten yang Anda unggah. Anda menyatakan bahwa Anda memiliki hak yang sah atas konten tersebut dan tidak melanggar hak pihak ketiga mana pun.",
  },
  {
    title: "Batasan Tanggung Jawab",
    body: "CheyaVerse disediakan tanpa jaminan apa pun. Pengembang tidak bertanggung jawab atas kehilangan data, gangguan layanan, atau kerugian tidak langsung yang timbul dari penggunaan layanan ini.",
  },
  {
    title: "Penghentian Layanan",
    body: "Kami berhak menghentikan atau membatasi akses Anda ke layanan jika ditemukan pelanggaran terhadap syarat dan ketentuan ini, tanpa pemberitahuan terlebih dahulu.",
  },
  {
    title: "Perubahan Syarat",
    body: "Pengembang dapat memperbarui syarat dan ketentuan ini kapan saja. Versi terbaru akan selalu tersedia di halaman ini. Penggunaan layanan secara berkelanjutan menandakan persetujuan Anda terhadap perubahan yang berlaku.",
  },
  {
    title: "Hukum yang Berlaku",
    body: "Syarat dan ketentuan ini diatur oleh dan ditafsirkan sesuai dengan hukum yang berlaku di Republik Indonesia.",
  },
];

export default function AgreementPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  return (
    <>
      <SubPageHeader
        title="Perjanjian Pengguna"
        subtitle="Terakhir diperbarui: 22 September 2026"
        backHref={`/${params.uid}/profile`}
      />

      <article className="animate-fade-up">
        <p className="text-[13.5px] text-ink-soft leading-[1.75] mb-7">
          Dokumen ini merupakan perjanjian yang mengikat secara hukum antara
          Anda sebagai pengguna dengan pengembang layanan CheyaVerse. Harap
          dibaca dengan saksama sebelum menggunakan layanan.
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
            Dengan menggunakan CheyaVerse, Anda menyatakan telah membaca,
            memahami, dan menyetujui seluruh isi Perjanjian Pengguna ini.
          </p>
        </div>
      </article>
    </>
  );
}