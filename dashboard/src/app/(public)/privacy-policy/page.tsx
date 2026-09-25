import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Pendahuluan",
    body: "Dokumen ini menjelaskan bagaimana CheyaVerse mengumpulkan, menggunakan, dan melindungi data pengguna. Dengan menggunakan layanan, pengguna menyetujui praktik yang dijelaskan dalam dokumen ini.",
  },
  {
    title: "Informasi yang Dikumpulkan",
    body: "Sistem hanya menyimpan metadata dari file yang diunggah melalui bot Telegram. Metadata mencakup: ID media, nama file, ukuran file, tipe konten, tanggal kadaluarsa, dan ID Telegram pengguna. File fisik media disimpan sepenuhnya di Telegram Storage Chat dan tidak disalin ke server aplikasi.",
  },
  {
    title: "Penggunaan Informasi",
    body: "Metadata digunakan secara eksklusif untuk: (1) menampilkan kembali file pengguna di dashboard personal, (2) memfasilitasi pencarian dan penghapusan media, (3) menghapus media yang sudah kadaluarsa secara otomatis.",
  },
  {
    title: "Berbagi Data",
    body: "Sistem tidak menjual, menyewakan, atau membagikan data pengguna kepada pihak ketiga. Media hanya dapat diakses oleh pemiliknya melalui URL unik yang diberikan bot. Pengguna lain tidak dapat melihat atau mengakses daftar media milik pengguna lain.",
  },
  {
    title: "Keamanan",
    body: "Setiap dashboard tertaut langsung dengan ID Telegram pengguna. Akses dashboard hanya dimungkinkan melalui URL unik yang diberikan bot melalui perintah /web. Sistem tidak menyimpan kata sandi atau kredensial tambahan.",
  },
  {
    title: "Masa Simpan Data",
    body: "Media disimpan selama 30 hari sejak tanggal unggahan. Setelah periode tersebut, file dihapus otomatis dari Telegram Storage Chat dan tidak dapat dipulihkan. Pengguna juga dapat menghapus media kapan saja secara manual melalui dashboard.",
  },
  {
    title: "Hak Pengguna",
    body: "Pengguna berhak menghapus seluruh media yang diunggah kapan saja. Penghapusan melalui dashboard akan menghapus metadata dari database dan file fisik dari Telegram Storage Chat secara permanen.",
  },
  {
    title: "Perubahan Kebijakan",
    body: "Kebijakan Privasi dapat diperbarui dari waktu ke waktu. Perubahan signifikan akan diinformasikan melalui bot. Penggunaan layanan setelah pembaruan menandakan persetujuan pengguna terhadap kebijakan yang telah diperbarui.",
  },
  {
    title: "Kontak",
    body: "Pertanyaan terkait privasi data dapat dikirim melalui email ke userlinuxorg@gmail.com. Respons diberikan dalam waktu 3-5 hari kerja.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <AppHeader
        title="Kebijakan Privasi"
        subtitle="Terakhir diperbarui: 22 September 2026"
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