import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, UserRound } from "lucide-react";
import { getTelegramUser } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function ContactProfilePage({
  params,
}: {
  params: { uid: string; contactId: string };
}) {
  const viewerUid = Number(params.uid);
  const contactUid = Number(params.contactId);
  if (
    !Number.isSafeInteger(viewerUid) ||
    viewerUid <= 0 ||
    !Number.isSafeInteger(contactUid) ||
    contactUid <= 0 ||
    contactUid === viewerUid
  ) notFound();
  const contact = await getTelegramUser(contactUid);
  if (!contact) notFound();

  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    (contact.username ? `@${contact.username}` : `Telegram ${contact.uid}`);

  return (
    <section className="min-h-[calc(100dvh-100px)] pt-[calc(12px+env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 pb-5">
        <Link
          href={`/${viewerUid}/chat/${contactUid}`}
          aria-label="Kembali ke percakapan"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-soft"
        >
          <ArrowLeft size={19} />
        </Link>
        <h1 className="text-[17px] font-semibold text-ink">Profil</h1>
      </header>
      <div className="flex flex-col items-center rounded-3xl border border-line bg-white px-6 py-8 text-center shadow-sm">
        <div className="mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5]">
          {contact.photo_url ? (
            // Telegram profile photos may be remote URLs.
            <img src={contact.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound size={34} className="text-ink-mute" />
          )}
        </div>
        <h2 className="text-[20px] font-bold text-ink">{name}</h2>
        {contact.username && (
          <p className="mt-1 text-[13px] text-ink-mute">@{contact.username}</p>
        )}
        <p className="mt-3 text-[12px] text-ink-mute">Telegram ID: {contact.uid}</p>
        <Link
          href={`/${viewerUid}/chat/${contactUid}`}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          <MessageCircle size={16} /> Kirim pesan
        </Link>
      </div>
    </section>
  );
}
