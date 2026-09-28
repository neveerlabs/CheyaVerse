const SHIMMER =
  "bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.7)_48%,rgba(255,255,255,.9)_50%,rgba(255,255,255,.7)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

type BubbleSpec = {
  outgoing: boolean;
  width: number;
  minHeight: number;
};

const BUBBLES: BubbleSpec[] = [
  { outgoing: false, width: 62, minHeight: 40 },
  { outgoing: true, width: 48, minHeight: 34 },
  { outgoing: false, width: 78, minHeight: 58 },
  { outgoing: true, width: 70, minHeight: 46 },
  { outgoing: false, width: 52, minHeight: 34 },
  { outgoing: true, width: 58, minHeight: 40 },
  { outgoing: false, width: 88, minHeight: 58 },
  { outgoing: true, width: 44, minHeight: 34 },
];

export default function ChatRoomLoading() {
  return (
    <>
      <header
        className="fixed left-0 right-0 z-40 pt-[calc(12px+env(safe-area-inset-top))] pb-3"
        style={{ top: 0 }}
      >
        <div className="mx-auto max-w-[600px] px-5">
          <div className="flex items-center gap-2 -mx-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#dfe3e8] bg-white shadow-sm">
              <span className="block h-5 w-5 rounded-full bg-[#e5e5e5] relative overflow-hidden">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </span>
            </div>

            <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#dfe3e8] bg-white pl-0.5 pr-3 shadow-sm">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f5f5f5] relative">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-center gap-1 self-stretch">
                <div className="h-3.5 w-28 rounded-full bg-[#e5e5e5] overflow-hidden relative">
                  <span className={`absolute inset-0 ${SHIMMER}`} />
                </div>
                <div className="h-2.5 w-20 rounded-full bg-[#ececec] overflow-hidden relative">
                  <span className={`absolute inset-0 ${SHIMMER}`} />
                </div>
              </div>
            </div>

            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#dfe3e8] bg-white shadow-sm">
              <span className="block h-4 w-4 rounded-full bg-[#e5e5e5] relative overflow-hidden">
                <span className={`absolute inset-0 ${SHIMMER}`} />
              </span>
            </div>
          </div>
        </div>
      </header>

      <section
        className="fixed left-0 right-0 z-10 mx-auto max-w-[600px] overflow-hidden pt-[calc(80px+env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))]"
        style={{ top: 0, height: "100dvh" }}
      >
        <div className="flex min-w-0 flex-col gap-2 px-3 py-3">
          {BUBBLES.map((bubble, index) => (
            <div
              key={index}
              className={`flex w-full min-w-0 items-end gap-2 ${
                bubble.outgoing ? "justify-end" : "justify-start"
              }`}
            >
              {!bubble.outgoing && (
                <div className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#f0f0f0] relative">
                  <span className={`absolute inset-0 ${SHIMMER}`} />
                </div>
              )}
              <div
                className={`min-w-0 ${
                  bubble.outgoing ? "max-w-[78%]" : "max-w-[calc(100%-40px)]"
                }`}
              >
                <div
                  className={`inline-block max-w-full overflow-hidden rounded-2xl px-3.5 py-2 ${
                    bubble.outgoing ? "bg-ink" : "bg-[#f1f3f5]"
                  }`}
                  style={{
                    width: `${bubble.width}%`,
                    minHeight: bubble.minHeight,
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
        className="chat-footer pointer-events-none fixed left-0 right-0 z-30 bg-transparent"
        style={{ bottom: 0 }}
      >
        <div className="pointer-events-auto mx-auto max-w-[600px] px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))]">
          <div className="flex w-full min-w-0 items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-line bg-white">
              <div className="flex min-h-11 w-full items-end px-3 py-1.5">
                <div className="h-[22px] w-32 rounded-full bg-[#f5f5f5] relative overflow-hidden">
                  <span className={`absolute inset-0 ${SHIMMER}`} />
                </div>
              </div>
            </div>
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#dfe3e8] bg-white relative">
              <span className={`absolute inset-0 ${SHIMMER}`} />
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}