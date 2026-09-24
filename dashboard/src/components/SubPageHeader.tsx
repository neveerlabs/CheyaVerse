import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function SubPageHeader({
  title,
  subtitle,
  backHref,
}: {
  title: string;
  subtitle?: string;
  backHref: string;
}) {
  return (
    <header className="px-1 pt-[calc(12px+env(safe-area-inset-top))] pb-6 animate-fade-up">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-soft hover:text-ink mb-3 transition-colors"
      >
        <ChevronLeft size={16} strokeWidth={2.4} />
        Kembali
      </Link>
      <h1 className="text-[28px] font-bold tracking-[-.035em] text-ink leading-[1.1]">
        {title}
      </h1>
      {subtitle && (
        <p className="text-[13px] text-ink-mute font-normal mt-1.5 tracking-[-.005em]">
          {subtitle}
        </p>
      )}
    </header>
  );
}