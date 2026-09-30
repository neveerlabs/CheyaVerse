export function FloatingPageLabel({ label }: { label: string }) {
  return (
    <aside
      aria-label={label}
      className="pointer-events-none fixed right-0 top-[20vh] z-[60] flex h-[clamp(112px,17vh,148px)] w-8 items-center justify-center rounded-l-xl rounded-r-none border border-blue-400/70 bg-blue-600 px-1.5 py-2 text-[9px] font-bold tracking-[0.12em] text-white shadow-md shadow-blue-950/20 md:h-[clamp(128px,18vh,164px)] md:w-9 md:text-[10px]"
    >
      <span className="rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">
        {label}
      </span>
    </aside>
  );
}
