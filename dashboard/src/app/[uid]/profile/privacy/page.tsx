import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Data yang diproses",
    body: "CheyaVerse memproses ID Telegram serta nama dan username yang tersedia untuk menghubungkan akun; nama tampilan pilihan pengguna; pesan, status pengiriman/baca, dan metadata media yang dikirim atau disimpan melalui layanan; serta pengenal sesi dan informasi perangkat/browser yang diperlukan untuk keamanan dan fungsi dashboard. Jika GitHub dihubungkan, nama akun, scopes yang dilaporkan GitHub, waktu koneksi, dan token akses disimpan; token dienkripsi pada server.",
  },
  {
    title: "Cara data digunakan",
    body: "Data digunakan untuk menyediakan dashboard, media, percakapan, notifikasi, keamanan sesi, dan fitur Projects. Data repositori, branch, commit, release, deployment, Actions, dan statistik diminta dari GitHub saat halaman atau fitur yang memerlukannya digunakan. Home menampilkan repo neveerlabs/CheyaVerse di kartu unggulan dan daftar repositori populer dari akun GitHub yang tersambung di grid berikutnya. Nilai repository tersebut bersumber dari GitHub dan bukan arsip lengkap aktivitas terpisah di CheyaVerse. AI tidak merekam rangkaian tindakan pengguna dan tidak dapat memblokir atau mencabut sesi; keputusan tersebut tetap dilakukan admin.",
  },
  {
    title: "Layanan pihak ketiga",
    body: "CheyaVerse tidak menjual data pengguna. Telegram digunakan untuk autentikasi dan fitur bot/media; GitHub menerima permintaan data yang diminta pengguna melalui dashboard. Saat AI chat digunakan, teks permintaan dan instruksi sistem dikirim ke provider AI akun. Server juga mengambil hingga 500 pesan non-terhapus terbaru untuk pencarian konteks, tetapi hanya meneruskan maksimal 10 pesan terbaru dan 8 pesan lama yang relevan, dalam batas 14.000 karakter. Detail akun/role dan hingga 25 DeviceID dengan data browser, perangkat, layar, serta WebGL hanya ditambahkan saat pertanyaan memang terkait akun atau perangkat; fingerprint mentah dan string user-agent mentah tidak dikirim. Untuk pertanyaan tentang lokasi pengguna saat ini, alamat IP publik permintaan dikirim ke layanan geolokasi IP (ipapi.co/ipwho.is) dan perkiraan kota/wilayah/negara/kode pos dapat diteruskan ke provider AI. Lokasi IP bukan GPS dan tidak dapat diandalkan untuk menentukan kecamatan. Alamat IP mentah hanya disertakan dalam prompt AI bila pengguna secara khusus menanyakan IP-nya. Untuk pertanyaan repo/kode, server menggunakan token GitHub terenkripsi dan mengambil satu repo milik akun, memilih repo yang disebutkan atau repo milik akun yang paling baru didorong. Jika tree repo lengkap dan maksimal 400 file teks/source masing-masing paling besar 1 MiB dengan total 8 MiB, semua file yang memenuhi filter dibaca untuk satu permintaan lalu cuplikan relevan (maksimal 14 file/55.000 karakter; file yang disebut langsung maksimal 30.000 karakter) dikirim ke AI; repo yang lebih besar atau tree terpotong dibatasi hingga 80 file kandidat. Pola kredensial umum disamarkan, tetapi pengguna tetap sebaiknya meninjau source sebelum menghubungkan repo. CheyaVerse tidak menyimpan snapshot repo dari fitur ini. Token GitHub dan kunci API AI tidak dimasukkan ke prompt; gambar dan file media chat juga tidak disertakan. Layanan verifikasi serta browser/penyedia push dapat memproses data yang dibutuhkan fitur terkait.",
  },
  {
    title: "Keamanan akun",
    body: "Akun web terhubung dengan ID Telegram. Token GitHub dienkripsi sebelum disimpan di server dan tidak dikirim kembali ke browser setelah tersimpan. Token digunakan server untuk permintaan GitHub atas nama akun yang terhubung dan tidak diteruskan sebagai teks prompt kepada penyedia AI. Pengguna dapat memutus koneksi GitHub atau mengelola sesi melalui Settings; pemutusan koneksi di CheyaVerse tidak mencabut token di GitHub. Buat token dengan izin minimum yang diperlukan dan cabut dari GitHub bila tidak lagi digunakan.",
  },
  {
    title: "Masa penyimpanan",
    body: "Media dikelola sesuai tanggal kedaluwarsa yang ditampilkan pada layanan dan dihapus otomatis setelah masa berlakunya berakhir. Token GitHub disimpan sampai koneksinya diputus atau akun web dihapus. Data akun dan percakapan disimpan selama diperlukan untuk menyediakan fitur terkait; pengguna dapat menghapus akun web melalui Settings. Salinan yang sudah dikirim ke Telegram, GitHub, atau penyedia AI mengikuti kebijakan penyedia masing-masing.",
  },
  {
    title: "Pilihan dan penghapusan",
    body: "Pengguna dapat mengganti nama tampilan CheyaVerse tanpa mengubah profil Telegram, memilih untuk tidak meminta Cheya mengambil konteks akun/perangkat/lokasi/repo, menghapus media yang dikelola melalui layanan, memutus koneksi GitHub, mencabut sesi perangkat, atau menghapus akun web. Konteks AI diambil hanya saat relevan dengan pertanyaan dan tidak disimpan sebagai profil baru; salinan yang telah dikirim ke Telegram, GitHub, layanan geolokasi, atau penyedia AI mengikuti kebijakan penyedia terkait.",
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
        subtitle="Last updated: October 6, 2026"
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
