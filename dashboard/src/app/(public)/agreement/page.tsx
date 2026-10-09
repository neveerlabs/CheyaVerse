import { AppHeader } from "@/components/AppHeader";
import { AGREEMENT_SECTIONS, POLICY_LAST_UPDATED } from "@/lib/public-site-content";

export const dynamic = "force-dynamic";

export default function AgreementPage() {
  return (
    <>
      <AppHeader
        title="User Agreement"
        subtitle={POLICY_LAST_UPDATED}
        cornerLabel="USER AGREEMENT"
      />

      <article className="animate-fade-up">
        <p className="mb-7 text-[13.5px] leading-[1.75] text-ink-soft">
          Ketentuan ini menjelaskan aturan dasar penggunaan fitur web
          CheyaVerse dan tanggung jawab Anda sebagai pengguna. Dengan
          menggunakan website, Anda setuju untuk mematuhi ketentuan ini.
        </p>

        <div className="flex flex-col gap-6">
          {AGREEMENT_SECTIONS.map((section, index) => (
            <section key={section.title}>
              <h2 className="mb-2 text-[14.5px] font-semibold tracking-[-.005em] text-ink">
                {index + 1}. {section.title}
              </h2>
              <p className="text-[13.5px] leading-[1.75] text-ink-soft">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-9 border-t border-divider pt-5">
          <p className="text-[11.5px] leading-relaxed text-ink-mute">
            Ketentuan ini dapat diperbarui jika fitur atau cara kerja website
            berubah. Versi terbaru tersedia di halaman ini.
          </p>
        </div>
      </article>
    </>
  );
}
