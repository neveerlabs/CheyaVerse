import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { TelegramAvatar } from "@/components/TelegramAvatar";
import { CoverIcon } from "@/lib/cover-icons";
import { getCover, getTelegramUser } from "@/lib/storage";

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

  const [contact, cover] = await Promise.all([
    getTelegramUser(contactUid),
    getCover(contactUid).catch(() => null),
  ]);
  if (!contact) notFound();

  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    (contact.username ? `@${contact.username}` : `Telegram ${contact.uid}`);

  return (
    <section className="animate-fade-up">
      <header className="flex items-center gap-3 pb-4 pt-[calc(12px+env(safe-area-inset-top))]">
        <Link
          href={`/${viewerUid}/chat/${contactUid}`}
          aria-label="Kembali ke percakapan"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink-soft transition-colors hover:bg-[#f7f7f7]"
        >
          <ArrowLeft size={19} />
        </Link>
        <h1 className="text-[17px] font-semibold text-ink">Profil kontak</h1>
      </header>

      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
        <div className="relative h-[180px] overflow-hidden bg-gradient-to-br from-[#e5e5e7] via-[#f0f0f2] to-[#e0e0e2]">
          {cover && (cover.type === "upload" || cover.type === "telegram") ? (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(/api/cover/${contactUid}/image?v=${cover.updated_at ?? ""})`,
                backgroundSize: `${cover.bg_size ?? 100}% auto`,
                backgroundPosition: `${cover.bg_x ?? 50}% ${cover.bg_y ?? 50}%`,
                backgroundRepeat: "no-repeat",
                backgroundColor: "#f5f5f5",
              }}
            />
          ) : cover?.type === "color" ? (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${cover.color1 ?? "#3b82f6"}, ${cover.color2 ?? "#93c5fd"})`,
              }}
            >
              {cover.icon && (
                <CoverIcon
                  name={cover.icon}
                  size={140}
                  className="relative text-white drop-shadow-[0_8px_24px_rgba(0,0,0,.4)]"
                />
              )}
            </div>
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        </div>

        <div className="px-5 pb-6">
          <div className="-mt-12 mb-3 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#f5f5f5] shadow-sm">
            <TelegramAvatar
              src={contact.photo_url}
              alt={name}
              className="h-full w-full object-cover"
            />
          </div>
          <h2 className="break-words text-[22px] font-bold leading-tight text-ink">
            {name}
          </h2>
          {contact.username && (
            <p className="mt-1 text-[14px] text-ink-mute">@{contact.username}</p>
          )}
          <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-mute">
            Telegram ID
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">{contact.uid}</p>
          <Link
            href={`/${viewerUid}/chat/${contactUid}`}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <MessageCircle size={16} /> Kirim pesan
          </Link>
        </div>
      </div>
    </section>
  );
}
