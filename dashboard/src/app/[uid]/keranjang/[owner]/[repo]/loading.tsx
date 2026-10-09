export default function GitHubProjectLoading() {
  return (
    <div className="relative left-1/2 min-h-[calc(100dvh-56px)] w-screen -translate-x-1/2 bg-[#f4f5f9] px-4 pb-12 pt-4 sm:px-6 sm:pt-6 lg:px-10">
      <div
        role="status"
        aria-label="Loading GitHub project dashboard"
        className="mx-auto max-w-[1240px] animate-pulse"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="h-10 w-28 rounded-full border border-white bg-white shadow-sm" />
          <div className="h-10 w-10 rounded-full border border-white bg-white shadow-sm" />
        </div>
        <div className="mb-4 overflow-hidden rounded-[24px] border border-white bg-white p-4 shadow-[0_18px_48px_-38px_rgba(15,23,42,.34)] sm:p-6">
          <div className="flex gap-3">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-slate-100 sm:h-14 sm:w-14" />
            <div className="flex-1 space-y-3 py-1">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-5 w-2/3 rounded bg-slate-100" />
              <div className="h-3 w-full max-w-lg rounded bg-slate-50" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100/80 pt-3 sm:grid-cols-4 sm:gap-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-11 rounded-xl bg-slate-50" />
            ))}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,.85fr)]">
          <div className="space-y-4">
            <div className="h-[300px] rounded-[22px] border border-white bg-white shadow-sm" />
            <div className="h-[340px] rounded-[22px] border border-white bg-white shadow-sm" />
          </div>
          <div className="space-y-4">
            <div className="h-[300px] rounded-[22px] border border-white bg-white shadow-sm" />
            <div className="h-[260px] rounded-[22px] border border-white bg-white shadow-sm" />
          </div>
        </div>
        <span className="sr-only">Loading repository statistics and commit history</span>
      </div>
    </div>
  );
}
