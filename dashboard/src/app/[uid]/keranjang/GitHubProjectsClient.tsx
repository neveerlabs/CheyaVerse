"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  Search,
  Star,
  X,
} from "lucide-react";

type Repository = {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  visibility: "public" | "private";
  fork: boolean;
  stars: number;
  forks: number;
  language: string | null;
  defaultBranch: string;
  updatedAt: string;
  pushedAt: string | null;
  activity: {
    commitsLastMonth: number;
    commitsLastMonthCapped: boolean;
    commitActivityRange: "30d" | "all";
    commitActivityCount: number;
    commitActivityCapped: boolean;
    commitActivity: Array<{
      sha: string;
      url: string;
      message: string;
      date: string;
      additions: number;
      deletions: number;
      changedLines: number;
    }>;
    additions: number;
    deletions: number;
    measuredCommits: number;
    averageLinesChanged: number;
  };
};

type RepositoriesResponse = {
  repositories?: Repository[];
  page?: number;
  hasMore?: boolean;
  totalCount?: number | null;
  error?: string;
  code?: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date)
    : "Unknown";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function ProjectActivityChart({
  activity,
  commitActivityRange,
  commitActivityCount,
  commitActivityCapped,
}: {
  activity: Repository["activity"]["commitActivity"];
  commitActivityRange: Repository["activity"]["commitActivityRange"];
  commitActivityCount: number;
  commitActivityCapped: boolean;
}) {
  if (!activity.length) {
    return <p className="text-[9px] text-ink-mute">No commit history</p>;
  }
  const width = 260;
  const height = 42;
  const maximum = Math.max(
    1,
    ...activity.map((commit) => Math.log1p(commit.changedLines)),
  );
  const firstCommitTime = Date.parse(activity[0].date);
  const now = Date.now();
  const historySpan = Math.max(1, now - firstCommitTime);
  const points = activity.map((commit, index) => {
    const commitTime = Date.parse(commit.date);
    return {
      commit,
      x:
        commitActivityRange === "all" && Number.isFinite(commitTime)
          ? 2 + (Math.max(0, commitTime - firstCommitTime) / historySpan) * (width - 4)
          : activity.length === 1
            ? width / 2
            : 2 + (index / (activity.length - 1)) * (width - 4),
      y: height - 5 - (Math.log1p(commit.changedLines) / maximum) * 27,
    };
  });
  const lastCommitTime = Date.parse(activity[activity.length - 1].date);
  const showInactivePeriod =
    commitActivityRange === "all" &&
    Number.isFinite(lastCommitTime) &&
    now - lastCommitTime > 30 * 24 * 60 * 60 * 1000;
  const linePoints = showInactivePeriod
    ? [
        ...points,
        { x: points[points.length - 1].x, y: height - 5 },
        { x: width - 2, y: height - 5 },
      ]
    : points;
  const line = linePoints.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `${linePoints[0].x},${height} ${line} ${linePoints[linePoints.length - 1].x},${height}`;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-0.5 flex items-center justify-between gap-2 text-[8px]">
        <span className="font-medium text-ink-mute">Velocity trend</span>
        <span className="text-ink-mute">
          {commitActivityRange === "all"
            ? `${formatNumber(commitActivityCount)} · all-time`
            : `${formatNumber(commitActivityCount)} commits · 30d${commitActivityCapped ? " · latest 1,000" : ""}`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${commitActivityCount} ${commitActivityRange === "all" ? "commits in repository history, grouped by month" : "commits in the last 30 days"}${commitActivityCapped ? "; chart limited to the latest 1,000 commits" : ""}; each point shows changed lines`}
        className="block h-[30px] w-full"
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
          <circle key={commit.sha} cx={x} cy={y} r="1.5" fill="#a995c5">
            <title>{`${formatDate(commit.date)} · ${commit.message} · +${formatNumber(commit.additions)} / −${formatNumber(commit.deletions)} lines`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export function GitHubProjectsClient({ uid }: { uid: string }) {
  const pathname = usePathname();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [needsGitHubConnection, setNeedsGitHubConnection] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (nextPage: number, append: boolean, query = activeSearch) => {
      const currentRequestId = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      setNeedsGitHubConnection(false);
      try {
        const params = new URLSearchParams({ page: String(nextPage) });
        if (query) params.set("q", query);
        const repositoriesUrl = `/api/github/repos?${params}`;
        let credentialConfirmed = false;
        let response = await fetch(repositoriesUrl, {
          cache: "no-store",
        });
        let result = await readApiJson<RepositoriesResponse>(response);
        if (response.status === 409 && result.code === "GITHUB_NOT_CONNECTED") {
          const settingsResponse = await fetch("/api/github/settings", {
            cache: "no-store",
          });
          if (settingsResponse.ok) {
            const settings = await readApiJson<{
              connected?: boolean;
              tokenReadable?: boolean | null;
            }>(settingsResponse);
            if (settings.connected === true && settings.tokenReadable === true) {
              credentialConfirmed = true;
              for (const delay of [250, 500, 1000, 2000]) {
                await new Promise((resolve) => window.setTimeout(resolve, delay));
                if (currentRequestId !== requestId.current) return;
                response = await fetch(repositoriesUrl, { cache: "no-store" });
                result = await readApiJson<RepositoriesResponse>(response);
                if (
                  response.status !== 409 ||
                  result.code !== "GITHUB_NOT_CONNECTED"
                ) {
                  break;
                }
              }
            }
          }
        }
        if (!response.ok || !Array.isArray(result.repositories)) {
          if (
            currentRequestId === requestId.current &&
            credentialConfirmed &&
            response.status === 409 &&
            result.code === "GITHUB_NOT_CONNECTED"
          ) {
            void fetch("/api/feedback/incident", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kind: "github-credential-mismatch",
                endpoint: "/api/github",
                method: "GET",
                status: 409,
              }),
              cache: "no-store",
            })
              .then((incidentResponse) => {
                if (!incidentResponse.ok) {
                  throw new Error(
                    `GitHub incident alert failed with HTTP ${incidentResponse.status}.`,
                  );
                }
              })
              .catch((cause: unknown) => {
                console.error("[github/projects] incident alert failed:", cause);
              });
          }
          setNeedsGitHubConnection(
            !credentialConfirmed &&
              response.status === 409 &&
              ["GITHUB_NOT_CONNECTED", "GITHUB_RECONNECT_REQUIRED"].includes(
                result.code ?? "",
              ),
          );
          throw new Error(
            credentialConfirmed && result.code === "GITHUB_NOT_CONNECTED"
              ? "GitHub token is saved and readable, but the projects service cannot access it yet. Retry in a moment or reconnect GitHub in Settings."
              : result.error || "GitHub projects could not be loaded.",
          );
        }
        if (currentRequestId !== requestId.current) return;
        setRepositories((current) =>
          append ? [...current, ...result.repositories!] : result.repositories!,
        );
        setPage(result.page ?? nextPage);
        setHasMore(result.hasMore === true);
        setTotalCount(result.totalCount ?? null);
      } catch (cause) {
        if (currentRequestId !== requestId.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "GitHub projects could not be loaded.",
        );
      } finally {
        if (currentRequestId === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [activeSearch],
  );

  useEffect(() => {
    if (pathname === `/${uid}/project`) {
      void load(1, false, activeSearch);
    }
  }, [activeSearch, load, pathname, uid]);

  return (
    <section className="animate-fade-up">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-ink-mute">
            Repositories
          </p>
          <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-ink">
            {loading
              ? "Loading projects…"
              : activeSearch && totalCount !== null
                ? `${new Intl.NumberFormat("en-US").format(totalCount)} results`
                : `${repositories.length} projects`}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Refresh repositories"
          disabled={loading}
          onClick={() => void load(1, false, activeSearch)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-soft transition-colors hover:bg-[#f7f7f8] disabled:opacity-45"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setActiveSearch(searchInput.trim());
        }}
        className="mb-4 flex h-12 items-center gap-2.5 rounded-2xl border border-line bg-white px-3.5 shadow-[0_5px_20px_-18px_rgba(0,0,0,.25)] focus-within:border-[#b7b7bd] focus-within:ring-2 focus-within:ring-slate-100"
      >
        <Search size={17} className="shrink-0 text-ink-mute" />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search repositories by name or description"
          aria-label="Search GitHub repositories"
          className="min-w-0 flex-1 appearance-none bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-mute [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        />
        {searchInput && (
          <button
            type="button"
            aria-label="Clear repository search"
            onClick={() => {
              setSearchInput("");
              setActiveSearch("");
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-mute hover:bg-[#f3f4f6]"
          >
            <X size={14} />
          </button>
        )}
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-ink px-3 py-2 text-[10px] font-semibold text-white transition-opacity hover:opacity-85"
        >
          Search
        </button>
      </form>

      {activeSearch && !loading && !error && totalCount !== null && (
        <p className="mb-3 px-1 text-[10px] text-ink-mute">
          {new Intl.NumberFormat("en-US").format(totalCount)} matching repositories
        </p>
      )}

      {error && (
        <div className="mb-5 rounded-[20px] border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Github size={18} className="mt-0.5 shrink-0 text-amber-800" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-amber-950">
                Projects unavailable
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-900">
                {error}
              </p>
              {needsGitHubConnection && (
                <Link
                  href={`/${uid}/profile/settings`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-950 px-3.5 py-2 text-[11px] font-semibold text-white"
                >
                  Open Settings <ArrowRight size={13} />
                </Link>
              )}
              {!needsGitHubConnection && (
                <button
                  type="button"
                  onClick={() => void load(1, false, activeSearch)}
                  className="mt-3 rounded-full bg-amber-950 px-3.5 py-2 text-[11px] font-semibold text-white"
                >
                  Try again
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {loading && repositories.length === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-[166px] animate-pulse rounded-[22px] border border-line bg-[#f7f7f8]"
            />
          ))}
        </div>
      )}

      {!loading && !error && repositories.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-line-strong bg-[#fafafa] px-5 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[17px] bg-white text-ink">
            <Github size={22} />
          </span>
          <h3 className="mt-4 text-[14px] font-semibold text-ink">
            {activeSearch ? "No matching repositories" : "No repositories found"}
          </h3>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[11.5px] leading-relaxed text-ink-mute">
            {activeSearch
              ? "Coba kata kunci lain untuk mencari repository."
              : "Token GitHub tersambung, tetapi tidak ada repository yang dapat diakses. Classic token memerlukan scope repo untuk repository private; repository organisasi mungkin juga memerlukan otorisasi SSO."}
          </p>
          <Link
            href={`/${uid}/profile/settings`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2.5 text-[11px] font-semibold text-ink-soft"
          >
            Review GitHub Settings <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {repositories.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {repositories.map((repository) => (
            <article
              key={repository.id}
              className="group min-w-0 overflow-hidden rounded-[22px] border border-black/[.055] bg-white shadow-[0_7px_26px_-22px_rgba(15,23,42,.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_34px_-22px_rgba(15,23,42,.3)]"
            >
              <Link
                href={`/${uid}/project/${encodeURIComponent(repository.fullName.split("/")[0])}/${encodeURIComponent(repository.name)}`}
                className="block p-3 sm:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Github size={15} className="shrink-0 text-ink-mute" />
                    <h3 className="truncate text-[12px] font-semibold text-indigo-700 group-hover:underline">
                      {repository.fullName}
                    </h3>
                    <ArrowRight
                      size={12}
                      className="shrink-0 text-ink-mute transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-wide ${
                      repository.visibility === "private"
                        ? "bg-[#f3f3f4] text-ink-soft"
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
                <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-ink-mute">
                  {repository.description || "No project description provided."}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f7f7f8] px-2 py-1 text-[9px] font-medium text-ink-soft">
                    {repository.language || "Unknown"}
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1 truncate text-[9px] text-ink-mute">
                    <GitBranch size={10} /> {repository.defaultBranch}
                  </span>
                  <span className="ml-auto shrink-0 text-[9px] text-ink-mute">
                    {formatDate(repository.pushedAt || repository.updatedAt)}
                  </span>
                </div>
                <div className="mt-2">
                  <ProjectActivityChart
                    activity={repository.activity.commitActivity}
                    commitActivityRange={repository.activity.commitActivityRange}
                    commitActivityCount={repository.activity.commitActivityCount}
                    commitActivityCapped={repository.activity.commitActivityCapped}
                  />
                </div>
                <div
                  className="mt-2 border-t border-[#f0f0f2] pt-2"
                  style={{
                    maskImage:
                      "linear-gradient(90deg, transparent, black 4%, black 96%, transparent)",
                    WebkitMaskImage:
                      "linear-gradient(90deg, transparent, black 4%, black 96%, transparent)",
                  }}
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9px] text-ink-mute">
                    <span className="inline-flex items-center gap-1">
                      <GitCommitHorizontal size={10} />
                      {formatNumber(repository.activity.commitsLastMonth)} commits / 30d
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GitFork size={10} /> {formatNumber(repository.forks)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Star size={10} /> {formatNumber(repository.stars)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Activity size={10} />
                      {repository.activity.measuredCommits > 0
                        ? `~${formatNumber(Math.round(repository.activity.averageLinesChanged))} lines / commit`
                        : "Change data unavailable"}
                    </span>
                  </div>
                  {repository.activity.commitActivity.at(-1) && (
                    <p className="mt-1 block truncate text-[9px] font-medium text-slate-700">
                      {repository.activity.commitActivity.at(-1)!.message ||
                        "Latest commit"}
                    </p>
                  )}
                  {repository.activity.measuredCommits > 0 && (
                    <p className="mt-1 text-[8px] text-ink-mute">
                      +{formatNumber(repository.activity.additions)} / −
                      {formatNumber(repository.activity.deletions)} lines
                      {repository.activity.commitsLastMonthCapped
                        ? " · latest 1,000 commits measured"
                        : ""}
                    </p>
                  )}
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void load(page + 1, true, activeSearch)}
          className="mt-5 w-full rounded-2xl border border-line bg-white px-4 py-3 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-[#fafafa] disabled:opacity-50"
        >
          {loadingMore ? "Loading more…" : "Load more repositories"}
        </button>
      )}
    </section>
  );
}
