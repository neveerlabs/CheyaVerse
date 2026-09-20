import { ReactNode } from "react";

export function AppHeader({
  title, subtitle,
}: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <header className="px-1 pt-[calc(12px+env(safe-area-inset-top))] pb-6 animate-fade-up">
      <h1 className="text-[30px] font-bold tracking-[-.035em] text-ink leading-[1.1]">
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
