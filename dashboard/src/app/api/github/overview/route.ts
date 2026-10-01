import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth-request";
import {
  getGitHubMessage,
  getGitHubResponseError,
  getGitHubToken,
  githubFetch,
  githubJson,
  GitHubApiError,
  hasNextLink,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_ACTIVITY_LIMIT = 12;
const ACTIVITY_CONCURRENCY = 6;

type Repository = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  fork: boolean;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  default_branch: string;
  updated_at: string;
  pushed_at: string | null;
};

type CommitSummary = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  author: { login: string } | null;
};

type CommitActivityWeek = { week: number; total: number };

type ProjectActivity = {
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

async function getWeeklyActivity(
  token: string,
  owner: string,
  repository: string,
): Promise<number[] | null> {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/stats/commit_activity`;
  const response = await githubFetch(token, path);

  if (response.status === 202) return null;
  if (response.status === 204 || response.status === 404) return [];
  if (!response.ok) throw await getGitHubResponseError(response);

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new GitHubApiError("GitHub returned invalid commit activity data.", 502);
  }
  const weeks = payload
    .map((item): CommitActivityWeek => {
      if (typeof item !== "object" || item === null) {
        throw new GitHubApiError("GitHub returned invalid commit activity data.", 502);
      }
      const row = item as Record<string, unknown>;
      if (
        typeof row.week !== "number" ||
        !Number.isSafeInteger(row.week) ||
        row.week <= 0 ||
        typeof row.total !== "number" ||
        !Number.isFinite(row.total) ||
        row.total < 0
      ) {
        throw new GitHubApiError("GitHub returned invalid commit activity data.", 502);
      }
      return { week: row.week, total: row.total };
    })
    .sort((a, b) => a.week - b.week)
    .slice(-52);
  const counts = weeks.map((item) => Math.floor(item.total));
  return [...Array(Math.max(0, 52 - counts.length)).fill(0), ...counts];
}

async function loadProjectActivity(
  token: string,
  repository: Repository,
): Promise<ProjectActivity> {
  const [weeklyActivity, commitSummaries] = await Promise.all([
    getWeeklyActivity(token, repository.full_name.split("/")[0], repository.name),
    githubJson<CommitSummary[]>(
      token,
      `/repos/${encodeURIComponent(repository.full_name.split("/")[0])}/${encodeURIComponent(repository.name)}/commits?per_page=3`,
    ).then(({ data }) => data).catch((error: unknown) => {
      if (error instanceof GitHubApiError && error.status === 409) return [];
      throw error;
    }),
  ]);
  const latest = commitSummaries[0];
  const latestCommit: ProjectActivity["latestCommit"] = latest
    ? {
        sha: latest.sha,
        url: latest.html_url,
        message: latest.commit.message,
        author:
          latest.author?.login ||
          latest.commit.author?.name ||
          "Unknown author",
        date: latest.commit.author?.date ?? repository.pushed_at ?? "",
      }
    : null;

  return {
    repository: {
      id: repository.id,
      name: repository.name,
      fullName: repository.full_name,
      url: repository.html_url,
      description: repository.description,
      visibility: repository.private ? "private" : "public",
      language: repository.language,
      defaultBranch: repository.default_branch,
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      pushedAt: repository.pushed_at,
    },
    history: {
      weeklyActivity,
      commitsLastYear: weeklyActivity?.reduce((sum, count) => sum + count, 0) ?? 0,
      commitsLastFiveWeeks:
        weeklyActivity?.slice(-5).reduce((sum, count) => sum + count, 0) ?? 0,
    },
    latestCommit,
  };
}

async function loadActivities(
  token: string,
  repositories: Repository[],
): Promise<ProjectActivity[]> {
  const projects: ProjectActivity[] = [];
  for (let index = 0; index < repositories.length; index += ACTIVITY_CONCURRENCY) {
    const group = repositories.slice(index, index + ACTIVITY_CONCURRENCY);
    const loaded = await Promise.all(
      group.map(async (repository) => {
        try {
          return await loadProjectActivity(token, repository);
        } catch (error) {
          if (
            error instanceof GitHubApiError &&
            [404, 409].includes(error.status)
          ) {
            return null;
          }
          throw error;
        }
      }),
    );
    projects.push(...loaded.filter((project): project is ProjectActivity => project !== null));
  }
  return projects;
}

export async function GET(request: NextRequest) {
  const session = await getUserSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const token = await getGitHubToken(session.uid);
    if (!token) {
      return NextResponse.json(
        { error: "Connect a GitHub account in Settings to show project activity." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: repositories, response } = await githubJson<Repository[]>(
      token,
      "/user/repos?sort=pushed&direction=desc&per_page=100&page=1&affiliation=owner",
    );
    const candidates = repositories
      .sort((a, b) =>
        (b.pushed_at ?? b.updated_at).localeCompare(
          a.pushed_at ?? a.updated_at,
        ),
      )
      .slice(0, PROJECT_ACTIVITY_LIMIT);
    const activities = await loadActivities(token, candidates);
    const accountActivity = Array.from({ length: 52 }, (_, index) => ({
      week: index,
      commits: activities.reduce(
        (sum, project) =>
          sum + (project.history.weeklyActivity?.[index] ?? 0),
        0,
      ),
    }));
    const now = Date.now();
    const activeThisMonth = repositories.filter(
      (project) =>
        project.pushed_at &&
        now - new Date(project.pushed_at).getTime() <=
          30 * 24 * 60 * 60 * 1000,
    ).length;
    const stats = {
      repositories: repositories.length,
      stars: repositories.reduce((total, repository) => total + repository.stargazers_count, 0),
      forks: repositories.reduce((total, repository) => total + repository.forks_count, 0),
      activeThisMonth,
      commitsLastYear: accountActivity.reduce((sum, week) => sum + week.commits, 0),
      commitsLastFiveWeeks: accountActivity.slice(-5).reduce((sum, week) => sum + week.commits, 0),
      repositoriesWithHistory: activities.filter(
        (project) => project.history.weeklyActivity !== null,
      ).length,
      hasMore: hasNextLink(response.headers.get("link")),
    };
    const popular = [...activities].sort(
      (a, b) =>
        b.history.commitsLastYear - a.history.commitsLastYear ||
        b.history.commitsLastFiveWeeks - a.history.commitsLastFiveWeeks ||
        (b.repository.pushedAt ?? "").localeCompare(a.repository.pushedAt ?? ""),
    );

    return NextResponse.json(
      { stats, accountActivity, projects: activities, popular },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = error instanceof GitHubApiError ? error.status : 502;
    if (!(error instanceof GitHubApiError)) {
      console.error("[github/overview] failed to load project overview:", error);
    }
    return NextResponse.json(
      { error: getGitHubMessage(error) },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
