import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";
import { ChevronDown, Mail } from "lucide-react";
import { HELP_FAQS, POLICY_LAST_UPDATED } from "@/lib/public-site-content";

export const dynamic = "force-dynamic";

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
        subtitle={POLICY_LAST_UPDATED}
        backHref={`/${params.uid}/profile`}
      />

      <p className="mb-6 px-1 text-[13.5px] leading-[1.75] text-ink-soft animate-fade-up">
        Panduan untuk fitur website CheyaVerse dan langkah awal mengatasi
        kendala yang umum terjadi.
      </p>

      <section className="mb-6 animate-fade-up">
        <h2 className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-mute">
          Pertanyaan umum
        </h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {HELP_FAQS.map((item, index) => (
            <details
              key={item.q}
              className={`group ${
                index !== HELP_FAQS.length - 1 ? "border-b border-divider" : ""
              }`}
            >
              <summary className="flex min-h-[56px] cursor-pointer list-none select-none items-center justify-between gap-3 px-4 py-[15px] transition-colors [&::-webkit-details-marker]:hidden sm:hover:bg-[#fafafa]">
                <span className="text-[14px] font-medium leading-snug tracking-[-.005em] text-ink">
                  {item.q}
                </span>
                <ChevronDown
                  size={17}
                  strokeWidth={2}
                  className="flex-shrink-0 text-ink-mute transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="-mt-0.5 px-4 pb-4">
                <ul className="flex flex-col gap-2">
                  {item.a.map((step) => (
                    <li
                      key={step}
                      className="flex items-start gap-2.5 text-[12.5px] leading-[1.65] text-ink-soft"
                    >
                      <span className="mt-[7px] h-[5px] w-[5px] flex-shrink-0 rounded-full bg-ink-mute" />
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
        <h2 className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-mute">
          Dukungan teknis
        </h2>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-4 text-[13px] leading-[1.7] text-ink-soft">
            Jika kendala belum terjawab, kirim deskripsi masalah, langkah untuk
            mengulanginya, browser/perangkat yang digunakan, dan tangkapan layar
            bila membantu. Jangan sertakan kata sandi, kode verifikasi, token,
            atau informasi sensitif.
          </p>
          <a
            href="mailto:userlinuxorg@gmail.com?subject=CheyaVerse%20Website%20Support"
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-[13px] font-medium text-white transition-all active:scale-[.97] sm:hover:bg-accent-hover"
          >
            <Mail size={15} strokeWidth={2.2} />
            Hubungi dukungan
          </a>
        </div>
      </section>
    </>
  );
}
