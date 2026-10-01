"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowDownRight,
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

type Activity = {
  repository: Project;
  commit: {
    sha: string;
    url: string;
    message: string;
    author: string;
    date: string;
    additions: number;
    deletions: number;
    changedFiles: number;
  };
};

type Overview = {
  account: { login: string | null };
  stats: {
    repositories: number;
    stars: number;
    forks: number;
    activeThisMonth: number;
    hasMore: boolean;
  };
  latestActivity: Activity[];
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

export function GitHubHomeDashboard({ uid }: { uid: string }) {
  const pathname = usePathname();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestController = useRef<AbortController | null>(null);

  const loadOverview = useCallback(async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/github/overview", {
        cache: "no-store",
        signal: controller.signal,
      });
      const result = (await response.json()) as Overview & { error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 409) {
          setOverview(null);
          setError("Connect a GitHub account in Settings to show project activity.");
          return;
        }
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
    <section className="relative left-1/2 mt-8 w-screen -translate-x-1/2 px-4 sm:px-6">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-ink-mute">
              GitHub activity
            </p>
            <h2 className="mt-1 text-[21px] font-semibold tracking-[-.04em] text-ink">
              Your work, at a glance
            </h2>
            {overview?.account.login && (
              <p className="mt-1 truncate text-[11px] text-ink-mute">
                @{overview.account.login}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Refresh GitHub activity"
            disabled={loading}
            onClick={() => void loadOverview()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/[.06] bg-white text-ink-soft shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {error && (
          <div className="flex flex-col gap-4 rounded-[24px] border border-black/[.06] bg-white p-5 shadow-[0_10px_30px_-25px_rgba(15,23,42,.35)] sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#f3f4f6] text-ink">
                <Github size={19} />
              </span>
              <div>
                <h3 className="text-[14px] font-semibold text-ink">
                  {error.includes("Connect a GitHub")
                    ? "Bring your projects into CheyaVerse"
                    : "GitHub activity is unavailable"}
                </h3>
                <p className="mt-1 max-w-[540px] text-[12px] leading-relaxed text-ink-mute">
                  {error}
                </p>
              </div>
            </div>
            {error.includes("Connect a GitHub") ? (
              <Link
                href={`/${uid}/profile/settings`}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[11px] font-semibold text-white"
              >
                Connect GitHub <ArrowRight size={14} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void loadOverview()}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[11px] font-semibold text-white"
              >
                Try again <RefreshCw size={13} />
              </button>
            )}
          </div>
        )}

        {loading && !overview && !error && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-[92px] animate-pulse rounded-[20px] bg-[#f1f2f4]"
              />
            ))}
          </div>
        )}

        {overview && (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                {
                  label: "Repositories scanned",
                  value: formatNumber(overview.stats.repositories),
                  detail: overview.stats.hasMore
                    ? "First 100 accessible repos"
                    : "Accessible repositories",
                  icon: Github,
                },
                {
                  label: "Stars",
                  value: formatNumber(overview.stats.stars),
                  detail: "Across scanned repos",
                  icon: Star,
                },
                {
                  label: "Forks",
                  value: formatNumber(overview.stats.forks),
                  detail: "Across scanned repos",
                  icon: GitFork,
                },
                {
                  label: "Active this month",
                  value: formatNumber(overview.stats.activeThisMonth),
                  detail: "Repositories with a recent push",
                  icon: GitCommitHorizontal,
                },
              ].map(({ label, value, detail, icon: Icon }) => (
                <article
                  key={label}
                  className="min-w-0 rounded-[20px] border border-black/[.055] bg-white p-3.5 shadow-[0_8px_24px_-24px_rgba(15,23,42,.3)] sm:p-4"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-[#f4f5f6] text-ink-soft">
                    <Icon size={15} />
                  </span>
                  <p className="mt-3 text-[22px] font-semibold leading-none tracking-[-.04em] text-ink">
                    {value}
                  </p>
                  <p className="mt-1.5 truncate text-[10px] font-semibold text-ink-soft">
                    {label}
                  </p>
                  <p className="mt-0.5 truncate text-[9px] text-ink-mute">
                    {detail}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_.85fr]">
              <section className="min-w-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                      Latest repository updates
                    </h3>
                    <p className="mt-0.5 text-[10px] text-ink-mute">
                      The newest commits across your recently pushed projects
                    </p>
                  </div>
                  <Link
                    href={`/${uid}/keranjang`}
                    className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-ink-soft"
                  >
                    All projects <ArrowRight size={13} />
                  </Link>
                </div>
                {overview.latestActivity.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-line-strong bg-white p-6 text-center text-[11px] text-ink-mute">
                    No recent commits found in accessible repositories.
                  </div>
                ) : (
                  <div className="divide-y divide-black/[.055] overflow-hidden rounded-[22px] border border-black/[.055] bg-white">
                    {overview.latestActivity.map(({ repository, commit }) => (
                      <article
                        key={`${repository.id}:${commit.sha}`}
                        className="min-w-0 p-4 sm:p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              href={`/${uid}/keranjang/${encodeURIComponent(repository.fullName.split("/")[0])}/${encodeURIComponent(repository.name)}`}
                              className="truncate text-[12px] font-semibold text-ink hover:underline"
                            >
                              {repository.fullName}
                            </Link>
                            <a
                              href={commit.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 block truncate text-[11px] text-ink-soft hover:underline"
                            >
                              {commit.message.split("\n")[0]}
                            </a>
                          </div>
                          <span className="shrink-0 text-[9px] text-ink-mute">
                            {formatDate(commit.date)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-ink-mute">
                          <span>{commit.author}</span>
                          <span className="inline-flex items-center gap-1">
                            <GitBranch size={11} /> {repository.defaultBranch}
                          </span>
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <ArrowUpRight size={11} /> {commit.additions}
                          </span>
                          <span className="inline-flex items-center gap-1 text-rose-600">
                            <ArrowDownRight size={11} /> {commit.deletions}
                          </span>
                          <span>{commit.changedFiles} files</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="min-w-0">
                <div className="mb-3">
                  <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                    Popular projects
                  </h3>
                  <p className="mt-0.5 text-[10px] text-ink-mute">
                    Ranked by stars, then forks
                  </p>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                  {overview.popular.map((project) => (
                    <Link
                      key={project.id}
                      href={`/${uid}/keranjang/${encodeURIComponent(project.fullName.split("/")[0])}/${encodeURIComponent(project.name)}`}
                      className="group flex min-w-0 items-center gap-3 rounded-[18px] border border-black/[.055] bg-white p-3.5 shadow-[0_8px_24px_-24px_rgba(15,23,42,.3)]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-[#f3f4f6] text-ink">
                        <Github size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[11px] font-semibold text-ink">
                            {project.name}
                          </span>
                          {project.visibility === "private" && (
                            <LockKeyhole
                              size={11}
                              className="shrink-0 text-ink-mute"
                            />
                          )}
                        </span>
                        <span className="mt-1 flex items-center gap-2.5 text-[9px] text-ink-mute">
                          <span className="inline-flex items-center gap-1">
                            <Star size={10} /> {formatNumber(project.stars)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <GitFork size={10} /> {formatNumber(project.forks)}
                          </span>
                          {project.language && (
                            <span className="truncate">{project.language}</span>
                          )}
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-ink-mute transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  ))}
                  {overview.popular.length === 0 && (
                    <p className="rounded-[18px] border border-dashed border-line-strong bg-white p-5 text-[11px] text-ink-mute">
                      No accessible repositories to rank yet.
                    </p>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
