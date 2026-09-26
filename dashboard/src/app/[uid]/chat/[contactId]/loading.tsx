const SHIMMER =
  "bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.7)_48%,rgba(255,255,255,.9)_50%,rgba(255,255,255,.7)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

const BUBBLE_WIDTHS = [62, 78, 52, 88, 70, 60];

export default function ChatRoomLoading() {
  return (
    <>
      <header className="fixed left-0 right-0 z-40 pt-[calc(12px+env(safe-area-inset-top))] pb-3" style={{ top: 0 }}>
        <div className="mx-auto max-w-[600px] px-5">
          <div className="flex items-center gap-2 -mx-3">
            <div className="w-10 h-10 rounded-full border border-line bg-white/45 backdrop-blur-xl shadow-[0_1px_2px_rgba(0,0,0,.03)]" />

            <div className="flex-1 min-w-0 flex items-center gap-2.5 h-10 pl-1.5 pr-3 rounded-full border border-line bg-white/45 backdrop-blur-xl shadow-[0_1px_2px_rgba(0,0,0,.03)]">
              <div className="w-8 h-8 rounded-full bg-[#f0f0f0]/55 backdrop-blur-md flex-shrink-0 overflow-hidden relative">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5">
                <div className="h-3 w-24 rounded-full bg-[#e5e5e5]/65 backdrop-blur-md overflow-hidden relative">
                  <span className={`absolute inset-0 ${SHIMMER}`} />
                </div>
                <div className="h-2 w-20 rounded-full bg-[#ececec]/65 backdrop-blur-md overflow-hidden relative">
                  <span className={`absolute inset-0 ${SHIMMER}`} />
                </div>
              </div>
            </div>

            <div className="w-10 h-10 rounded-full border border-line bg-white/45 backdrop-blur-xl shadow-[0_1px_2px_rgba(0,0,0,.03)]" />
          </div>
        </div>
      </header>

      <section className="pt-[calc(80px+env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-3">
          {BUBBLE_WIDTHS.map((w, i) => (
            <div key={i} className="flex gap-2.5 pr-1 -ml-3">
              <div className="w-8 h-8 rounded-full bg-[#f0f0f0]/55 backdrop-blur-md flex-shrink-0 mt-0.5 overflow-hidden relative">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="inline-block max-w-full bg-[#f5f5f5]/65 backdrop-blur-md rounded-2xl rounded-tl-md px-3.5 py-2.5 relative overflow-hidden"
                  style={{
                    width: `${w}%`,
                    minHeight: i % 3 === 0 ? 74 : 54,
                  }}
                >
                  <span className={`absolute inset-0 ${SHIMMER}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer
        className="chat-footer fixed left-0 right-0 z-30 pointer-events-none"
        style={{ bottom: 0 }}
      >
        <div
          className="absolute inset-x-0 top-0 bottom-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, #ffffff 0%, #ffffff 60%, rgba(255,255,255,0) 100%)",
          }}
        />
        <div className="relative mx-auto max-w-[600px] px-2 flex items-end gap-1.5 pointer-events-auto pt-4 pb-[calc(8px+env(safe-area-inset-bottom))]">
          <div className="flex-1 min-w-0 h-[40px] rounded-[22px] bg-[#f5f5f5]/55 backdrop-blur-xl border border-line relative overflow-hidden">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>
          <div className="w-10 h-10 rounded-full border border-line bg-white/45 backdrop-blur-xl flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,.03)] relative overflow-hidden">
            <span className={`absolute inset-0 ${SHIMMER}`} />
          </div>
        </div>
      </footer>
    </>
  );
}