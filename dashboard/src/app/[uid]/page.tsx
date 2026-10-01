import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Github, Image as ImageIcon, Send, UserRound } from "lucide-react";
import { VerifiedName } from "@/components/VerifiedName";
import { config } from "@/lib/config";
import { getTelegramUser } from "@/lib/storage";
import { GitHubHomeDashboard } from "./GitHubHomeDashboard";

export const dynamic = "force-dynamic";

const shortcuts = [
  { label: "Chat", href: "chat", icon: Send, detail: "Your conversations" },
  { label: "Media", href: "media", icon: ImageIcon, detail: "Photos and videos" },
  { label: "Projects", href: "keranjang", icon: Github, detail: "GitHub repositories" },
  { label: "Profile", href: "profile", icon: UserRound, detail: "Account settings" },
] as const;

export default async function HomePage({ params }: { params: { uid: string } }) {
  const uid = Number(params.uid);
  if (!Number.isSafeInteger(uid) || uid <= 0) notFound();
  const user = await getTelegramUser(uid);
  if (!user) notFound();

  const displayName = user.username
    ? `@${user.username}`
    : [user.first_name, user.last_name].filter(Boolean).join(" ") || "there";
  const isAdmin = config.adminTelegramIds.has(uid);

  return (
    <>
      <div className="mx-auto w-full max-w-[520px] pb-5">
        <section className="pb-7 pt-5">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-mute">
            CheyaVerse
          </p>
          <h1 className="mt-2 flex flex-wrap items-center gap-x-2 text-[26px] font-semibold leading-tight tracking-[-0.04em] text-ink">
            <span>Hi,</span>
            {isAdmin ? (
              <VerifiedName
                name={displayName}
                size="lg"
                nameClassName="text-[26px] leading-tight"
              />
            ) : (
              <span className="min-w-0 break-all">{displayName}</span>
            )}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            Everything you need, right where you need it.
          </p>
        </section>

        <nav aria-label="Quick links" className="grid grid-cols-2 gap-3">
          {shortcuts.map(({ label, href, icon: Icon, detail }) => (
            <Link
              key={href}
              href={`/${uid}/${href}`}
              className="group flex min-h-[116px] flex-col justify-between rounded-[20px] border border-black/[.055] bg-white p-4 shadow-[0_5px_20px_-18px_rgba(0,0,0,.25)] transition-colors hover:bg-[#fafafa] active:scale-[.985]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#f3f4f6] text-ink">
                <Icon size={19} strokeWidth={1.8} />
              </span>
              <span className="mt-4 flex items-end justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink">{label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-mute">
                    {detail}
                  </span>
                </span>
                <ArrowRight
                  size={15}
                  className="mb-0.5 shrink-0 text-ink-mute transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          ))}
        </nav>
      </div>
      <GitHubHomeDashboard uid={params.uid} />
    </>
  );
}
