import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Data yang diproses",
    body: "CheyaVerse memproses identitas Telegram untuk menghubungkan akun, nama tampilan pilihan pengguna, media dan pesan yang disimpan atau dikirim melalui fitur layanan, serta informasi sesi dan perangkat untuk menjaga akses akun. Jika GitHub dihubungkan, CheyaVerse juga menyimpan nama akun dan token akses GitHub dalam bentuk terenkripsi.",
  },
  {
    title: "Cara data digunakan",
    body: "Data digunakan untuk menyediakan dashboard, media, percakapan, notifikasi, keamanan sesi, dan fitur Projects. Informasi repositori, branch, commit, deployment, serta statistik GitHub diminta saat fitur tersebut digunakan; data ini disajikan dari GitHub dan bukan arsip riwayat terpisah di CheyaVerse.",
  },
  {
    title: "Layanan pihak ketiga",
    body: "CheyaVerse tidak menjual data pengguna. Telegram digunakan untuk autentikasi dan fitur bot/media; GitHub memproses permintaan ketika akun GitHub dihubungkan; layanan verifikasi dapat digunakan pada halaman media. Browser dan penyedia push yang dipakai browser dapat memproses data yang diperlukan untuk mengirim notifikasi.",
  },
  {
    title: "Keamanan akun",
    body: "Akun web terhubung dengan ID Telegram. Token GitHub dienkripsi sebelum disimpan dan tidak dikirim kembali ke browser setelah tersimpan. Pengguna dapat memutus koneksi GitHub, mengelola sesi perangkat, atau keluar dari akun melalui Settings. Gunakan token GitHub dengan izin minimum yang diperlukan.",
  },
  {
    title: "Masa penyimpanan",
    body: "Media disimpan sampai tanggal kedaluwarsa yang ditampilkan pada layanan, lalu dihapus otomatis. Token GitHub disimpan sampai koneksinya diputus atau akun web dihapus. Data akun dan percakapan disimpan selama diperlukan untuk menyediakan fitur terkait; pengguna dapat menghapus akun web melalui Settings.",
  },
  {
    title: "Pilihan dan penghapusan",
    body: "Pengguna dapat mengganti nama tampilan CheyaVerse tanpa mengubah profil Telegram, menghapus media yang dikelola melalui layanan, memutus koneksi GitHub, mencabut sesi perangkat, atau menghapus akun web. Penghapusan akun web tidak menghapus informasi yang masih berada di Telegram atau GitHub.",
  },
  {
    title: "Pertanyaan privasi",
    body: "Untuk pertanyaan atau permintaan terkait data, hubungi userlinuxorg@gmail.com. Sertakan informasi yang cukup untuk memahami permintaan dan jangan mengirimkan kata sandi atau token akses.",
  },
];

export default function PrivacyPage({
  params,
}: {
  params: { uid: string };
}) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  return (
    <>
      <SubPageHeader
        title="Privacy Policy"
        subtitle="Last updated: 2026-01-October"
        backHref={`/${params.uid}/profile`}
        cornerLabel="PRIVACY POLICY"
      />

      <article className="animate-fade-up">
        <p className="text-[13.5px] text-ink-soft leading-[1.75] mb-7">
          Halaman ini menjelaskan data yang diproses CheyaVerse, alasan
          pemrosesannya, serta pilihan yang tersedia bagi pengguna.
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
            Kebijakan ini dapat diperbarui ketika fitur atau cara pemrosesan
            data berubah. Versi yang berlaku selalu tersedia di halaman ini.
          </p>
        </div>
      </article>
    </>
  );
}