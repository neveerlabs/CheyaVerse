import { ReactNode } from "react";

export function AppHeader({
  title, subtitle, icon,
}: { title: string; subtitle?: string; icon: ReactNode }) {
  return (
    <header className="flex items-center gap-4 px-1 pt-8 pb-6 animate-fade-up">
      <div className="w-12 h-12 rounded-2xl bg-ink flex items-center justify-center flex-shrink-0">
        <span className="w-6 h-6 flex items-center justify-center text-white">{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-bold tracking-[-.02em] text-ink leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] text-ink-soft font-medium mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
    </header>
  );
}