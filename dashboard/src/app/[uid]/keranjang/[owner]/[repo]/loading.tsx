export default function GitHubProjectLoading() {
  return (
    <div className="relative left-1/2 min-h-[calc(100dvh-56px)] w-screen -translate-x-1/2 bg-[#f4f5f9] px-4 pb-12 pt-4 sm:px-6 sm:pt-6 lg:px-10">
      <div
        role="status"
        aria-label="Loading GitHub project dashboard"
        className="mx-auto max-w-[1680px] animate-pulse"
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="h-11 w-28 rounded-full bg-white shadow-sm" />
          <div className="h-11 w-11 rounded-full bg-white shadow-sm" />
        </div>
        <div className="mb-6 rounded-[28px] bg-white p-5 shadow-[0_12px_40px_-30px_rgba(15,23,42,0.28)] sm:mb-8 sm:rounded-[32px] sm:p-8">
          <div className="flex gap-4">
            <div className="h-14 w-14 shrink-0 rounded-[19px] bg-slate-100 sm:h-16 sm:w-16" />
            <div className="flex-1 space-y-3 py-1">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-6 w-2/3 rounded bg-slate-100" />
              <div className="h-3 w-full max-w-xl rounded bg-slate-50" />
            </div>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3 border-t border-slate-100/80 pt-4 sm:grid-cols-4 sm:gap-5">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-12 rounded-2xl bg-slate-50" />
            ))}
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
          <div className="space-y-5">
            <div className="h-[340px] rounded-[26px] bg-white shadow-sm sm:rounded-[30px]" />
            <div className="h-[310px] rounded-[26px] bg-white shadow-sm sm:rounded-[30px]" />
          </div>
          <div className="space-y-5">
            <div className="h-[330px] rounded-[26px] bg-white shadow-sm sm:rounded-[30px]" />
            <div className="h-[280px] rounded-[26px] bg-white shadow-sm sm:rounded-[30px]" />
          </div>
        </div>
        <span className="sr-only">Loading repository statistics and commit history</span>
      </div>
    </div>
  );
}
