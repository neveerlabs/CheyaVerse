const SHIMMER =
  "bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.7)_48%,rgba(255,255,255,.9)_50%,rgba(255,255,255,.7)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

const DARK_SHIMMER =
  "bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.06)_48%,rgba(255,255,255,.11)_50%,rgba(255,255,255,.06)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

export default function PublicViewerLoading() {
  return (
    <>
      <div className="flex items-center gap-3 px-1 pt-8 pb-5 animate-fade-up">
        <div className="w-11 h-11 rounded-xl bg-ink flex items-center justify-center flex-shrink-0 overflow-hidden relative">
          <span className={`absolute inset-0 ${DARK_SHIMMER}`} />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <div className="h-4 w-48 rounded-full bg-[#e5e5e5] overflow-hidden relative">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>
          <div className="h-3 w-32 rounded-full bg-[#ececec] overflow-hidden relative">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>
        </div>
      </div>

      <div
        className="relative rounded-2xl overflow-hidden bg-[#0a0a0a] w-full mb-4 animate-fade-up"
        style={{ aspectRatio: "4 / 3", maxHeight: "70vh" }}
      >
        <span className={`absolute inset-0 ${DARK_SHIMMER}`} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
          <span className="absolute w-24 h-24 rounded-full bg-white/[.04] animate-ping" />
          <span
            className="absolute w-16 h-16 rounded-full bg-white/[.05] animate-ping"
            style={{ animationDelay: "0.25s" }}
          />
          <span className="relative w-11 h-11 rounded-full border-2 border-white/15 border-t-white/90 animate-spin" />
        </div>
        <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-[10.5px] font-semibold tracking-[.2em] uppercase">
          Memuat
        </span>
      </div>

      <div className="flex gap-2 mb-3 animate-fade-up">
        <div className="flex-1 h-12 rounded-xl bg-ink overflow-hidden relative">
          <span className={`absolute inset-0 ${DARK_SHIMMER}`} />
        </div>
        <div className="flex-1 h-12 rounded-xl bg-[#fafafa] border border-line overflow-hidden relative">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
        <div className="w-11 h-12 rounded-xl bg-[#fafafa] border border-line overflow-hidden relative flex-shrink-0">
          <span className={`absolute inset-0 ${SHIMMER}`} />
        </div>
      </div>
    </>
  );
}