const SHIMMER =
  "bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.7)_48%,rgba(255,255,255,.9)_50%,rgba(255,255,255,.7)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

export default function MediaLoading() {
  return (
    <>
      <header className="px-1 pt-[calc(12px+env(safe-area-inset-top))] pb-6 animate-fade-up">
        <div className="h-8 w-32 rounded-full bg-[#f0f0f0] overflow-hidden relative mb-2">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
        <div className="h-4 w-28 rounded-full bg-[#f5f5f5] overflow-hidden relative">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
      </header>

      <div className="flex items-center justify-end gap-1 px-1 pb-2 animate-fade-up">
        <div className="w-9 h-9 rounded-lg bg-[#f0f0f0] overflow-hidden relative">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
        <div className="w-9 h-9 rounded-lg bg-[#f5f5f5] overflow-hidden relative">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
      </div>

      <div className="flex flex-col px-1 animate-fade-up">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="group flex items-center gap-4 py-[15px] relative
                       before:absolute before:bottom-0 before:left-14 before:right-0
                       before:h-px before:bg-divider last:before:hidden"
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#f0f0f0] overflow-hidden relative flex-shrink-0">
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="h-4 w-2/3 rounded-full bg-[#f0f0f0] overflow-hidden relative">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </div>
              <div className="h-3 w-1/2 rounded-full bg-[#f5f5f5] overflow-hidden relative">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#f0f0f0] overflow-hidden relative flex-shrink-0 -mr-1">
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}