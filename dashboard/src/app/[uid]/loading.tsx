const SHIMMER =
  "bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,.72)_48%,rgba(255,255,255,.92)_50%,rgba(255,255,255,.72)_52%,transparent_62%)] bg-[length:220%_100%] animate-shimmer";

function Placeholder({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <span className={`absolute inset-0 ${SHIMMER}`} />
    </div>
  );
}

export default function HomeLoading() {
  return (
    <section
      role="status"
      aria-label="Loading repository activity"
      className="relative left-1/2 min-h-[100dvh] w-screen -translate-x-1/2 bg-[#f6f7fb] px-4 pb-12 pt-5 text-slate-900 sm:px-6 sm:pt-7"
    >
      <div className="mx-auto max-w-[1180px] animate-pulse">
        <header className="mb-3 flex items-center justify-between gap-3 rounded-[20px] border border-slate-200/80 bg-white/85 px-3.5 py-3 shadow-[0_8px_24px_-24px_rgba(15,23,42,.45)] sm:px-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Placeholder className="h-2.5 w-28" />
            <Placeholder className="h-5 w-48 max-w-full" />
            <Placeholder className="h-3 w-64 max-w-full" />
          </div>
          <div className="flex shrink-0 gap-2">
            <div className="h-9 w-20 rounded-full bg-slate-100" />
            <div className="h-9 w-9 rounded-full bg-slate-100" />
          </div>
        </header>

        <article className="mb-3 overflow-hidden rounded-[26px] border border-violet-100 bg-white p-4 shadow-[0_18px_48px_-34px_rgba(79,70,229,.5)] sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <Placeholder className="h-5 w-56 max-w-[72%]" />
            <div className="h-6 w-16 rounded-full bg-slate-100" />
          </div>
          <Placeholder className="mt-3 h-3 w-3/4 max-w-full" />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-[68px] rounded-xl bg-slate-50 p-3">
                <Placeholder className="h-2 w-20" />
                <Placeholder className="mt-3 h-4 w-12" />
              </div>
            ))}
          </div>
          <div className="mt-4 h-16 rounded-xl bg-slate-50" />
          <Placeholder className="mt-4 h-3 w-2/3 max-w-full" />
        </article>

        <div className="grid items-stretch gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <article key={item} className="h-[190px] rounded-[22px] border border-slate-200/80 bg-white p-4">
              <Placeholder className="h-4 w-40 max-w-full" />
              <Placeholder className="mt-3 h-3 w-full" />
              <Placeholder className="mt-2 h-3 w-2/3" />
              <div className="mt-5 h-10 rounded-lg bg-slate-50" />
              <Placeholder className="mt-4 h-3 w-3/4" />
            </article>
          ))}
        </div>
        <span className="sr-only">Loading your GitHub project activity</span>
      </div>
    </section>
  );
}
