"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitCommit,
  GitFork,
  Github,
  Globe2,
  LockKeyhole,
  RefreshCw,
  Rocket,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

type RepositoryDetails = {
  id: number;
  name: string;
  fullName: string;
  url: string;
  visibility: "public" | "private";
  description: string | null;
  createdAt: string;
  updatedAt: string;
  pushedAt: string | null;
  defaultBranch: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  sizeKb: number;
  archived: boolean;
  disabled: boolean;
};

type Production = {
  environment: string;
  createdAt: string;
  sha: string;
  ref: string;
  state: string;
  url: string | null;
  logUrl: string | null;
};

type Workflow = {
  id: number;
  name: string;
  html_url: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
};

type Release = {
  id: number;
  tagName: string;
  name: string | null;
  body: string | null;
  url: string;
  createdAt: string;
  publishedAt: string | null;
  targetCommitish: string;
  prerelease: boolean;
  draft: boolean;
  assets: Array<{
    id: number;
    name: string;
    url: string;
    size: number;
    downloads: number;
  }>;
};

type ProjectSummary = {
  repository: RepositoryDetails;
  branches: Array<{ name: string; protected: boolean }>;
  languages: Record<string, number>;
  releases: Release[];
  deployments: Array<{
    id: number;
    environment: string;
    created_at: string;
    sha: string;
    ref: string;
    task: string;
    description: string | null;
  }>;
  production: Production | null;
  workflows: Workflow[];
  traffic: {
    views: number;
    uniqueVisitors: number;
    days: Array<{ timestamp: string; count: number; uniques: number }>;
    clones: number;
    uniqueCloners: number;
    cloneDays: Array<{ timestamp: string; count: number; uniques: number }>;
    referrers: Array<{ referrer: string; count: number; uniques: number }>;
    popularPaths: Array<{ path: string; title: string; count: number; uniques: number }>;
  } | null;
  trafficUnavailableMessage: string | null;
};

type TreeEntry = {
  path: string;
  type: "blob" | "tree" | "commit";
  size: number | null;
  sha: string;
};

type CommitRecord = {
  sha: string;
  url: string;
  message: string;
  author: string;
  date: string;
  additions: number;
  deletions: number;
  changedFiles: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch: string | null;
  }>;
  filesTruncated: boolean;
};

type HistoryResult = {
  range: HistoryRange;
  page: number;
  commits: CommitRecord[];
  totals: { commits: number; additions: number; deletions: number; files: number };
  hasMore: boolean;
  totalPages: number | null;
  statsNote: string;
};

type HistoryRange = "all" | "month" | "week" | "day" | "hour";

const HISTORY_RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: "all", label: "All history" },
  { value: "month", label: "Last month" },
  { value: "week", label: "Last week" },
  { value: "day", label: "Last 24 hours" },
  { value: "hour", label: "Last hour" },
];

function formatDate(value: string, withTime = false): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatBytes(kilobytes: number): string {
  if (kilobytes >= 1024 * 1024) return `${(kilobytes / (1024 * 1024)).toFixed(1)} GB`;
  if (kilobytes >= 1024) return `${(kilobytes / 1024).toFixed(1)} MB`;
  return `${kilobytes} KB`;
}

function apiPath(owner: string, repo: string, suffix = ""): string {
  return `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`;
}

function languageColor(language: string): string {
  const colors: Record<string, string> = {
    TypeScript: "#3178c6",
    JavaScript: "#e9c84a",
    Python: "#3572a5",
    CSS: "#7651a8",
    HTML: "#e34c26",
    Java: "#b07219",
    Go: "#00add8",
    Rust: "#dea584",
    Shell: "#89e051",
    Kotlin: "#a97bff",
    Swift: "#f05138",
  };
  return colors[language] ?? "#718096";
}

function statusColor(value: string): string {
  const state = value.toLowerCase();
  if (state === "success" || state === "completed") return "text-emerald-700 bg-emerald-50";
  if (state === "failure" || state === "failed" || state === "error") return "text-red-700 bg-red-50";
  if (state === "in_progress" || state === "queued" || state === "pending") return "text-amber-800 bg-amber-50";
  return "text-slate-600 bg-slate-100";
}

export function GitHubProjectDashboard({
  uid,
  owner,
  repo,
}: {
  uid: string;
  owner: string;
  repo: string;
}) {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [treeTruncated, setTreeTruncated] = useState(false);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState("");
  const [historyRange, setHistoryRange] = useState<HistoryRange>("all");
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [history, setHistory] = useState<CommitRecord[]>([]);
  const [historyTotals, setHistoryTotals] = useState({
    commits: 0,
    additions: 0,
    deletions: 0,
    files: 0,
  });
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState<number | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyNote, setHistoryNote] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [expandedReleaseId, setExpandedReleaseId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const historyRequestId = useRef(0);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!historyMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!historyMenuRef.current?.contains(event.target as Node)) {
        setHistoryMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [historyMenuOpen]);

  const loadHistory = useCallback(
    async (range: HistoryRange, page: number, append: boolean) => {
      const requestId = ++historyRequestId.current;
      if (append) setHistoryLoadingMore(true);
      else setHistoryLoading(true);
      setHistoryError("");
      try {
        const response = await fetch(
          `${apiPath(owner, repo, "/history")}?range=${range}&page=${page}`,
          { cache: "no-store" },
        );
        const result = (await response.json()) as HistoryResult & { error?: string };
        if (!response.ok || !Array.isArray(result.commits)) {
          throw new Error(result.error || "Commit history could not be loaded.");
        }
        if (requestId !== historyRequestId.current) return;
        setHistory((current) => append ? [...current, ...result.commits] : result.commits);
        setHistoryTotals((current) => append
          ? {
              commits: current.commits + result.totals.commits,
              additions: current.additions + result.totals.additions,
              deletions: current.deletions + result.totals.deletions,
              files: current.files + result.totals.files,
            }
          : result.totals);
        setHistoryPage(result.page);
        setHistoryTotalPages(result.totalPages);
        setHistoryHasMore(result.hasMore);
        setHistoryNote(result.statsNote);
      } catch (cause) {
        if (requestId !== historyRequestId.current) return;
        setHistoryError(cause instanceof Error ? cause.message : "Commit history could not be loaded.");
      } finally {
        if (requestId === historyRequestId.current) {
          setHistoryLoading(false);
          setHistoryLoadingMore(false);
        }
      }
    },
    [owner, repo],
  );

  useEffect(() => {
    let active = true;
    async function loadProject() {
      setSummaryLoading(true);
      setError("");
      setTreeError("");
      setTreeLoading(true);
      try {
        const response = await fetch(apiPath(owner, repo), { cache: "no-store" });
        const result = (await response.json()) as ProjectSummary & { error?: string };
        if (!response.ok || !result.repository) {
          throw new Error(result.error || "Project details could not be loaded.");
        }
        if (!active) return;
        setProject(result);
        const treeResponse = await fetch(
          `${apiPath(owner, repo, "/tree")}?branch=${encodeURIComponent(result.repository.defaultBranch)}`,
          { cache: "no-store" },
        );
        const treeResult = (await treeResponse.json()) as {
          entries?: TreeEntry[];
          truncated?: boolean;
          error?: string;
        };
        if (!treeResponse.ok || !Array.isArray(treeResult.entries)) {
          throw new Error(treeResult.error || "Project structure could not be loaded.");
        }
        if (active) {
          setTree(treeResult.entries);
          setTreeTruncated(treeResult.truncated === true);
        }
      } catch (cause) {
        if (active) {
          const message = cause instanceof Error ? cause.message : "Project details could not be loaded.";
          setError(message);
          setTreeError(message);
        }
      } finally {
        if (active) {
          setSummaryLoading(false);
          setTreeLoading(false);
        }
      }
    }
    void loadProject();
    return () => {
      active = false;
    };
  }, [owner, repo, reloadKey]);

  useEffect(() => {
    setHistory([]);
    setHistoryPage(0);
    setHistoryTotalPages(null);
    setHistoryHasMore(false);
    setHistoryTotals({ commits: 0, additions: 0, deletions: 0, files: 0 });
    void loadHistory(historyRange, 1, false);
  }, [historyRange, loadHistory, reloadKey]);

  const languages = useMemo(() => {
    const values = Object.entries(project?.languages ?? {}).sort((a, b) => b[1] - a[1]);
    const total = values.reduce((sum, [, bytes]) => sum + bytes, 0);
    return values.map(([name, bytes]) => ({
      name,
      percent: total ? (bytes / total) * 100 : 0,
    }));
  }, [project?.languages]);

  const maxTrafficViews = Math.max(
    ...(project?.traffic?.days.map(({ count }) => count) ?? []),
    1,
  );
  const maxCommitChange = Math.max(
    ...history.map((commit) => commit.additions + commit.deletions),
    1,
  );

  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 bg-[#f4f5f9] pb-12 text-slate-900">
      <div className="min-h-[calc(100dvh-56px)] w-full px-4 pb-12 pt-4 sm:px-6 sm:pt-6 lg:px-10">
        <header className="mx-auto mb-5 flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-3 sm:mb-7">
          <Link
            href={`/${uid}/project`}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-600 shadow-sm shadow-slate-900/[0.03] transition hover:text-slate-950"
          >
            <ArrowLeft size={15} /> All projects
          </Link>
          <div className="flex items-center gap-2">
            {project && (
              <span               className="hidden items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-slate-500 sm:inline-flex">
                <Clock3 size={12} /> Updated {formatDate(project.repository.updatedAt)}
              </span>
            )}
            <button
              type="button"
              aria-label="Refresh project details"
              onClick={() => setReloadKey((key) => key + 1)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm shadow-slate-900/[0.03] transition hover:text-slate-950"
            >
              <RefreshCw size={15} className={summaryLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mx-auto mb-5 flex max-w-[1680px] items-start justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-800">
            <span>{error}</span>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} aria-label="Retry" className="shrink-0">
              <RefreshCw size={14} />
            </button>
          </div>
        )}

        {project ? (
          <>
            <section className="mx-auto mb-6 w-full max-w-[1680px] overflow-hidden rounded-[28px] bg-white shadow-[0_12px_40px_-30px_rgba(15,23,42,0.28)] sm:mb-8 sm:rounded-[32px]">
              <div className="relative overflow-hidden px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
                <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-indigo-100/65 blur-3xl" />
                <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/3 h-56 w-56 rounded-full bg-sky-100/60 blur-3xl" />
                <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <span className="absolute right-0 top-0 inline-flex max-w-[48%] items-center justify-end gap-1.5 rounded-full bg-white/85 px-2.5 py-1.5 text-right text-[10px] font-medium text-slate-500 shadow-sm shadow-slate-900/[0.04] sm:right-0 sm:top-0 sm:px-3 sm:text-[12px]">
                    <GitCommit size={12} className="shrink-0 text-indigo-500" />
                    <span className="shrink-0">Last push</span>
                    <span className="truncate text-slate-800">
                      {project.repository.pushedAt
                        ? formatDate(project.repository.pushedAt)
                        : "None"}
                    </span>
                  </span>
                  <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-lg shadow-slate-900/15 sm:h-[68px] sm:w-[68px]">
                      <Github size={28} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <div className="mb-3 flex min-h-8 flex-wrap items-center gap-2 pr-[48%] sm:pr-0">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
                          project.repository.visibility === "private"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-emerald-50 text-emerald-700"
                        }`}>
                          {project.repository.visibility === "private" ? <LockKeyhole size={10} /> : <Globe2 size={10} />}
                          {project.repository.visibility}
                        </span>
                        {project.repository.archived && (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">Archived</span>
                        )}
                        {project.repository.disabled && (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">Disabled</span>
                        )}
                      </div>
                      <h1 className="min-w-0 break-words text-[23px] font-bold leading-tight tracking-[-.04em] text-slate-950 sm:text-[30px] lg:text-[34px]">
                        {project.repository.name}
                      </h1>
                      <p className="mt-1 break-all font-mono text-[12px] text-slate-500 sm:text-[13px]">
                        {project.repository.fullName}
                      </p>
                      <p className="mt-3 max-w-[760px] text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
                        {project.repository.description || "No project description provided."}
                      </p>
                    </div>
                  </div>
                  <div className="relative flex shrink-0 flex-wrap items-center gap-2 md:ml-auto md:pt-10">
                    <span className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white/80 px-4 text-[13px] font-semibold text-slate-700 shadow-sm shadow-slate-900/[0.04]">
                      <GitBranch size={14} className="text-indigo-600" />
                      <span className="max-w-[145px] truncate">{project.repository.defaultBranch}</span>
                    </span>
                    <a
                      href={project.repository.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-[13px] font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:bg-slate-800"
                    >
                      Open on GitHub <ArrowUpRight size={14} />
                    </a>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-slate-100/80 bg-white/70 px-5 py-4 sm:grid-cols-4 sm:gap-5 sm:px-8 lg:px-10">
                <Kpi icon={<Star size={15} />} label="Stars" value={formatCount(project.repository.stars)} />
                <Kpi icon={<GitFork size={15} />} label="Forks" value={formatCount(project.repository.forks)} />
                <Kpi icon={<Activity size={15} />} label="Open issues" value={formatCount(project.repository.openIssues)} />
                <Kpi icon={<FileCode2 size={15} />} label="Repository size" value={formatBytes(project.repository.sizeKb)} />
              </div>
            </section>

            {project.releases.length > 0 && (
              <section className="mx-auto mb-6 w-full max-w-[1680px] rounded-[26px] bg-white px-5 py-5 shadow-[0_12px_40px_-32px_rgba(15,23,42,0.3)] sm:mb-8 sm:rounded-[30px] sm:px-8 sm:py-7 lg:px-10">
                <SectionHeading
                  icon={<Tag size={16} />}
                  eyebrow="Versions"
                  title="GitHub releases"
                  detail={`${project.releases.length} release${project.releases.length === 1 ? "" : "s"}`}
                />
                <p className="mt-1 text-[12px] text-slate-400">
                  Asset downloads and change compared with the next older release.
                </p>
                <div className="mt-5 space-y-1 divide-y divide-slate-100">
                  {project.releases.map((release, index) => {
                    const expanded = expandedReleaseId === release.id;
                    const downloads = release.assets.reduce(
                      (total, asset) => total + asset.downloads,
                      0,
                    );
                    const previousRelease = project.releases[index + 1];
                    const previousDownloads = previousRelease?.assets.reduce(
                      (total, asset) => total + asset.downloads,
                      0,
                    );
                    const downloadChange =
                      previousDownloads && previousDownloads > 0
                        ? ((downloads - previousDownloads) / previousDownloads) * 100
                        : null;
                    const latestStable = project.releases.find(
                      (item) => !item.prerelease && !item.draft,
                    )?.id === release.id;

                    return (
                      <article
                        key={release.id}
                        className={`overflow-hidden rounded-2xl px-2 transition-colors sm:px-3 ${
                          expanded ? "bg-indigo-50/70" : "hover:bg-slate-50/80"
                        }`}
                      >
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() =>
                              setExpandedReleaseId((current) =>
                                current === release.id ? null : release.id,
                              )
                            }
                            className="min-w-0 flex-1 px-2 py-4 text-left sm:px-3"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-[14px] font-semibold text-slate-900 sm:text-[15px]">
                                {release.name || release.tagName}
                              </span>
                              {latestStable && (
                                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                  Latest
                                </span>
                              )}
                              {release.prerelease && (
                                <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                                  Pre-release
                                </span>
                              )}
                              {!latestStable && !release.prerelease && (
                                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                                  Stable
                                </span>
                              )}
                              <ChevronDown
                                size={14}
                                className={`ml-auto shrink-0 text-slate-400 transition-transform ${
                                  expanded ? "rotate-180" : ""
                                }`}
                              />
                            </span>
                            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500 sm:text-[12px]">
                              <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono font-semibold text-slate-700">
                                {release.tagName}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <GitBranch size={10} />
                                {release.targetCommitish || project.repository.defaultBranch}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock3 size={10} />
                                {formatDate(release.createdAt, true)}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 font-semibold ${
                                  downloadChange === null
                                    ? "text-slate-500"
                                    : downloadChange > 0
                                      ? "text-emerald-700"
                                      : downloadChange < 0
                                        ? "text-rose-700"
                                        : "text-slate-500"
                                }`}
                              >
                                {downloadChange === null ? (
                                  <Download size={10} />
                                ) : downloadChange > 0 ? (
                                  <TrendingUp size={10} />
                                ) : downloadChange < 0 ? (
                                  <TrendingDown size={10} />
                                ) : (
                                  <Download size={10} />
                                )}
                                {downloads} downloads
                                {downloadChange !== null &&
                                  ` · ${downloadChange > 0 ? "+" : ""}${downloadChange.toFixed(1)}%`}
                                {previousRelease && previousDownloads === 0 && downloads > 0 &&
                                  " · new"}
                                {!previousRelease && " · baseline"}
                              </span>
                            </span>
                          </button>
                          <a
                            href={release.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${release.name || release.tagName} on GitHub`}
                            className="my-2 flex w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white hover:text-indigo-600 sm:w-12"
                          >
                            <ExternalLink size={15} />
                          </a>
                        </div>
                        {expanded && (
                          <div className="px-3 pb-4 sm:px-4">
                            <div className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-600">
                              {release.body?.trim() || "No release notes provided."}
                            </div>
                            {release.assets.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {release.assets.map((asset) => (
                                  <a
                                    key={asset.id}
                                    href={asset.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-medium text-slate-600 shadow-sm shadow-slate-900/[0.04] hover:text-indigo-700"
                                  >
                                    <Download size={11} className="shrink-0" />
                                    <span className="truncate">{asset.name}</span>
                                    <span className="shrink-0 text-slate-400">
                                      {formatBytes(asset.size / 1024)} · {formatCount(asset.downloads)}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="mx-auto grid w-full max-w-[1680px] grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
              <main className="min-w-0 space-y-5">
                <section className="rounded-[26px] bg-white p-5 shadow-[0_12px_40px_-32px_rgba(15,23,42,0.3)] sm:rounded-[30px] sm:p-7 lg:p-8">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <SectionHeading
                        icon={<Activity size={16} />}
                        eyebrow="Development"
                        title="Commit activity"
                        detail={`${history.length} of ${historyTotalPages ? formatCount(historyTotalPages * 3) : "available"} commits loaded · additions and removals`}
                      />
                    </div>
                    <div className="relative z-20" ref={historyMenuRef}>
                      <button
                        type="button"
                        aria-label="History period"
                        aria-haspopup="menu"
                        aria-expanded={historyMenuOpen}
                        onClick={() => setHistoryMenuOpen((open) => !open)}
                        className="flex h-10 min-w-[142px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        {HISTORY_RANGES.find((item) => item.value === historyRange)?.label}
                        <ChevronDown size={14} className={`transition-transform ${historyMenuOpen ? "rotate-180" : ""}`} />
                      </button>
                      {historyMenuOpen && (
                        <div
                          role="menu"
                          aria-label="History period options"
                          className="absolute right-0 top-[calc(100%+8px)] min-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_16px_40px_-18px_rgba(15,23,42,.35)]"
                        >
                          {HISTORY_RANGES.map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              role="menuitemradio"
                              aria-checked={historyRange === item.value}
                              onClick={() => {
                                setHistoryRange(item.value);
                                setHistoryMenuOpen(false);
                              }}
                              className={`block w-full whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-[12px] font-medium transition ${
                                historyRange === item.value
                                  ? "bg-indigo-50 text-indigo-700"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
                    <ChartStat label="Commits" value={historyTotals.commits} />
                    <ChartStat label="Lines added" value={historyTotals.additions} tone="green" />
                    <ChartStat label="Lines removed" value={historyTotals.deletions} tone="red" />
                    <ChartStat label="Files changed" value={historyTotals.files} />
                  </div>

                  {history.length > 0 ? (
                    <div className="mt-5">
                      <div className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-[11px]">
                        <span>Lines changed per commit</span>
                        <span>Peak {formatCount(maxCommitChange)}</span>
                      </div>
                      <CommitChart
                        commits={history.slice(0, 24).reverse()}
                        maxValue={maxCommitChange}
                      />
                      <div className="mt-3 flex items-center justify-center gap-5 text-[11px] font-medium text-slate-500">
                        <Legend color="bg-emerald-500" label="Lines added" />
                        <Legend color="bg-rose-400" label="Lines removed" />
                      </div>
                    </div>
                  ) : historyLoading ? (
                    <div
                      role="status"
                      aria-label="Loading commit activity chart"
                      className="mt-5 h-[180px] animate-pulse rounded-2xl bg-[linear-gradient(90deg,#f8fafc_25%,#eef2ff_45%,#f8fafc_65%)] bg-[length:200%_100%]"
                    />
                  ) : (
                    <p className="mt-5 bg-slate-50/70 px-4 py-8 text-center text-[11px] text-slate-500">
                      {historyError || "No commits found in this period."}
                    </p>
                  )}
                  {historyError && history.length > 0 && (
                    <p role="alert" className="mt-3 text-[12px] text-red-700">{historyError}</p>
                  )}
                  {historyTotalPages && historyRange === "all" && (
                    <p className="mt-3 text-center text-[11px] text-slate-400">
                      About {formatCount(historyTotalPages * 3)} commits in available history · details load three at a time
                    </p>
                  )}
                  <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">{historyNote}</p>
                </section>

                <section className="rounded-[26px] bg-white p-5 shadow-[0_12px_40px_-32px_rgba(15,23,42,0.3)] sm:rounded-[30px] sm:p-7 lg:p-8">
                  <SectionHeading
                    icon={<GitCommit size={16} />}
                    eyebrow="Recent changes"
                    title="Commit history"
                    detail={`${history.length} commits shown · loaded three at a time`}
                  />
                  {historyLoading && history.length === 0 ? (
                  <div
                    role="status"
                    aria-label="Loading recent commits"
                    className="mt-4 space-y-3"
                  >
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        className="flex gap-3 py-4"
                      >
                        <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-indigo-50" />
                        <span className="min-w-0 flex-1 space-y-2">
                          <span className="block h-3 w-4/5 animate-pulse rounded bg-slate-100" />
                          <span className="block h-2.5 w-2/5 animate-pulse rounded bg-slate-50" />
                          <span className="block h-2.5 w-1/3 animate-pulse rounded bg-slate-50" />
                        </span>
                      </div>
                    ))}
                  </div>
                  ) : history.length > 0 ? (
                    <div className="mt-4">
                      {history.map((commit) => (
                        <article key={commit.sha} className="border-t border-slate-100 py-5 first:border-0 first:pt-0 last:pb-0">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                              <GitCommit size={15} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <a href={commit.url} target="_blank" rel="noreferrer" className="break-words text-[14px] font-semibold leading-relaxed text-slate-900 hover:text-indigo-700 sm:text-[15px]">
                                  {commit.message.split("\n")[0] || "Commit"}
                                </a>
                                <a href={commit.url} target="_blank" rel="noreferrer" aria-label="Open commit on GitHub" className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700">
                                  <ArrowUpRight size={14} />
                                </a>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500 sm:text-[12px]">
                                <span className="font-medium text-slate-700">{commit.author}</span>
                                <span className="mx-1.5 text-slate-300">·</span>{formatDate(commit.date, true)}
                                <span className="mx-1.5 text-slate-300">·</span>
                                <span className="font-mono">{commit.sha.slice(0, 8)}</span>
                              </p>
                            </div>
                          </div>
                          <div className="ml-11 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                            <span className="text-slate-500">{commit.changedFiles.length} files</span>
                            <span className="font-semibold text-emerald-700">+{formatCount(commit.additions)}</span>
                            <span className="font-semibold text-rose-600">−{formatCount(commit.deletions)}</span>
                          </div>
                          {commit.changedFiles.length > 0 && (
                            <details className="ml-11 mt-3">
                              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800">
                                Browse changed files <ChevronDown size={12} />
                              </summary>
                              <div className="mt-2 space-y-1.5">
                                {commit.changedFiles.map((file, index) => (
                                  <details key={file.filename} className="rounded-lg">
                                    <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2">
                                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${file.status === "added" ? "bg-emerald-500" : file.status === "removed" ? "bg-rose-500" : "bg-indigo-500"}`} />
                                      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-600 sm:text-[11px]">{file.filename}</span>
                                      <span className="shrink-0 text-[10px] text-emerald-700">+{file.additions}</span>
                                      <span className="shrink-0 text-[10px] text-rose-600">−{file.deletions}</span>
                                    </summary>
                                    {file.patch && index < 20 && (
                                      <pre className="max-h-[280px] overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-200">
                                        <code>{file.patch}</code>
                                      </pre>
                                    )}
                                  </details>
                                ))}
                                {commit.filesTruncated && (
                                  <p className="text-[10px] text-slate-400">GitHub capped this commit’s file list. Open GitHub for the complete diff.</p>
                                )}
                                {commit.changedFiles.length > 20 && (
                                  <p className="text-[10px] text-slate-400">Diff previews are shown for up to 20 files per commit.</p>
                                )}
                              </div>
                            </details>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-[11px] text-slate-500">
                      {historyError || "No commits in this period."}
                    </p>
                  )}
                  {historyHasMore && (
                    <button
                      type="button"
                      disabled={historyLoadingMore}
                      onClick={() => void loadHistory(historyRange, historyPage + 1, true)}
                      className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-200/70 disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={historyLoadingMore ? "animate-spin" : ""} />
                      {historyLoadingMore ? "Loading commit details…" : "Load more history"}
                    </button>
                  )}
                </section>
              </main>

              <aside className="min-w-0 space-y-5">
                <section className="rounded-[26px] bg-white p-5 shadow-[0_12px_40px_-32px_rgba(15,23,42,0.3)] sm:rounded-[30px] sm:p-7 lg:p-8">
                  <SectionHeading
                    icon={<Eye size={16} />}
                    eyebrow="Audience"
                    title="Repository traffic"
                    detail="GitHub aggregate · last 14 days"
                  />
                  {project.traffic ? (
                    <>
                      <div className="mt-5 grid grid-cols-2 gap-4">
                        <TrafficTotal label="Views" value={project.traffic.views} />
                        <TrafficTotal label="Unique visitors" value={project.traffic.uniqueVisitors} />
                        <TrafficTotal label="Clones" value={project.traffic.clones} />
                        <TrafficTotal label="Unique cloners" value={project.traffic.uniqueCloners} />
                      </div>
                      {project.traffic.days.length > 0 && (
                        <div className="mt-5">
                          <TrafficChart days={project.traffic.days} max={maxTrafficViews} />
                        </div>
                      )}
                      {project.traffic.cloneDays.length > 0 && (
                        <div className="mt-4 pt-4">
                          <p className="mb-2 text-[12px] font-semibold text-slate-500">Daily clones</p>
                          <TrafficBars days={project.traffic.cloneDays} color="bg-violet-500" />
                        </div>
                      )}
                      {(project.traffic.referrers.length > 0 || project.traffic.popularPaths.length > 0) && (
                        <div className="mt-5 grid grid-cols-1 gap-4 pt-4">
                          {project.traffic.referrers.length > 0 && (
                            <TrafficList title="Top referrers" items={project.traffic.referrers.slice(0, 5).map((item) => ({ label: item.referrer, count: item.count, unique: item.uniques }))} />
                          )}
                          {project.traffic.popularPaths.length > 0 && (
                            <TrafficList title="Popular pages" items={project.traffic.popularPaths.slice(0, 5).map((item) => ({ label: item.title || item.path, count: item.count, unique: item.uniques }))} />
                          )}
                        </div>
                      )}
                      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
                        Aggregate counts only. GitHub does not expose visitor identities.
                      </p>
                    </>
                  ) : (
                    <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
                      {project.trafficUnavailableMessage || "Traffic analytics are unavailable."}
                    </p>
                  )}
                </section>

                <section className="rounded-[26px] bg-white p-5 shadow-[0_12px_40px_-32px_rgba(15,23,42,0.3)] sm:rounded-[30px] sm:p-7 lg:p-8">
                  <SectionHeading
                    icon={<Rocket size={16} />}
                    eyebrow="Delivery"
                    title="Production & CI"
                    detail="Deployments published to GitHub"
                  />
                  {project.production ? (
                    <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-slate-900">{project.production.environment} deployment</span>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusColor(project.production.state)}`}>
                          {project.production.state.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        {formatDate(project.production.createdAt, true)} · {project.production.ref}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-slate-400">{project.production.sha.slice(0, 12)}</p>
                      <div className="mt-2 flex gap-3">
                        {project.production.url && (
                          <a href={project.production.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700">
                            Visit site <ArrowUpRight size={11} />
                          </a>
                        )}
                        {project.production.logUrl && (
                          <a href={project.production.logUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                            Deployment log <ArrowUpRight size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
                      No GitHub deployment found. Other hosting providers are not shown unless they publish deployments to GitHub.
                    </p>
                  )}

                  {project.workflows.length > 0 && (
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.07em] text-slate-400">GitHub Actions</p>
                      <div className="space-y-1">
                        {project.workflows.map((workflow) => (
                          <a key={workflow.id} href={workflow.html_url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-slate-50">
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${statusColor(workflow.conclusion ?? workflow.status)}`}>
                              {workflow.conclusion === "success" ? <Check size={13} /> : workflow.conclusion === "failure" ? <X size={13} /> : <Activity size={13} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-semibold text-slate-700">{workflow.name}</span>
                              <span className="mt-0.5 block truncate text-[10px] text-slate-400">{workflow.head_branch} · {formatDate(workflow.created_at, true)}</span>
                            </span>
                            <ArrowUpRight size={12} className="shrink-0 text-slate-400" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {project.deployments.length > 0 && (
                    <details className="mt-4 border-t border-slate-100 pt-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between text-[12px] font-semibold text-slate-600">
                        Deployment history <ChevronDown size={13} />
                      </summary>
                      <div className="mt-2">
                        {project.deployments.map((deployment) => (
                          <div key={deployment.id} className="py-2">
                            <div className="flex justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-slate-700">{deployment.environment}</span>
                              <span className="text-slate-400">{formatDate(deployment.created_at, true)}</span>
                            </div>
                            <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{deployment.ref} · {deployment.sha.slice(0, 10)}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </section>

                <section className="rounded-[26px] bg-white p-5 shadow-[0_12px_40px_-32px_rgba(15,23,42,0.3)] sm:rounded-[30px] sm:p-7 lg:p-8">
                  <SectionHeading
                    icon={<FileCode2 size={16} />}
                    eyebrow="Codebase"
                    title="Languages & branches"
                    detail={`${project.branches.length} branches`}
                  />
                  {languages.length > 0 ? (
                    <>
                      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-100">
                        {languages.map((language) => (
                          <span key={language.name} className="h-full first:rounded-l-full last:rounded-r-full" title={`${language.name} ${language.percent.toFixed(1)}%`} style={{ width: `${language.percent}%`, backgroundColor: languageColor(language.name) }} />
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                        {languages.map((language) => (
                          <span key={language.name} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: languageColor(language.name) }} />
                            {language.name} <span className="text-slate-400">{language.percent.toFixed(1)}%</span>
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-[11px] text-slate-400">No language data available.</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-1.5 pt-4">
                    {project.branches.map((branch) => (
                      <span key={branch.name} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-medium text-slate-600">
                        <GitBranch size={10} /> {branch.name}
                        {branch.protected && <LockKeyhole size={9} className="text-amber-700" />}
                      </span>
                    ))}
                    {project.branches.length === 0 && <span className="text-[11px] text-slate-400">No branches returned.</span>}
                  </div>
                </section>

                <section className="rounded-[26px] bg-white p-5 shadow-[0_12px_40px_-32px_rgba(15,23,42,0.3)] sm:rounded-[30px] sm:p-7 lg:p-8">
                  <div className="flex items-start justify-between gap-2">
                    <SectionHeading
                      icon={<FileCode2 size={16} />}
                      eyebrow="Source"
                      title="Project structure"
                      detail={`Default branch · ${project.repository.defaultBranch}`}
                    />
                    {tree.length > 0 && (
                      <span className="shrink-0 pt-1 font-mono text-[11px] text-slate-400">{formatCount(tree.length)} items</span>
                    )}
                  </div>
                  {treeLoading ? (
                    <div role="status" className="mt-4 space-y-2">
                      {[0, 1, 2, 3].map((item) => <div key={item} className="h-7 animate-pulse rounded bg-slate-100" />)}
                    </div>
                  ) : treeError ? (
                    <p className="mt-3 text-[12px] leading-relaxed text-red-700">{treeError}</p>
                  ) : tree.length === 0 ? (
                    <p className="mt-3 text-[12px] text-slate-400">No files on the default branch.</p>
                  ) : (
                    <>
                      <div className="mt-3 max-h-[390px] overflow-y-auto">
                        {tree.slice(0, 300).map((entry) => {
                          const depth = Math.min(entry.path.split("/").length - 1, 4);
                          const name = entry.path.split("/").at(-1) || entry.path;
                          return (
                            <div key={entry.path} className="flex min-w-0 items-center gap-2 py-2" style={{ paddingLeft: `${depth * 13}px` }}>
                              <span className={`shrink-0 ${entry.type === "tree" ? "text-amber-500" : "text-slate-400"}`}>
                                {entry.type === "tree" ? <FolderIcon /> : <FileCode2 size={13} />}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">{name}</span>
                              {entry.type === "blob" && entry.size !== null && (
                                <span className="shrink-0 text-[10px] text-slate-400">{entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(1)} KB`}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {(treeTruncated || tree.length > 300) && (
                        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                          Showing up to 300 entries. Open GitHub for the complete tree.
                        </p>
                      )}
                    </>
                  )}
                </section>
              </aside>
            </div>

            <footer className="mx-auto mt-5 flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-2 px-1 text-[11px] leading-relaxed text-slate-400">
              <span className="inline-flex items-center gap-1.5"><Github size={12} /> Live data from GitHub API</span>
              <span>Traffic is aggregate-only · 14-day window · no visitor identities</span>
            </footer>
          </>
        ) : summaryLoading ? (
          <div role="status" className="mx-auto grid w-full max-w-[1680px] grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse bg-white/50" />)}
          </div>
        ) : (
          <div className="mx-auto max-w-[1680px] rounded-[28px] bg-white px-5 py-12 text-center shadow-sm">
            <Github size={25} className="mx-auto text-slate-400" />
            <p className="mt-3 text-[13px] font-semibold text-slate-900">Project details unavailable</p>
            <Link href={`/${uid}/profile/settings`} className="mt-3 inline-block text-[11px] font-semibold text-indigo-700 underline">Check GitHub connection</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 py-3.5">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 sm:text-[12px]">{icon}{label}</span>
      <span className="mt-1.5 block truncate text-[18px] font-bold tabular-nums text-slate-900 sm:text-[20px]">{value}</span>
    </div>
  );
}

function SectionHeading({
  icon,
  eyebrow,
  title,
  detail,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[.11em] text-slate-400">{eyebrow}</p>
        <h2 className="mt-0.5 text-[17px] font-bold tracking-tight text-slate-900 sm:text-[19px]">{title}</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500 sm:text-[12px]">{detail}</p>
      </div>
    </div>
  );
}

function ChartStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "green" | "red";
}) {
  const color = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-rose-600" : "text-slate-900";
  return (
    <div>
      <p className="truncate text-[11px] text-slate-500 sm:text-[12px]">{label}</p>
      <p className={`mt-1 text-[21px] font-bold tracking-tight tabular-nums sm:text-[23px] ${color}`}>{formatCount(value)}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />{label}
    </span>
  );
}

function CommitChart({
  commits,
  maxValue,
}: {
  commits: CommitRecord[];
  maxValue: number;
}) {
  const width = 720;
  const height = 184;
  const padX = 40;
  const padY = 12;
  const step = commits.length > 1 ? (width - padX * 2) / commits.length : width / 2;
  const barWidth = Math.max(4, Math.min(13, step * 0.48));
  const baseline = height - 21;
  const chartHeight = baseline - padY;
  const ticks = [0, 0.5, 1];

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Chart showing code additions and deletions across ${commits.length} commits`} className="h-[150px] w-full overflow-visible sm:h-[190px]">
        <defs>
          <linearGradient id="commitAddGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity=".95" />
            <stop offset="100%" stopColor="#34d399" stopOpacity=".68" />
          </linearGradient>
          <linearGradient id="commitDeleteGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fb7185" stopOpacity=".92" />
            <stop offset="100%" stopColor="#fda4af" stopOpacity=".62" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = baseline - chartHeight * tick;
          return (
            <g key={tick}>
              <line
                x1={padX}
                x2={width - padX}
                y1={y}
                y2={y}
                stroke="#e9edf3"
                strokeDasharray={tick === 0 ? undefined : "3 5"}
              />
              <text
                x={padX - 7}
                y={y + 3}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="8"
              >
                {formatCount(Math.round(maxValue * tick))}
              </text>
            </g>
          );
        })}
        {commits.map((commit, index) => {
          const center = commits.length === 1 ? width / 2 : padX + step * index + step / 2;
          const addedHeight = Math.max(commit.additions > 0 ? 2 : 0, (commit.additions / maxValue) * chartHeight);
          const deletedHeight = Math.max(commit.deletions > 0 ? 2 : 0, (commit.deletions / maxValue) * chartHeight);
          const showDate = commits.length <= 8 || index % Math.ceil(commits.length / 6) === 0;
          return (
            <g key={commit.sha}>
              <title>{`${commit.message.split("\n")[0]}: +${commit.additions} / -${commit.deletions} lines · ${formatDate(commit.date)}`}</title>
              <rect x={center - barWidth - 1} y={baseline - addedHeight} width={barWidth} height={addedHeight} rx="3" fill="url(#commitAddGradient)" />
              <rect x={center + 1} y={baseline - deletedHeight} width={barWidth} height={deletedHeight} rx="3" fill="url(#commitDeleteGradient)" />
              {showDate && (
                <text x={center} y={height - 4} textAnchor="middle" fill="#94a3b8" fontSize="8">
                  {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(commit.date))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>Older commits</span><span>Most recent</span>
      </div>
    </div>
  );
}

function TrafficTotal({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div>
      <p className="text-[11px] text-slate-500 sm:text-[12px]">{label}</p>
      <p className="mt-1 text-[20px] font-bold tracking-tight tabular-nums text-slate-900 sm:text-[22px]">{formatCount(value)}</p>
    </div>
  );
}

function TrafficChart({
  days,
  max,
}: {
  days: Array<{ timestamp: string; count: number; uniques: number }>;
  max: number;
}) {
  const width = 360;
  const height = 120;
  const padX = 4;
  const padY = 9;
  const baseY = 94;
  const usableHeight = baseY - padY;
  const points = days.map((day, index) => {
    const x = days.length === 1 ? width / 2 : padX + (index / (days.length - 1)) * (width - 2 * padX);
    const y = baseY - (day.count / max) * usableHeight;
    return { ...day, x, y };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area = points.length ? `${line} L ${points.at(-1)!.x} ${baseY} L ${points[0].x} ${baseY} Z` : "";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-600">Daily views</span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />Views</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="GitHub repository views by day over the last 14 days" className="h-[112px] w-full overflow-visible">
        <defs>
          <linearGradient id="trafficAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity=".25" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((tick) => {
          const y = baseY - usableHeight * tick;
          return <line key={tick} x1={padX} x2={width - padX} y1={y} y2={y} stroke="#edf0f5" strokeDasharray={tick ? "3 5" : undefined} />;
        })}
        {area && <path d={area} fill="url(#trafficAreaGradient)" />}
        {line && <path d={line} fill="none" stroke="#6875e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((point) => (
          <g key={point.timestamp}>
            <title>{`${formatDate(point.timestamp)}: ${point.count} views · ${point.uniques} unique`}</title>
            <circle cx={point.x} cy={point.y} r="3.5" fill="white" stroke="#6875e8" strokeWidth="2" />
          </g>
        ))}
        {points.length > 0 && [points[0], points[Math.floor((points.length - 1) / 2)], points.at(-1)!].map((point) => (
          <text key={`label-${point.timestamp}`} x={point.x} y="114" textAnchor="middle" fill="#94a3b8" fontSize="8">
            {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(point.timestamp))}
          </text>
        ))}
      </svg>
    </div>
  );
}

function TrafficBars({
  days,
  color,
}: {
  days: Array<{ timestamp: string; count: number; uniques: number }>;
  color: string;
}) {
  const max = Math.max(...days.map(({ count }) => count), 1);
  return (
    <div className="flex h-14 items-end gap-1">
      {days.map((day) => (
        <span key={day.timestamp} className="group relative flex h-full flex-1 items-end">
          <span title={`${formatDate(day.timestamp)}: ${day.count} clones`} className={`w-full rounded-t-[3px] ${color} opacity-75 transition-opacity group-hover:opacity-100`} style={{ height: `${Math.max(day.count ? 5 : 2, (day.count / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

function TrafficList({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; count: number; unique: number }>;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold text-slate-500">{title}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-2 text-[10px] sm:text-[11px]">
            <span className="min-w-0 truncate text-slate-600" title={item.label}>{item.label}</span>
            <span className="shrink-0 tabular-nums text-slate-400">{item.count} · {item.unique} unique</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.75 2.75A1.75 1.75 0 0 1 3.5 1h3.2c.46 0 .9.18 1.23.51l1.26 1.26c.1.1.23.15.37.15h2.94a1.75 1.75 0 0 1 1.75 1.75v7.58A1.75 1.75 0 0 1 12.5 14h-9a1.75 1.75 0 0 1-1.75-1.75V2.75Z" />
    </svg>
  );
}
