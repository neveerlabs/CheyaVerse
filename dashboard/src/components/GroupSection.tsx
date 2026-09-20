import { ReactNode } from "react";

export function GroupSection({
  title, children,
}: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 animate-fade-up">
      <h2 className="text-[12.5px] font-medium text-ink-mute px-1 pb-1">
        {title}
      </h2>
      <div className="flex flex-col">
        {children}
      </div>
    </section>
  );
}
