const SHIMMER =
  "bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.7)_48%,rgba(255,255,255,.9)_50%,rgba(255,255,255,.7)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

export default function CoverLoading() {
  return (
    <>
      <header className="px-1 pt-[calc(12px+env(safe-area-inset-top))] pb-6 animate-fade-up">
        <div className="h-4 w-20 rounded-full bg-[#f0f0f0] overflow-hidden relative mb-3">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
        <div className="h-7 w-40 rounded-full bg-[#e5e5e5] overflow-hidden relative mb-1.5">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
        <div className="h-3.5 w-56 rounded-full bg-[#ececec] overflow-hidden relative">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
      </header>

      <section className="animate-fade-up">
        <div className="relative rounded-2xl overflow-hidden h-[180px] bg-[#f0f0f2] mb-5">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>

        <div className="flex gap-1 p-1 rounded-2xl bg-[#f5f5f5] mb-5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex-1 h-10 rounded-xl bg-white/70 backdrop-blur-md overflow-hidden relative"
            >
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-line bg-white p-4 mb-4">
          <div className="h-3.5 w-24 rounded-full bg-[#ececec] overflow-hidden relative mb-4">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-full bg-[#f0f0f0] overflow-hidden relative"
              >
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </div>
            ))}
          </div>
        </div>

        <div className="h-12 rounded-xl bg-ink overflow-hidden relative">
          <span className="absolute inset-0 bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.06)_48%,rgba(255,255,255,.11)_50%,rgba(255,255,255,.06)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer" />
        </div>
      </section>
    </>
  );
}