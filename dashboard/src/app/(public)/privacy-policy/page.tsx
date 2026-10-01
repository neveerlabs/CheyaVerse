import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Introduction",
    body: "Dokumen ini menjelaskan bagaimana CheyaVerse mengumpulkan, menggunakan, dan melindungi data pengguna. Dengan menggunakan layanan, pengguna menyetujui praktik yang dijelaskan dalam dokumen ini.",
  },
  {
    title: "Information We Collect",
    body: "CheyaVerse menyimpan metadata media Telegram (ID media, nama file, ukuran, tipe konten, masa berlaku, dan ID Telegram). Jika pengguna menghubungkan GitHub, sistem juga menyimpan nama akun GitHub, informasi izin token yang tersedia, dan Personal Access Token dalam bentuk terenkripsi. Data repositori, struktur file, commit, deployment, dan statistik trafik diminta dari GitHub saat fitur Projects digunakan; riwayat GitHub tersebut tidak disalin sebagai arsip terpisah ke database CheyaVerse.",
  },
  {
    title: "How We Use Information",
    body: "Data digunakan untuk menampilkan media di dashboard, mengelola masa berlaku media, serta—jika akun GitHub dihubungkan—membaca repositori, branch, bahasa, commit beserta perubahan file/baris, GitHub Actions, deployment, dan analitik trafik agregat.",
  },
  {
    title: "Data Sharing",
    body: "CheyaVerse tidak menjual data pengguna. Untuk fitur GitHub, server mengirim permintaan API terautentikasi ke GitHub menggunakan token yang diberikan pengguna; GitHub memproses permintaan sesuai kebijakan privasinya. Token dan data akun GitHub tidak ditampilkan kepada pengguna CheyaVerse lain. Media Telegram tetap dapat diakses melalui URL media milik pengguna.",
  },
  {
    title: "Security",
    body: "Dashboard menggunakan sesi yang tertaut ke ID Telegram. Token GitHub dienkripsi di sisi server menggunakan AES-256-GCM sebelum disimpan di Turso dan tidak pernah dikirim kembali ke browser setelah disimpan. Pengguna dianjurkan memakai token read-only dengan akses repositori seminimal mungkin dan dapat mencabut atau menggantinya kapan saja.",
  },
  {
    title: "Data Retention",
    body: "Media disimpan sesuai masa berlaku yang ditampilkan pada dashboard dan dihapus otomatis dari Telegram Storage setelah kedaluwarsa. Token GitHub tetap tersimpan terenkripsi sampai pengguna memilih Disconnect atau menghapus akun web. Statistik trafik GitHub hanya tersedia dalam rentang terbaru yang disediakan GitHub (maksimal 14 hari) dan tidak mengidentifikasi pengunjung.",
  },
  {
    title: "User Rights",
    body: "Pengguna dapat menghapus media melalui dashboard, memutuskan koneksi GitHub untuk menghapus token dari database CheyaVerse, atau menghapus akun web untuk menghapus data akun. Pengguna juga dapat mencabut token langsung dari pengaturan keamanan GitHub. Penghapusan akun tidak menghapus data yang berada di layanan GitHub atau Telegram.",
  },
  {
    title: "Policy Changes",
    body: "Kebijakan Privasi dapat diperbarui dari waktu ke waktu. Perubahan signifikan akan diinformasikan melalui bot. Penggunaan layanan setelah pembaruan menandakan persetujuan pengguna terhadap kebijakan yang telah diperbarui.",
  },
  {
    title: "Contact",
    body: "Pertanyaan terkait privasi data dapat dikirim melalui email ke userlinuxorg@gmail.com. Respons diberikan dalam waktu 3-5 hari kerja.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <AppHeader
        title="Privacy Policy"
        subtitle="Pembaruan terakhir: 1 Oktober 2026"
        cornerLabel="PRIVACY POLICY"
      />

      <article className="animate-fade-up">
        <p className="text-[13.5px] text-ink-soft leading-[1.75] mb-7">
          CheyaVerse berkomitmen menjaga kerahasiaan data pengguna. Dokumen
          ini menjelaskan secara transparan data apa yang diproses dan
          bagaimana data tersebut dilindungi.
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
            Dokumen ini berlaku efektif sejak tanggal 22 September 2026.
            Penggunaan layanan CheyaVerse menandakan pengguna telah membaca dan
            menyetujui seluruh isi Kebijakan Privasi ini.
          </p>
        </div>
      </article>
    </>
  );
}