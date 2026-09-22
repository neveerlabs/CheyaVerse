import { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Props = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  external?: boolean;
  value?: ReactNode;
};

export function ListRow({
  icon, title, subtitle, href, onClick, disabled, external, value,
}: Props) {
  const inner = (
    <>
      <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-ink-soft">
        {icon}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[15px] font-normal text-ink tracking-[-.005em] leading-snug truncate">
          {title}
        </span>
        {subtitle && (
          <span className="text-[12.5px] text-ink-soft leading-snug line-clamp-2">
            {subtitle}
          </span>
        )}
      </span>
      {value !== undefined ? (
        <span className="text-[13px] text-ink-soft font-normal flex-shrink-0">{value}</span>
      ) : !disabled ? (
        <ChevronRight size={18} className="text-ink-mute flex-shrink-0" strokeWidth={2} />
      ) : null}
    </>
  );

  const cls =
    "group flex items-center gap-5 px-1 py-[13px] min-h-[56px] relative " +
    "transition-opacity w-full text-left font-[inherit] " +
    "before:absolute before:bottom-0 before:left-12 before:right-0 before:h-px " +
    "before:bg-divider last:before:hidden " +
    (disabled
      ? "cursor-default"
      : "hover:opacity-60 active:opacity-40 cursor-pointer");

  if (disabled) return <div className={cls}>{inner}</div>;
  if (href) {
    return external ? (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    ) : (
      <Link className={cls} href={href}>{inner}</Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}