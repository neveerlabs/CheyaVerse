"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  Github,
  LockKeyhole,
  RefreshCw,
  Star,
} from "lucide-react";

type Project = {
  repository: {
    id: number;
    name: string;
    fullName: string;
    url: string;
    description: string | null;
    visibility: "private" | "public";
    language: string | null;
    defaultBranch: string;
    stars: number;
    forks: number;
    pushedAt: string | null;
  };
  history: {
    weeklyActivity: number[] | null;
    commitsLastYear: number;
    commitsLastFiveWeeks: number;
  };
  latestCommit: {
    sha: string;
    url: string;
    message: string;
    author: string;
    date: string;
  } | null;
};

type Overview = {
  stats: {
    repositories: number;
    stars: number;
    forks: number;
    activeThisMonth: number;
    commitsLastYear: number;
    commitsLastFiveWeeks: number;
    repositoriesWithHistory: number;
    hasMore: boolean;
  };
  accountActivity: Array<{ week: number; commits: number }>;
  projects: Project[];
  popular: Project[];
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function projectHref(uid: string, project: Project): string {
  return `/${uid}/keranjang/${encodeURIComponent(project.repository.fullName.split("/")[0])}/${encodeURIComponent(project.repository.name)}`;
}

function DashboardSkeleton() {
  return (
    <div aria-label="Loading project dashboard" role="status" className="animate-pulse">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-3 w-28 rounded-full bg-slate-200" />
          <div className="h-7 w-52 rounded-lg bg-slate-200" />
        </div>
        <div className="h-10 w-10 rounded-full bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-[108px] rounded-[20px] bg-white" />
        ))}
      </div>
      <div className="mt-4 h-[228px] rounded-[24px] bg-white" />
      <div className="mt-6 mb-3 h-5 w-40 rounded bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="h-[230px] rounded-[22px] bg-white" />
        ))}
      </div>
      <span className="sr-only">Loading your GitHub project activity</span>
    </div>
  );
}

function WeeklyChart({
  weeks,
}: {
  weeks: Array<{ week: number; commits: number }>;
}) {
  const width = 860;
  const height = 176;
  const padding = { top: 16, right: 12, bottom: 26, left: 12 };
  const baseline = height - padding.bottom;
  const graphHeight = baseline - padding.top;
  const max = Math.max(...weeks.map((week) => week.commits), 1);
  const step = (width - padding.left - padding.right) / Math.max(weeks.length, 1);
  const barWidth = Math.max(3, Math.min(10, step * 0.58));
  const ticks = [0, Math.ceil(max / 2), max];

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Weekly GitHub commit activity for the last ${weeks.length} weeks`}
        className="h-[150px] w-full sm:h-[176px]"
      >
        <defs>
          <linearGradient id="homeCommitGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity=".55" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = baseline - (tick / max) * graphHeight;
          return (
            <line
              key={tick}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="#e9edf3"
              strokeDasharray={tick === 0 ? undefined : "3 5"}
            />
          );
        })}
        {weeks.map((week, index) => {
          const barHeight = (week.commits / max) * graphHeight;
          const x = padding.left + step * index + (step - barWidth) / 2;
          const labelIndex = [0, 12, 25, 38, 51];
          return (
            <g key={week.week}>
              <title>{`${week.commits} commits in week ${index + 1}`}</title>
              <rect
                x={x}
                y={baseline - barHeight}
                width={barWidth}
                height={Math.max(week.commits > 0 ? 2 : 0, barHeight)}
                rx="2.5"
                fill="url(#homeCommitGradient)"
              />
              {labelIndex.includes(index) && (
                <text
                  x={x + barWidth / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                >
                  {index === 51 ? "Now" : `${52 - index}w`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-between text-[9px] text-slate-400">
        <span>52 weeks ago</span>
        <span>Weekly commits across your recently active repositories</span>
        <span>Now</span>
      </div>
    </div>
  );
}

function ProjectCard({ uid, project }: { uid: string; project: Project }) {
  const { repository, history, latestCommit } = project;
  const weeklyActivity = history.weeklyActivity ?? [];
  const peak = Math.max(...weeklyActivity, 1);
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_10px_30px_-26px_rgba(15,23,42,.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-26px_rgba(15,23,42,.4)]">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <Link href={projectHref(uid, project)} className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <Github size={15} className="shrink-0 text-slate-500" />
              <span className="truncate text-[12px] font-semibold text-indigo-700 group-hover:underline">
                {repository.fullName}
              </span>
            </span>
          </Link>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-wide ${
              repository.visibility === "private"
                ? "bg-slate-100 text-slate-600"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {repository.visibility === "private" ? (
              <LockKeyhole size={9} />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
            {repository.visibility}
          </span>
        </div>

        <p className="mt-2 min-h-[34px] line-clamp-2 text-[10px] leading-relaxed text-slate-500">
          {repository.description || "No description provided."}
        </p>

        <div className="mt-3 flex items-center gap-3 text-[9px] text-slate-500">
          {repository.language && (
            <span className="max-w-[40%] truncate rounded-full bg-slate-50 px-2 py-1 font-medium text-slate-600">
              {repository.language}
            </span>
          )}
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <GitBranch size={10} /> {repository.defaultBranch}
          </span>
          <span className="ml-auto shrink-0">{formatDate(repository.pushedAt ?? "")}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#f7f8fc] px-3 py-2">
            <p className="text-[8px] font-medium uppercase tracking-wide text-slate-400">
              Commits · 12 months
            </p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums text-slate-900">
              {history.weeklyActivity
                ? formatNumber(history.commitsLastYear)
                : "Pending"}
            </p>
          </div>
          <div className="rounded-xl bg-indigo-50/70 px-3 py-2">
            <p className="text-[8px] font-medium uppercase tracking-wide text-indigo-400">
              Commits · 5 weeks
            </p>
            <p className="mt-1 text-[16px] font-semibold tabular-nums text-indigo-800">
              {history.weeklyActivity
                ? formatNumber(history.commitsLastFiveWeeks)
                : "Pending"}
            </p>
          </div>
        </div>

        <div
          className="mt-3 flex h-8 items-end gap-[2px]"
          aria-label={`Weekly commit activity, ${history.commitsLastYear} commits this year`}
        >
          {weeklyActivity.slice(-26).map((count, index) => (
            <span
              key={`${repository.id}-week-${index}`}
              title={`${count} commits`}
              className={`min-w-0 flex-1 rounded-t-[2px] ${
                count > 0 ? "bg-indigo-400 group-hover:bg-indigo-500" : "bg-slate-100"
              }`}
              style={{ height: `${Math.max(count > 0 ? 12 : 5, (count / peak) * 100)}%` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[9px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <GitFork size={10} /> {formatNumber(repository.forks)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Star size={10} /> {formatNumber(repository.stars)}
          </span>
          {latestCommit && (
            <span className="ml-auto inline-flex min-w-0 items-center gap-1 truncate">
              <GitCommitHorizontal size={10} />
              {latestCommit.author} · {formatDate(latestCommit.date)}
            </span>
          )}
        </div>
        {latestCommit ? (
          <a
            href={latestCommit.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block truncate text-[10px] font-medium text-slate-700 hover:text-indigo-700"
          >
            {latestCommit.message.split("\n")[0] || "Latest commit"}
          </a>
        ) : (
          <p className="mt-2 text-[10px] text-slate-400">No commit history is available.</p>
        )}
      </div>
    </article>
  );
}

export function GitHubHomeDashboard({ uid }: { uid: string }) {
  const pathname = usePathname();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disconnected, setDisconnected] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestController = useRef<AbortController | null>(null);

  const loadOverview = useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError("");
    setDisconnected(false);
    try {
      const response = await fetch("/api/github/overview", {
        cache: "no-store",
        signal: controller.signal,
      });
      const result = (await response.json()) as Overview & { error?: string };
      if (controller.signal.aborted) return;
      if (response.status === 409) {
        setOverview(null);
        setDisconnected(true);
        return;
      }
      if (!response.ok) {
        throw new Error(result.error || "Project activity could not be loaded.");
      }
      setOverview(result);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      if (controller.signal.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Project activity could not be loaded.",
      );
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (pathname !== `/${uid}`) return;
    void loadOverview();
    return () => requestController.current?.abort();
  }, [loadOverview, pathname, uid]);

  useEffect(() => {
    if (pathname !== `/${uid}`) return;
    const scheduleOverview = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        void loadOverview();
      }, 180);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) scheduleOverview();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleOverview();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [loadOverview, pathname, uid]);

  return (
    <section className="relative left-1/2 min-h-[calc(100dvh-64px)] w-screen -translate-x-1/2 bg-[#f6f7fb] px-4 pb-12 pt-5 text-slate-900 sm:px-6 sm:pt-7">
      <div className="mx-auto max-w-[1180px]">
        {loading && !overview && !error && !disconnected ? (
          <DashboardSkeleton />
        ) : error ? (
          <div
            role="alert"
            className="mx-auto mt-10 flex max-w-[620px] flex-col items-center rounded-[24px] border border-rose-100 bg-white px-6 py-10 text-center shadow-sm"
          >
            <Activity size={25} className="text-rose-500" />
            <h1 className="mt-3 text-[15px] font-semibold text-slate-900">
              Project activity could not be loaded
            </h1>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{error}</p>
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-[11px] font-semibold text-white"
            >
              Try again <RefreshCw size={13} />
            </button>
          </div>
        ) : disconnected || (overview && overview.projects.length === 0) ? (
          <div className="mx-auto flex min-h-[58vh] max-w-[640px] flex-col items-center justify-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
              <Github size={24} />
            </span>
            <h1 className="mt-5 text-[20px] font-semibold tracking-tight text-slate-900">
              No project activity yet
            </h1>
            <p className="mt-2 max-w-[340px] text-[12px] leading-relaxed text-slate-500">
              Your project history and account activity will appear here when repository data is available.
            </p>
          </div>
        ) : overview ? (
          <>
            <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[.17em] text-indigo-600">
                  CheyaVerse · Project journal
                </p>
                <h1 className="mt-1 text-[23px] font-semibold tracking-[-.045em] text-slate-950 sm:text-[28px]">
                  Repository activity
                </h1>
                <p className="mt-1 text-[11px] text-slate-500">
                  Personal projects, release history, and repository momentum.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {overview.stats.hasMore && (
                  <span className="hidden text-[9px] text-slate-400 sm:inline">
                    Summary covers the first 100 accessible repositories
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Refresh project activity"
                  disabled={loading}
                  onClick={() => void loadOverview()}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm disabled:opacity-50"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
            </header>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                {
                  label: "Repositories",
                  value: formatNumber(overview.stats.repositories),
                  note: "Accessible repositories",
                  icon: Github,
                },
                {
                  label: "Commits · 12 months",
                  value: formatNumber(overview.stats.commitsLastYear),
                  note: "Across active projects",
                  icon: GitCommitHorizontal,
                },
                {
                  label: "Stars & forks",
                  value: `${formatNumber(overview.stats.stars)} / ${formatNumber(overview.stats.forks)}`,
                  note: "Account-wide totals",
                  icon: GitFork,
                },
                {
                  label: "Active projects",
                  value: formatNumber(overview.stats.activeThisMonth),
                  note: "Pushed within 30 days",
                  icon: Activity,
                },
              ].map(({ label, value, note, icon: Icon }) => (
                <article
                  key={label}
                  className="min-w-0 rounded-[19px] border border-slate-200/80 bg-white p-3.5 shadow-[0_9px_24px_-26px_rgba(15,23,42,.3)] sm:p-4"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-indigo-50 text-indigo-600">
                    <Icon size={15} />
                  </span>
                  <p className="mt-3 truncate text-[19px] font-semibold leading-none tracking-[-.04em] tabular-nums text-slate-950 sm:text-[22px]">
                    {value}
                  </p>
                  <p className="mt-2 truncate text-[9px] font-semibold text-slate-700">{label}</p>
                  <p className="mt-0.5 truncate text-[8px] text-slate-400">{note}</p>
                </article>
              ))}
            </div>

            <section className="mt-4 rounded-[23px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_-28px_rgba(15,23,42,.35)] sm:p-6">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-[.14em] text-indigo-600">
                    Account statistics
                  </p>
                  <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-slate-900">
                    Commit activity over time
                  </h2>
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-[9px] font-semibold text-indigo-700">
                  {formatNumber(overview.stats.commitsLastFiveWeeks)} commits · last 5 weeks
                </span>
              </div>
              <WeeklyChart weeks={overview.accountActivity} />
              <p className="mt-2 text-center text-[8px] text-slate-400">
              Weekly statistics are provided by GitHub and may be unavailable briefly for recently updated repositories ({overview.stats.repositoriesWithHistory} of {overview.projects.length} tracked projects ready).
              </p>
            </section>

            <div className="mb-3 mt-7 flex items-end justify-between gap-3">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[.14em] text-indigo-600">
                  Your projects
                </p>
                <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-slate-950">
                  Recent repository history
                </h2>
              </div>
              <Link
                href={`/${uid}/keranjang`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-[9px] font-semibold text-slate-600"
              >
                Browse all <ArrowRight size={12} />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {overview.projects.map((project) => (
                <ProjectCard key={project.repository.id} uid={uid} project={project} />
              ))}
            </div>

            <section className="mt-7">
              <div className="mb-3">
                <p className="text-[8px] font-bold uppercase tracking-[.14em] text-indigo-600">
                  Activity ranking
                </p>
                <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-slate-950">
                  Projects with the most history
                </h2>
                <p className="mt-1 text-[9px] text-slate-500">
                  Ranked by commits across the last 12 months, then recent activity.
                </p>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {overview.popular.slice(0, 3).map((project, index) => (
                  <Link
                    key={project.repository.id}
                    href={projectHref(uid, project)}
                    className="group flex min-w-0 items-center gap-3 rounded-[18px] border border-slate-200/80 bg-white p-3.5 shadow-[0_8px_24px_-25px_rgba(15,23,42,.35)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-indigo-50 text-[12px] font-bold text-indigo-700">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[11px] font-semibold text-slate-800">
                          {project.repository.name}
                        </span>
                        {project.repository.visibility === "private" && (
                          <LockKeyhole size={10} className="shrink-0 text-slate-400" />
                        )}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[9px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <GitCommitHorizontal size={10} />
                          {formatNumber(project.history.commitsLastYear)} commits
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <GitFork size={10} /> {formatNumber(project.repository.forks)}
                        </span>
                      </span>
                    </span>
                    <ArrowUpRight
                      size={14}
                      className="shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : (
          <DashboardSkeleton />
        )}
      </div>
    </section>
  );
}
