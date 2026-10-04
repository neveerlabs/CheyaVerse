"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { reportClientError } from "@/lib/client-errors";
import { readApiJson } from "@/lib/read-api-json";
import {
  Activity,
  ArrowRight,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  Github,
  LockKeyhole,
  RefreshCw,
  Star,
  Tag,
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
    commitActivity: Array<{
      sha: string;
      url: string;
      message: string;
      date: string;
      additions: number;
      deletions: number;
      changedLines: number;
    }>;
    commitsLastYear: number;
    commitsLastFiveWeeks: number;
    commitsLastMonth: number;
    commitsLastMonthCapped: boolean;
    activeWeeks: number;
    activeMonths: number;
    activityRuns: number;
    recentChanges: {
      additions: number;
      deletions: number;
      averageLinesChanged: number;
      measuredCommits: number;
    };
  };
  latestCommit: {
    sha: string;
    url: string;
    message: string;
    author: string;
    date: string;
  } | null;
  latestRelease: {
    tagName: string;
    name: string | null;
    url: string;
    publishedAt: string | null;
    prerelease: boolean;
  } | null;
  rankingScore: number;
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
  featuredProjectId: number | null;
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
  return `/${uid}/project/${encodeURIComponent(project.repository.fullName.split("/")[0])}/${encodeURIComponent(project.repository.name)}`;
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
      <div className="h-[270px] rounded-[26px] bg-white" />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-[230px] rounded-[22px] bg-white" />
        ))}
      </div>
      <span className="sr-only">Loading your GitHub project activity</span>
    </div>
  );
}

function ActivitySparkline({
  activity,
  commitCount,
  capped,
  wide = false,
  compact = false,
}: {
  activity: Project["history"]["commitActivity"];
  commitCount: number;
  capped: boolean;
  wide?: boolean;
  compact?: boolean;
}) {
  if (activity.length === 0) {
    return (
      <p className={`${wide ? "min-w-0 flex-1" : "w-[48%] min-w-[132px] max-w-[260px] shrink-0"} text-right text-[9px] text-slate-400`}>
        No recent updates
      </p>
    );
  }
  const width = wide ? 800 : 260;
  const height = 42;
  const max = Math.max(
    1,
    ...activity.map((commit) => Math.log1p(commit.changedLines)),
  );
  const points = activity.map((commit, index) => ({
    commit,
    x: activity.length === 1 ? width / 2 : 2 + (index / (activity.length - 1)) * (width - 4),
    y: height - 5 - (Math.log1p(commit.changedLines) / max) * 27,
  }));
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `${points[0].x},${height} ${line} ${points[points.length - 1].x},${height}`;
  const dotRadius = Math.max(0.65, Math.min(2, width / activity.length / 2));
  return (
    <div className={wide ? "min-w-0 flex-1" : "w-[48%] min-w-[132px] max-w-[260px] shrink-0"}>
      <div className="mb-0.5 flex items-center justify-between gap-2 text-[8px]">
        <p className="font-medium text-slate-500">Velocity trend</p>
        {wide && (
          <p className="text-slate-400">
            {formatNumber(commitCount)} commits · last 30 days
            {capped ? " · latest 1,000 shown" : ""}
          </p>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${formatNumber(commitCount)} commits in the last 30 days${capped ? "; chart limited to the latest 1,000 commits" : ""}; each point represents one commit and its changed lines`}
        className={`block w-full overflow-visible ${compact ? "h-[30px]" : "h-[38px]"}`}
        preserveAspectRatio="none"
      >
        <polygon points={area} fill="rgb(124 58 237 / 12%)" />
        <polyline
          points={line}
          fill="none"
          stroke="rgb(124 58 237 / 60%)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map(({ commit, x, y }) => (
          <circle
            key={commit.sha}
            cx={x}
            cy={y}
            r={dotRadius}
            fill="#a995c5"
            stroke="white"
            strokeWidth="0.65"
          >
            <title>
              {`${formatDate(commit.date)} · ${commit.message} · +${formatNumber(commit.additions)} / −${formatNumber(commit.deletions)} lines`}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function ProjectCard({ uid, project }: { uid: string; project: Project }) {
  const { repository, latestCommit, latestRelease } = project;
  const averageChange = project.history.recentChanges.measuredCommits
    ? Math.round(project.history.recentChanges.averageLinesChanged)
    : null;
  return (
    <article className="group min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_10px_30px_-26px_rgba(15,23,42,.35)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-26px_rgba(15,23,42,.4)]">
      <div className="p-3 sm:p-4">
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

        <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500">
          {repository.description || "No description provided."}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          {latestRelease ? (
            <a
              href={latestRelease.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1 text-[9px] font-semibold text-violet-700 hover:bg-violet-100"
            >
              <Tag size={10} className="shrink-0" />
              <span className="truncate">{latestRelease.tagName}</span>
              {latestRelease.prerelease && <span className="shrink-0 font-medium">pre-release</span>}
            </a>
          ) : <span />}
          <ActivitySparkline
            activity={project.history.commitActivity}
            commitCount={project.history.commitsLastMonth}
            capped={project.history.commitsLastMonthCapped}
            compact
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9px] text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-medium text-slate-600">
            {repository.language || "Unknown"}
          </span>
          <span className="inline-flex items-center gap-1 truncate">
            <GitBranch size={10} /> {repository.defaultBranch}
          </span>
          <span className="ml-auto">{formatDate(repository.pushedAt ?? "")}</span>
        </div>
        <div className="mt-2 border-t border-slate-100 pt-2">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9px] text-slate-500">
            <span className="inline-flex items-center gap-1"><GitCommitHorizontal size={10} /> {formatNumber(project.history.commitsLastMonth)} commits / 30d</span>
            <span className="inline-flex items-center gap-1"><Activity size={10} /> {project.history.activeMonths} active months · {project.history.activityRuns} cycles</span>
            <span className="inline-flex items-center gap-1"><GitFork size={10} /> {formatNumber(repository.forks)}</span>
            <span className="inline-flex items-center gap-1"><Star size={10} /> {formatNumber(repository.stars)}</span>
            <span className="inline-flex items-center gap-1">
              <Activity size={10} />
              {averageChange === null ? "Change data unavailable" : `~${formatNumber(averageChange)} lines / ${project.history.commitsLastMonthCapped ? "measured commit" : "commit"}`}
            </span>
          </div>
          <p className="mt-1 truncate text-[9px] text-slate-500">
            {latestCommit ? (
              <a href={latestCommit.url} target="_blank" rel="noreferrer" className="font-medium text-slate-700 hover:text-indigo-700">
                {latestCommit.message.split("\n")[0] || "Latest commit"}
              </a>
            ) : "No recent commit available."}
          </p>
        </div>
      </div>
    </article>
  );
}

function FeaturedProjectCard({ uid, project }: { uid: string; project: Project }) {
  const { repository, latestCommit, latestRelease, history } = project;
  const average = history.recentChanges.measuredCommits
    ? Math.round(history.recentChanges.averageLinesChanged)
    : null;
  return (
    <article className="overflow-hidden rounded-[26px] border border-violet-100 bg-white shadow-[0_18px_48px_-34px_rgba(79,70,229,.5)]">
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={projectHref(uid, project)} className="flex min-w-0 items-center gap-2 text-indigo-800 hover:underline">
              <Github size={18} className="shrink-0 text-slate-500" />
              <span className="truncate text-[15px] font-bold sm:text-[18px]">{repository.fullName}</span>
            </Link>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-wide ${repository.visibility === "private" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>
            {repository.visibility === "private" ? <LockKeyhole size={9} /> : <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            {repository.visibility}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
          {repository.description || "No description provided."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-violet-50/80 px-3 py-2">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-violet-600">Commits · 30d</p>
            <p className="mt-0.5 text-[15px] font-bold text-slate-900">{formatNumber(history.commitsLastMonth)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">{history.commitsLastMonthCapped ? "Avg. change / measured commit" : "Avg. change / commit"}</p>
            <p className="mt-0.5 text-[15px] font-bold text-slate-900">{average === null ? "—" : `${formatNumber(average)} lines`}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Active months</p>
            <p className="mt-0.5 text-[15px] font-bold text-slate-900">{history.activeMonths}<span className="ml-1 text-[10px] font-medium text-slate-400">/ 12 mo</span></p>
            <p className="mt-0.5 text-[8px] text-slate-500">{history.activityRuns} separate activity cycles</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Popularity</p>
            <p className="mt-0.5 flex items-center gap-2 text-[13px] font-bold text-slate-900">
              <span className="inline-flex items-center gap-1"><Star size={11} />{formatNumber(repository.stars)}</span>
              <span className="inline-flex items-center gap-1"><GitFork size={11} />{formatNumber(repository.forks)}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[9px] text-slate-500">
            <span className="rounded-full bg-slate-50 px-2.5 py-1 font-medium text-slate-600">{repository.language || "Unknown"}</span>
            <span className="inline-flex items-center gap-1"><GitBranch size={11} />{repository.defaultBranch}</span>
            <span>{formatDate(repository.pushedAt ?? "")}</span>
            {latestRelease && (
              <a href={latestRelease.url} target="_blank" rel="noreferrer" className="inline-flex max-w-[150px] items-center gap-1 truncate rounded-lg bg-violet-50 px-2 py-1 font-semibold text-violet-700">
                <Tag size={10} className="shrink-0" />{latestRelease.tagName}
              </a>
            )}
          </div>
        </div>
        <div className="mt-3 min-w-0">
          <ActivitySparkline
            activity={history.commitActivity}
            commitCount={history.commitsLastMonth}
            capped={history.commitsLastMonthCapped}
            wide
          />
        </div>
        {latestCommit && (
          <a href={latestCommit.url} target="_blank" rel="noreferrer" className="mt-3 block truncate border-t border-slate-100 pt-3 text-[10px] font-medium text-slate-700 hover:text-indigo-700">
            <span className="mr-1.5 text-slate-400">{latestCommit.author} · {formatDate(latestCommit.date)}</span>
            {latestCommit.message.split("\n")[0] || "Latest commit"}
          </a>
        )}
        <p className="mt-2 text-[8px] text-slate-400">
          Change size measured for {formatNumber(history.recentChanges.measuredCommits)} of {formatNumber(history.commitsLastMonth)} recent commits · +{formatNumber(history.recentChanges.additions)} / −{formatNumber(history.recentChanges.deletions)} lines
        </p>
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
  const [needsGitHubReconnect, setNeedsGitHubReconnect] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const featuredProject = overview?.projects.find(
    (project) => project.repository.id === overview.featuredProjectId,
  ) ?? overview?.projects[0] ?? null;
  const otherProjects = featuredProject
    ? overview?.projects.filter(
        (project) => project.repository.id !== featuredProject.repository.id,
      ) ?? []
    : overview?.projects ?? [];

  const loadOverview = useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError("");
    setDisconnected(false);
    setNeedsGitHubReconnect(false);
    try {
      let response = await fetch("/api/github/overview", {
        cache: "no-store",
        signal: controller.signal,
      });
      let result = await readApiJson<
        Overview & { error?: string; code?: string }
      >(response);
      if (controller.signal.aborted) return;
      if (response.status === 409 && result.code === "GITHUB_NOT_CONNECTED") {
        const settingsResponse = await fetch("/api/github/settings", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (settingsResponse.ok) {
          const settings = await readApiJson<{
            connected?: boolean;
            tokenReadable?: boolean | null;
          }>(settingsResponse);
          if (
            settings.connected === true &&
            settings.tokenReadable === true &&
            !controller.signal.aborted
          ) {
            response = await fetch("/api/github/overview", {
              cache: "no-store",
              signal: controller.signal,
            });
            result = await readApiJson<
              Overview & { error?: string; code?: string }
            >(response);
          }
        }
      }
      if (controller.signal.aborted) return;
      if (response.status === 409) {
        setOverview(null);
        setDisconnected(true);
        if (
          result.code === "GITHUB_RECONNECT_REQUIRED" &&
          result.error
        ) {
          setError(result.error);
          setNeedsGitHubReconnect(true);
          setDisconnected(false);
        }
        return;
      }
      if (!response.ok) {
        throw new Error(result.error || "Project activity could not be loaded.");
      }
      setOverview(result);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const failure = cause instanceof Error
        ? cause
        : new Error("Project activity could not be loaded.");
      reportClientError(failure, "GitHub project activity");
      setError(
        failure.message,
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
    <section className="relative left-1/2 min-h-[100dvh] w-screen -translate-x-1/2 bg-[#f6f7fb] px-4 pb-12 pt-5 text-slate-900 sm:px-6 sm:pt-7">
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
            {needsGitHubReconnect && (
              <Link
                href={`/${uid}/profile/settings`}
                className="mt-4 rounded-full bg-slate-900 px-4 py-2.5 text-[11px] font-semibold text-white"
              >
                Open GitHub settings
              </Link>
            )}
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
              {disconnected ? "Connect your GitHub account" : "No project activity yet"}
            </h1>
            <p className="mt-2 max-w-[340px] text-[12px] leading-relaxed text-slate-500">
              {disconnected
                ? "Connect or reconnect GitHub in Settings to load your repositories and project activity."
                : overview?.stats.repositories === 0
                  ? "GitHub accepted the connection but returned no accessible repositories. Classic tokens need the repo scope for private repositories; organization repositories may require SSO authorization."
                  : "GitHub repositories are connected, but no activity data is available yet."}
            </p>
            {disconnected && (
              <Link
                href={`/${uid}/profile/settings`}
                className="mt-4 rounded-full bg-slate-900 px-4 py-2.5 text-[11px] font-semibold text-white"
              >
                Open GitHub settings
              </Link>
            )}
          </div>
        ) : overview ? (
          <>
            <header className="mb-3 flex items-center justify-between gap-3 rounded-[20px] border border-slate-200/80 bg-white/85 px-3.5 py-3 shadow-[0_8px_24px_-24px_rgba(15,23,42,.45)] sm:px-4">
              <div className="min-w-0">
                <p className="text-[8px] font-bold uppercase tracking-[.14em] text-indigo-600">
                  GitHub projects
                </p>
                <h1 className="mt-0.5 text-[17px] font-semibold tracking-tight text-slate-950 sm:text-[19px]">
                  Repository activity
                </h1>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Your standout project and recent repository history.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/${uid}/project`}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-2 text-[9px] font-semibold text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-700 sm:px-3"
                >
                  Browse all <ArrowRight size={11} />
                </Link>
                <button
                  type="button"
                  aria-label="Refresh project activity"
                  disabled={loading}
                  onClick={() => void loadOverview()}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
            </header>
            {featuredProject && (
              <div className="mb-3 pt-1">
                <FeaturedProjectCard uid={uid} project={featuredProject} />
              </div>
            )}
            {otherProjects.length > 0 && (
              <div className="grid items-stretch gap-3 sm:grid-cols-2">
                {otherProjects.map((project) => (
                  <ProjectCard key={project.repository.id} uid={uid} project={project} />
                ))}
              </div>
            )}
          </>
        ) : (
          <DashboardSkeleton />
        )}
      </div>
    </section>
  );
}
