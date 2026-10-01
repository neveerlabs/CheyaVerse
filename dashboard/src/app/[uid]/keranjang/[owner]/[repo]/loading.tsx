export default function GitHubProjectLoading() {
  return (
    <div className="relative left-1/2 min-h-[calc(100dvh-56px)] w-screen -translate-x-1/2 bg-[#f5f7fb] px-4 pb-12 pt-5 sm:px-7 lg:px-10">
      <div
        role="status"
        aria-label="Loading GitHub project dashboard"
        className="mx-auto max-w-[1440px] animate-pulse"
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="h-10 w-28 rounded-full bg-white ring-1 ring-slate-200/80" />
          <div className="h-10 w-10 rounded-full bg-white ring-1 ring-slate-200/80" />
        </div>
        <div className="mb-5 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200/80 sm:p-8">
          <div className="flex gap-4">
            <div className="h-14 w-14 shrink-0 rounded-[19px] bg-slate-100 sm:h-16 sm:w-16" />
            <div className="flex-1 space-y-3 py-1">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-6 w-2/3 rounded bg-slate-100" />
              <div className="h-3 w-full max-w-xl rounded bg-slate-50" />
            </div>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="h-12 rounded-xl bg-slate-50" />
            ))}
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(310px,1fr)]">
          <div className="space-y-5">
            <div className="h-[340px] rounded-[24px] bg-white ring-1 ring-slate-200/80" />
            <div className="h-[310px] rounded-[24px] bg-white ring-1 ring-slate-200/80" />
          </div>
          <div className="space-y-5">
            <div className="h-[330px] rounded-[24px] bg-white ring-1 ring-slate-200/80" />
            <div className="h-[280px] rounded-[24px] bg-white ring-1 ring-slate-200/80" />
          </div>
        </div>
        <span className="sr-only">Loading repository statistics and commit history</span>
      </div>
    </div>
  );
}
