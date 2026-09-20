import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Image as ImageIcon, ExternalLink } from "lucide-react";
import { listRecentMedia } from "@/lib/storage";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MediaPage({ params }: { params: { uid: string } }) {
  const uid = Number(params.uid);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  let items: Awaited<ReturnType<typeof listRecentMedia>> = [];
  try { items = await listRecentMedia(uid, 50); } catch {}

  return (
    <>
      <AppHeader
        title="Media"
        subtitle={`${items.length} file terbaru`}
        icon={<ImageIcon size={22} strokeWidth={2.4} />}
      />

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white border border-line p-10 text-center animate-fade-up">
          <div className="w-14 h-14 rounded-full bg-[#fafafa] border border-line mx-auto mb-3 flex items-center justify-center">
            <ImageIcon size={24} className="text-ink-mute" />
          </div>
          <p className="text-[14px] font-semibold text-ink mb-1">Belum ada media</p>
          <p className="text-[12.5px] text-ink-soft">
            Upload foto/video ke bot dengan caption /qr
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-line overflow-hidden animate-fade-up">
          {items.map((m) => (
            <Link
              key={m.id}
              href={`/${uid}/m/${m.id}`}
              className="group flex items-center gap-3.5 px-[18px] py-[14px] transition-colors hover:bg-[#fafafa] active:bg-[#f5f5f5] relative before:absolute before:top-0 before:left-[18px] before:right-[18px] before:h-px before:bg-divider first:before:hidden"
            >
              <span className="w-10 h-10 rounded-xl bg-[#fafafa] border border-line flex items-center justify-center flex-shrink-0">
                <ImageIcon size={18} className="text-ink-soft" />
              </span>
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[14px] font-medium text-ink truncate">
                  {m.filename}
                </span>
                <span className="text-[11.5px] text-ink-mute font-mono">
                  {m.id} · {formatDate(m.expires_at)}
                </span>
              </span>
              <ExternalLink size={16} className="text-ink-mute flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return "expired";
    if (days === 1) return "1 hari lagi";
    return `${days} hari lagi`;
  } catch { return "—"; }
}