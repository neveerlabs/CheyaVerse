import { ReactNode } from "react";

export function GroupSection({
  title, children,
}: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7 animate-fade-up">
      <h2 className="text-[11px] font-bold tracking-[.08em] uppercase text-ink-mute px-1 pb-2.5">
        {title}
      </h2>
      <div className="rounded-2xl bg-white border border-line overflow-hidden">
        {children}
      </div>
    </section>
  );
}