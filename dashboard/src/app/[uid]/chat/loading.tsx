const SHIMMER =
  "bg-[linear-gradient(105deg,transparent,38%,rgba(255,255,255,.7)_48%,rgba(255,255,255,.9)_50%,rgba(255,255,255,.7)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

export default function ChatLoading() {
  return (
    <>
      <header className="-mx-2 pt-[calc(12px+env(safe-area-inset-top))] pb-4 animate-fade-up">
        <div className="flex items-center gap-3 px-4 h-12 rounded-full bg-[#f5f5f5]">
          <div className="w-[18px] h-[18px] rounded-full bg-[#e5e5e5] overflow-hidden relative flex-shrink-0">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>
          <div className="flex-1 h-4 rounded-full bg-[#e5e5e5] overflow-hidden relative">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>
        </div>
      </header>

      <section className="animate-fade-up">
        <div className="flex items-center gap-3 -ml-2 pr-1 py-3">
          <div className="w-12 h-12 rounded-full bg-[#f0f0f0] overflow-hidden relative flex-shrink-0">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <div className="h-4 w-28 rounded-full bg-[#e5e5e5] overflow-hidden relative">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </div>
              <div className="w-[22px] h-[22px] rounded-full bg-[#ececec] overflow-hidden relative flex-shrink-0">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </div>
            </div>
            <div className="h-3 w-44 rounded-full bg-[#f0f0f0] overflow-hidden relative">
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-col items-end justify-center gap-1 min-h-[36px]">
            <div className="h-3 w-10 rounded-full bg-[#ececec] overflow-hidden relative">
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-[#e5e5e5] overflow-hidden relative">
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}