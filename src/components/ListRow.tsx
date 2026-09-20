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
      <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-ink">
        {icon}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[15px] font-medium text-ink tracking-[-.01em] leading-snug truncate">
          {title}
        </span>
        {subtitle && (
          <span className="text-[12.5px] text-ink-soft leading-snug line-clamp-2">
            {subtitle}
          </span>
        )}
      </span>
      {value !== undefined ? (
        <span className="text-[13px] text-ink-soft font-medium flex-shrink-0">{value}</span>
      ) : !disabled ? (
        <ChevronRight size={18} className="text-ink-mute flex-shrink-0" />
      ) : null}
    </>
  );

  const cls =
    "group flex items-center gap-4 px-[18px] py-[15px] min-h-[62px] relative " +
    "transition-colors w-full text-left font-[inherit] " +
    "before:absolute before:top-0 before:left-[54px] before:right-0 before:h-px " +
    "before:bg-divider first:before:hidden " +
    (disabled
      ? "cursor-default"
      : "hover:bg-[#fafafa] active:bg-[#f5f5f5] cursor-pointer");

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