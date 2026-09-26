// src/app/[uid]/loading.tsx
const SHIMMER =
  "bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.7)_48%,rgba(255,255,255,.9)_50%,rgba(255,255,255,.7)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

export default function Loading() {
  return (
    <>
      <header className="px-1 pt-[calc(12px+env(safe-area-inset-top))] pb-6 animate-fade-up">
        <div className="h-8 w-48 rounded-full bg-[#f0f0f0] overflow-hidden relative mb-2">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
        <div className="h-4 w-64 rounded-full bg-[#f5f5f5] overflow-hidden relative">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
      </header>
      <section className="animate-fade-up">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-5 px-1 py-[13px] min-h-[56px] relative">
            <div className="w-6 h-6 rounded-full bg-[#f0f0f0] overflow-hidden relative flex-shrink-0">
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="h-4 w-3/4 rounded-full bg-[#f0f0f0] overflow-hidden relative">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </div>
              <div className="h-3 w-1/2 rounded-full bg-[#f5f5f5] overflow-hidden relative">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </div>
            </div>
            <div className="w-4 h-4 rounded-full bg-[#f0f0f0] overflow-hidden relative flex-shrink-0">
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
          </div>
        ))}
      </section>
    </>
  );
}