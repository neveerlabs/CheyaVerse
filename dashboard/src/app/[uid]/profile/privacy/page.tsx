import { notFound } from "next/navigation";
import { SubPageHeader } from "@/components/SubPageHeader";
import { POLICY_LAST_UPDATED, PRIVACY_SECTIONS } from "@/lib/public-site-content";

export const dynamic = "force-dynamic";

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
        subtitle={POLICY_LAST_UPDATED}
        backHref={`/${params.uid}/profile`}
        cornerLabel="PRIVACY POLICY"
      />

      <article className="animate-fade-up">
        <p className="mb-7 text-[13.5px] leading-[1.75] text-ink-soft">
          Kebijakan ini menjelaskan informasi yang digunakan untuk menyediakan
          fitur web CheyaVerse, cara informasi tersebut digunakan, dan pilihan
          yang tersedia bagi Anda.
        </p>

        <div className="flex flex-col gap-6">
          {PRIVACY_SECTIONS.map((section, index) => (
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
            Kebijakan ini dapat diperbarui saat fitur atau praktik pemrosesan
            berubah. Versi yang berlaku tersedia di halaman ini.
          </p>
        </div>
      </article>
    </>
  );
}
