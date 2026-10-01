import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Ruang lingkup layanan",
    body: "CheyaVerse menyediakan bot Telegram dan dashboard personal untuk mengelola media, percakapan, sesi perangkat, serta repositori GitHub yang dipilih pengguna. Ketersediaan fitur dapat berbeda sesuai perangkat, koneksi, dan layanan pihak ketiga yang digunakan.",
  },
  {
    title: "Akun dan keamanan",
    body: "Akun web terhubung dengan identitas Telegram. Pengguna bertanggung jawab menjaga keamanan akun Telegram dan mengelola sesi perangkat yang masih aktif. Nama tampilan yang diubah di Settings hanya berlaku di CheyaVerse dan tidak mengubah profil Telegram.",
  },
  {
    title: "Penggunaan yang diperbolehkan",
    body: "Gunakan layanan sesuai hukum dan hak pihak lain. Pengguna bertanggung jawab atas media dan pesan yang diunggah atau dikirim, termasuk memastikan bahwa pengguna memiliki hak untuk menggunakan konten tersebut. Jangan gunakan layanan untuk menyebarkan konten ilegal, mengganggu pengguna lain, atau mencoba mengakses akun maupun data tanpa izin.",
  },
  {
    title: "Batas media",
    body: "Batas unggahan mengikuti fitur yang digunakan dan ditampilkan saat proses unggah. Saat ini bot QR menerima media hingga 15 MiB per file, sedangkan item media Library dibatasi hingga 4 MiB. Format yang dapat diputar atau ditampilkan juga bergantung pada dukungan browser.",
  },
  {
    title: "Masa berlaku media",
    body: "Setiap media memiliki tanggal kedaluwarsa yang ditampilkan pada layanan. Media akan dihapus otomatis setelah masa berlakunya berakhir dan mungkin tidak dapat dipulihkan. Simpan salinan sendiri jika file masih diperlukan.",
  },
  {
    title: "Koneksi GitHub",
    body: "Jika menghubungkan GitHub, pengguna memberi CheyaVerse izin untuk meminta data repositori sesuai cakupan token yang diberikan. Pilih izin minimum yang diperlukan dan putuskan koneksi atau cabut token dari GitHub saat tidak lagi digunakan.",
  },
  {
    title: "Penghapusan dan ketersediaan",
    body: "Pengguna dapat menghapus data akun web melalui Settings. Penghapusan akun web tidak menghapus data yang tersimpan di Telegram atau GitHub. Layanan dapat mengalami gangguan atau perubahan fitur; CheyaVerse tidak menjanjikan layanan selalu tersedia tanpa jeda.",
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
        title="User Agreement"
        subtitle="Last updated: 2026-01-October"
        backHref={`/${params.uid}/profile`}
        cornerLabel="USER AGREEMENT"
      />

      <article className="animate-fade-up">
        <p className="text-[13.5px] text-ink-soft leading-[1.75] mb-7">
          Ketentuan berikut menjelaskan penggunaan fitur CheyaVerse dan
          tanggung jawab pengguna. Hubungi dukungan jika ada bagian yang perlu
          diklarifikasi.
        </p>

        <div className="flex flex-col gap-6">
          {SECTIONS.map((s, i) => (
            <section key={s.title}>
              <h2 className="text-[14.5px] font-semibold text-ink mb-2 tracking-[-.005em]">
                {i + 1}. {s.title}
              </h2>
              <p className="text-[13.5px] text-ink-soft leading-[1.75]">
                {s.body}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-9 pt-5 border-t border-divider">
          <p className="text-[11.5px] text-ink-mute leading-relaxed">
            Ketentuan ini dapat diperbarui jika fitur atau cara kerja layanan
            berubah. Versi terbaru tersedia di halaman ini.
          </p>
        </div>
      </article>
    </>
  );
}