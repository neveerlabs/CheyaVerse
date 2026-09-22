import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Pendahuluan",
    body: "Kebijakan Privasi ini menjelaskan bagaimana CheyaVerse mengumpulkan, menggunakan, dan melindungi informasi Anda ketika menggunakan layanan kami. Dengan menggunakan CheyaVerse, Anda menyetujui praktik yang dijelaskan dalam dokumen ini.",
  },
  {
    title: "Informasi yang Kami Kumpulkan",
    body: "Kami hanya menyimpan metadata dari file yang Anda unggah melalui bot, meliputi: ID media, nama file, ukuran file, tipe konten, tanggal kadaluarsa, dan ID Telegram Anda. File fisik media disimpan sepenuhnya di dalam Telegram Storage Chat dan tidak pernah disalin ke server kami.",
  },
  {
    title: "Penggunaan Informasi",
    body: "Metadata yang kami simpan digunakan secara eksklusif untuk menampilkan kembali file Anda di dashboard personal, memfasilitasi fitur pencarian dan penghapusan, serta memastikan media yang sudah kadaluarsa dapat dihapus secara otomatis.",
  },
  {
    title: "Berbagi Data",
    body: "Kami tidak menjual, menyewakan, atau membagikan data Anda kepada pihak ketiga mana pun. Media Anda hanya dapat diakses oleh Anda sendiri melalui URL unik yang diberikan bot. Pengguna lain tidak dapat melihat, mencari, atau mengakses daftar media Anda.",
  },
  {
    title: "Keamanan",
    body: "Setiap dashboard terhubung langsung dengan ID Telegram Anda. Akses ke dashboard hanya dimungkinkan melalui URL unik yang diberikan bot melalui perintah /web. Kami tidak menyimpan kata sandi atau kredensial tambahan apa pun.",
  },
  {
    title: "Masa Simpan Data",
    body: "Media Anda disimpan selama 30 hari sejak tanggal unggahan. Setelah periode tersebut, file akan dihapus secara otomatis dari Telegram Storage Chat dan tidak dapat dipulihkan. Anda juga dapat menghapus media kapan saja secara manual melalui dashboard.",
  },
  {
    title: "Hak Anda",
    body: "Anda berhak untuk menghapus seluruh media yang Anda unggah kapan saja. Penghapusan melalui dashboard akan menghapus metadata dari database kami dan file fisik dari Telegram Storage Chat secara permanen.",
  },
  {
    title: "Perubahan Kebijakan",
    body: "Kebijakan Privasi ini dapat diperbarui dari waktu ke waktu. Perubahan signifikan akan diinformasikan melalui bot. Penggunaan layanan setelah pembaruan menandakan bahwa Anda menyetujui kebijakan yang telah diperbarui.",
  },
  {
    title: "Hubungi Kami",
    body: "Untuk pertanyaan terkait privasi data, silakan kirim email ke userlinuxorg@gmail.com. Kami akan merespons dalam waktu 3-5 hari kerja.",
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
        title="Kebijakan Privasi"
        subtitle="Terakhir diperbarui: 22 September 2026"
        backHref={`/${params.uid}/profile`}
      />

      <article className="animate-fade-up">
        <p className="text-[13.5px] text-ink-soft leading-[1.75] mb-7">
          CheyaVerse berkomitmen menjaga kerahasiaan data penggunanya. Dokumen
          ini menjelaskan secara transparan data apa yang kami proses dan
          bagaimana kami melindunginya.
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
            Penggunaan layanan CheyaVerse menandakan Anda telah membaca dan
            menyetujui seluruh isi Kebijakan Privasi ini.
          </p>
        </div>
      </article>
    </>
  );
}