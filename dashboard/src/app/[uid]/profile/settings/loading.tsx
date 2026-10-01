const SHIMMER =
  "bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.7)_48%,rgba(255,255,255,.9)_50%,rgba(255,255,255,.7)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

function Skeleton({
  className,
  style,
}: {
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`relative overflow-hidden rounded-full bg-[#e9e9eb] ${className}`}
    >
      <span className={`absolute inset-0 ${SHIMMER}`} />
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <>
      <header className="px-1 pt-[calc(12px+env(safe-area-inset-top))] pb-6">
        <Skeleton className="mb-4 h-4 w-20" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-2 h-3.5 w-52" />
      </header>

      <div className="mb-5 flex gap-2 overflow-hidden rounded-[22px] border border-white bg-[#f0f1f5] p-1.5">
        {[20, 27, 14, 18, 17].map((width, index) => (
          <Skeleton
            key={index}
            className="h-10 shrink-0 rounded-[17px]"
            style={{ width: `${width * 4}px` }}
          />
        ))}
      </div>

      {[0, 1].map((section) => (
        <section key={section} className="mb-5">
          <Skeleton className="mb-2 ml-3 h-3 w-28" />
          <div className="overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_8px_32px_-28px_rgba(15,23,42,.38)]">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex min-h-[72px] items-center gap-3.5 border-b border-divider px-4 py-3 last:border-0"
              >
                <Skeleton className="h-5 w-5 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-48 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
