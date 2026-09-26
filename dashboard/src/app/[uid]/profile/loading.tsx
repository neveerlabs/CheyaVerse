const SHIMMER =
  "bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.7)_48%,rgba(255,255,255,.9)_50%,rgba(255,255,255,.7)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

export default function ProfileLoading() {
  return (
    <>
      <section className="-mx-5 animate-fade-up">
        <div className="relative h-[180px] overflow-hidden bg-[#f0f0f2]">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
        <div className="px-5 flex items-end -mt-14 relative z-10">
          <div className="w-[104px] h-[104px] flex-shrink-0 rounded-full border-4 border-white bg-[#f0f0f0] overflow-hidden relative shadow-[0_4px_16px_-6px_rgba(0,0,0,.18)]">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>
          <div className="pl-3 pb-1 min-w-0 flex-1 translate-y-2">
            <div className="h-6 w-40 rounded-full bg-[#e5e5e5] overflow-hidden relative mb-1.5">
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
            <div className="h-4 w-32 rounded-full bg-[#ececec] overflow-hidden relative">
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 animate-fade-up">
        <div className="w-full rounded-2xl bg-[#f5f5f5] px-4 py-3.5 flex flex-col items-center gap-2">
          <div className="h-4 w-40 rounded-full bg-[#e5e5e5] overflow-hidden relative">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>
          <div className="h-3 w-24 rounded-full bg-[#ececec] overflow-hidden relative">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-3 w-16 rounded-full bg-[#ececec] overflow-hidden relative"
            >
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 animate-fade-up">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-2 px-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-xl overflow-hidden bg-[#f0f0f0] border border-line"
            >
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}